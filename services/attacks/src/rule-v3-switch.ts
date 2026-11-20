// The switch to agent rule v3 on a running local network, with real nodes and clients.
//   SEALED_RULE_V2_AT=0 SEALED_RULE_V3_AT=+150 SEALED_LOOSEN_DELAY=60 bash scripts/localnet.sh up
//   pnpm --filter attacks rule-v3-switch
// Before the switch (v2): an agent with a v2 mandate pays; a freeze proof with user presence only
// is signed and kept; an owner action whose clientDataJSON has whitespace is accepted;
// setMandateV3 does not exist yet. After it (blocks are produced until ruleVersion() answers 3):
//   1. ruleVersion() 3, loosenDelay() 60; the v2 mandate still pays; setMandateV2 is refused; the
//      whitespace clientDataJSON is refused;
//   2. setMandateV3 without user verification is refused; with it, a mixed change applies its
//      tightening at once and schedules the rest; a payment above the old cap is refused, then
//      goes in after the delay with no owner call;
//   3. the payment count and the payee cap are hit;
//   4. the freeze proof signed before the switch works; unfreeze; guardian set and guardian freeze;
//   5. a sweep is scheduled, refused before its time, carried out after it; getSpend's third value
//      is charged + swept;
//   6. every node has the same head.
// Local test keys only.
import {
  AGENT_POLICY_ADDRESS,
  agentFees,
  agentPaymentGas,
  agentPolicyAbi,
  cancelPendingRequest,
  domainV2,
  executeSweepData,
  freezeChallengeV2,
  guardianFreezeData,
  guardianFreezeDigest,
  LOCAL_PAYEES,
  type MandateInput,
  NO_PAYEE_CAP,
  readFreezeEpoch,
  setFrozenRequest,
  setGuardianRequest,
  setMandateRequest,
  sweepRequest,
} from "@sealed-arena/shared";
import { type Address, BaseError, encodeFunctionData, type Hex } from "viem";
import { generatePrivateKey, type PrivateKeyAccount, privateKeyToAccount } from "viem/accounts";
import {
  accounts,
  coin,
  freshAgent,
  type Node,
  nodes,
  ownerProof,
  policyIds,
  readPolicy,
  ruleVersion,
  sendAndWait,
  wallet,
} from "./localnet.js";

const all = nodes();
const first = all[0];
if (!first) throw new Error("no node");
const n: Node = first;
const payee = LOCAL_PAYEES[0] as Address;
const payee2 = LOCAL_PAYEES[1] as Address;
const rescue = "0x000000000000000000000000000000000000b0b0" as Address;

let failures = 0;
const check = (ok: boolean, what: string) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${what}`);
  if (!ok) failures++;
};

const errText = (e: unknown) => (e instanceof BaseError ? e.details || e.shortMessage : String(e));

/** Sends a payment from the agent; resolves to "included", "failed" or the node's agent error. */
async function pay(agent: PrivateKeyAccount, value: bigint, to: Address = payee): Promise<string> {
  const f = agentFees(await n.client.estimateFeesPerGas());
  try {
    const hash = await wallet(n, agent).sendTransaction({
      to,
      value,
      gas: agentPaymentGas(),
      maxFeePerGas: f.maxFeePerGas,
      maxPriorityFeePerGas: f.maxPriorityFeePerGas,
    });
    const r = await n.client.waitForTransactionReceipt({ hash });
    return r.status === "success" ? "included" : "failed";
  } catch (e) {
    const msg = errText(e);
    return /agent: [a-z -]+/.exec(msg)?.[0] ?? msg;
  }
}

/** Sends an AgentPolicy call from the relayer: "ok" or the revert reason. */
async function call(data: Hex): Promise<string> {
  try {
    await n.client.call({
      account: accounts.relayer.address,
      to: AGENT_POLICY_ADDRESS,
      data,
      gas: 3_000_000n,
    });
  } catch (e) {
    const msg = errText(e);
    return (
      /agentpolicy: [a-zA-Z0-9 ^-]+|invalid non-activated function selector/.exec(msg)?.[0] ?? msg
    );
  }
  await sendAndWait(n, accounts.relayer, { to: AGENT_POLICY_ADDRESS, data, gas: 3_000_000n });
  return "ok";
}

const read = <T>(functionName: string, args: readonly unknown[] = []) =>
  n.client.readContract({
    address: AGENT_POLICY_ADDRESS,
    abi: agentPolicyAbi,
    functionName,
    args,
  } as never) as Promise<T>;

const tick = () =>
  sendAndWait(n, accounts.admin, { to: accounts.admin.address, value: 0n, gas: 21_000n });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const spaced = (b64: string) => `{ "type": "webauthn.get", "challenge": "${b64}" }`;

async function owner(agent: Address) {
  const [v, ids, ownerNonce, freezeEpoch] = await Promise.all([
    ruleVersion(n),
    policyIds(n),
    readPolicy.ownerNonce(n, agent),
    readFreezeEpoch(n.client, agent),
  ]);
  return { v, ids, ownerNonce, freezeEpoch };
}

async function setMandate(
  agent: Address,
  m: MandateInput,
  flags = 0x05,
  clientData?: (b: string) => string,
) {
  const o = await owner(agent);
  const req = setMandateRequest(o.v, o.ids, agent, m, o.ownerNonce);
  return call(
    req.data(ownerProof(req.challenge, { flags, ...(clientData ? { clientData } : {}) })),
  );
}

async function main() {
  check((await ruleVersion(n)) === 2, "before the switch: rule v2");
  const expiry = BigInt(Math.floor(Date.now() / 1000) + 3 * 86_400);
  const a = await freshAgent(n, [payee, payee2], { perTxCap: coin(1) / 10n, dailyCap: coin(3) });
  check((await pay(a, coin(1) / 1000n)) === "included", "v2: the agent pays under its v2 mandate");

  // A freeze proof with user presence only, signed now and kept for after the switch.
  const ids = await policyIds(n);
  const domain = domainV2(ids.networkId, ids.blockchainId, ids.chainId);
  const epoch0 = await readFreezeEpoch(n.client, a.address);
  const keptFreeze = encodeFunctionData({
    abi: agentPolicyAbi,
    functionName: "freeze",
    args: [
      a.address,
      epoch0,
      ownerProof(freezeChallengeV2(domain, a.address, epoch0), { flags: 0x01 }),
    ],
  });
  const v2m: MandateInput = {
    payees: [payee, payee2],
    perTxCap: coin(1) / 10n,
    dailyCap: coin(3),
    expiry,
  };
  check(
    (await setMandate(a.address, v2m, 0x01, spaced)) === "ok",
    "v2: whitespace clientDataJSON accepted",
  );
  const pre = encodeFunctionData({ abi: agentPolicyAbi, functionName: "loosenDelay" });
  check(/non-activated/.test(await call(pre)), "v2: the v3 functions are not active");

  const deadline = Date.now() + 300_000;
  while ((await ruleVersion(n)) !== 3) {
    if (Date.now() > deadline) throw new Error("rule v3 did not activate within 300 s");
    await tick();
    await sleep(3000);
  }
  console.log("rule v3 active");

  // 1.
  check((await read<bigint>("loosenDelay")) === 60n, "v3: loosenDelay() is 60");
  check((await pay(a, coin(1) / 1000n)) === "included", "v3: the v2 mandate still pays");
  {
    const o = await owner(a.address);
    const req = setMandateRequest(2, o.ids, a.address, v2m, o.ownerNonce);
    check(
      (await call(req.data(ownerProof(req.challenge)))).includes("replaced by setMandateV3"),
      "v3: setMandateV2 is refused",
    );
  }
  check(
    (await setMandate(a.address, v2m, 0x05, spaced)).includes("clientDataJSON invalid"),
    "v3: whitespace clientDataJSON refused",
  );

  // 2.
  const base3: MandateInput = { ...v2m, dailyFeeCap: coin(1) / 10n, maxPaymentsPerDay: 50 };
  check(
    (await setMandate(a.address, base3, 0x01)).includes("user not verified"),
    "v3: setMandateV3 without UV refused",
  );
  // Mixed: dailyCap down (now), perTxCap up (after 60 s).
  const mixed: MandateInput = { ...base3, perTxCap: coin(1), dailyCap: coin(2) };
  check((await setMandate(a.address, mixed)) === "ok", "v3: setMandateV3 with UV");
  const [m3] = await read<readonly [{ perTxCap: bigint; dailyCap: bigint }, boolean]>(
    "getMandateV3",
    [a.address],
  );
  const pending = await read<readonly [unknown, bigint, Address, bigint]>("getPending", [
    a.address,
  ]);
  check(
    m3.dailyCap === coin(2) && m3.perTxCap === coin(1) / 10n,
    "v3: the tightening applies at once (meet)",
  );
  check(pending[1] > 0n, "v3: the loosening is scheduled");
  const big = coin(1) / 2n;
  check(
    (await pay(a, big)) === "agent: budget exceeded",
    "v3: a payment above the old perTxCap is refused",
  );
  while (BigInt(Math.floor(Date.now() / 1000)) < pending[1] + 2n) await sleep(2000);
  check(
    (await pay(a, big)) === "included",
    "v3: the same payment goes in after the delay, no owner call",
  );

  // 3. Payment count: the limit is today's count + 1; payee cap on payee2.
  const [today] = await read<readonly [number, bigint, bigint, bigint]>("getCounters", [a.address]);
  const capped: MandateInput = {
    ...mixed,
    maxPaymentsPerDay: today + 1,
    payeeDailyCaps: [NO_PAYEE_CAP, coin(1) / 100n],
  };
  check(
    (await setMandate(a.address, capped)) === "ok",
    "v3: tightening to a count limit and a payee cap",
  );
  check((await pay(a, coin(1) / 200n, payee2)) === "included", "v3: within the payee cap");
  check(
    (await pay(a, coin(1) / 1000n)) === "agent: daily payment count exceeded",
    "v3: the payment count is enforced",
  );
  const b = await freshAgent(n, [payee2]);
  {
    const o = await owner(b.address);
    const req = setMandateRequest(
      3,
      o.ids,
      b.address,
      {
        payees: [payee2],
        payeeDailyCaps: [coin(1) / 100n],
        perTxCap: coin(1),
        dailyCap: coin(3),
        expiry,
      },
      o.ownerNonce,
    );
    const r = await call(req.data(ownerProof(req.challenge)));
    check(r === "ok", "v3: a second agent tightens to a payee cap");
  }
  check((await pay(b, coin(1) / 200n, payee2)) === "included", "v3: payee cap: first payment");
  check(
    (await pay(b, coin(1) / 100n, payee2)) === "agent: payee budget exceeded",
    "v3: the payee cap is enforced",
  );

  // 4.
  check((await call(keptFreeze)) === "ok", "v3: the freeze proof signed before the switch works");
  {
    const o = await owner(a.address);
    const req = setFrozenRequest(3, o.ids, a.address, false, o);
    check((await call(req.data(ownerProof(req.challenge)))) === "ok", "v3: unfreeze with UV");
  }
  const g = privateKeyToAccount(generatePrivateKey());
  {
    const o = await owner(a.address);
    const req = setGuardianRequest(o.ids, a.address, g.address, o.ownerNonce);
    check((await call(req.data(ownerProof(req.challenge)))) === "ok", "v3: setGuardian");
    const sig = await g.sign({ hash: guardianFreezeDigest(domain, a.address, o.freezeEpoch) });
    check(
      (await call(guardianFreezeData(a.address, o.freezeEpoch, sig))) === "ok",
      "v3: guardianFreeze",
    );
    check((await pay(a, 1n)) === "agent: frozen", "v3: frozen by the guardian");
  }

  // 5.
  {
    const before = await n.client.getBalance({ address: a.address });
    const o = await owner(a.address);
    const req = sweepRequest(o.ids, a.address, rescue, o);
    check((await call(req.data(ownerProof(req.challenge)))) === "ok", "v3: sweep scheduled");
    check(
      (await call(executeSweepData(a.address))).includes("timelock"),
      "v3: executeSweep refused before its time",
    );
    const p = await read<readonly [unknown, bigint, Address, bigint]>("getPending", [a.address]);
    while (BigInt(Math.floor(Date.now() / 1000)) < p[3] + 2n) await sleep(2000);
    await tick();
    const rescueBefore = await n.client.getBalance({ address: rescue });
    check((await call(executeSweepData(a.address))) === "ok", "v3: executeSweep after its time");
    const moved = (await n.client.getBalance({ address: rescue })) - rescueBefore;
    check(
      moved === before && (await n.client.getBalance({ address: a.address })) === 0n,
      "v3: the whole balance moved",
    );
    const [, , charged, swept] = await read<readonly [number, bigint, bigint, bigint]>(
      "getCounters",
      [a.address],
    );
    const [, , total] = await readPolicy.spend(n, a.address);
    check(
      swept === moved && total === charged + swept,
      "v3: getSpend third value = charged + swept",
    );
    const c = cancelPendingRequest(o.ids, a.address, o.ownerNonce + 1n);
    check(
      (await call(c.data(ownerProof(c.challenge)))).includes("nothing pending"),
      "v3: nothing left to cancel",
    );
  }

  // 6.
  await tick();
  await sleep(3000);
  const height = (await n.client.getBlockNumber()) - 1n;
  const hashes = await Promise.all(
    all.map((x) => x.client.getBlock({ blockNumber: height }).then((b) => b.hash)),
  );
  check(
    all.length > 1 && hashes.every((h) => h === hashes[0]),
    `every node (${all.length}) has the same block at height ${height}`,
  );

  console.log(failures === 0 ? "rule-v3-switch: PASS" : `rule-v3-switch: FAIL (${failures})`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("rule-v3-switch: FAIL:", err instanceof Error ? err.message : err);
  process.exit(1);
});
