// Edge cases of the agent rule on the local Sealed L1 under rule v2 (scripts/localnet.sh with
// SEALED_RULE_V2_AT=0, so the network runs the rule the Sealed L1 on Fuji runs):
//   a. the 00:00 UTC boundary: spend up to dailyCap just before and again just after the day changes
//   b. fees: a high tip or a high fee cap is refused (tip cap, per-payment cap, daily fee cap); a
//      payment with a high fee cap inside the caps pays only the base fee plus its tip
//   c. a payment still in the pool when the owner freezes the agent is not included
//   d. a listed payee that gets code after it was listed is refused ("agent: payee has code")
//   e. control: an address that is not a registered agent is not limited by the rule
// Each case prints PASS or FAIL (or NOT RUN with the reason) and the run is written to
// services/attacks/results/edge-<time>.json.
//   pnpm --filter attacks edge                   cases b to e; a is NOT RUN (it needs a real wait)
//   pnpm --filter attacks edge --utc-boundary    also case a: waits for the next 00:00 UTC when it is
//                                                at most EDGE_UTC_MAX_WAIT seconds away (default 900)
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AGENT_POLICY_ADDRESS,
  agentPolicyAbi,
  allowListAbi,
  LOCAL_PAYEES,
  PRECOMPILES,
  readFreezeEpoch,
  setFrozenRequest,
} from "@sealed-arena/shared";
import {
  type Address,
  encodeFunctionData,
  formatEther,
  getContractAddress,
  type Hex,
  parseEther,
} from "viem";
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
} from "./localnet.js";
import { describe, inPool, type Sent, sendRaw, sign, waitFor } from "./probe.js";
import {
  boundaryRoundOk,
  boundaryVerdict,
  freezeRaceVerdict,
  highFeeCapVerdict,
  payeeGetsCodeVerdict,
  refusedWith,
  type Verdict,
  verdictOf,
} from "./verdicts.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const n = nodes()[0] as Node;
const PAYEE = LOCAL_PAYEES[0] as Address;
const GWEI = 1_000_000_000n;
const FUNDING = coin(10);
/** freshAgent's mandate: 1 coin per payment, 3 per day; under v2 dailyFeeCap = dailyCap / 20. */
const PER_TX = coin(1);
const DAILY = coin(3);
const DAILY_FEE = DAILY / 20n;

type CaseResult = {
  id: string;
  title: string;
  verdict: Verdict;
  expected: string;
  steps: string[];
};
const results: CaseResult[] = [];
const agents: PrivateKeyAccount[] = [];

function record(
  id: string,
  title: string,
  expected: string,
  ok: boolean | "not run",
  steps: string[],
) {
  const verdict: Verdict = verdictOf(ok);
  results.push({ id, title, verdict, expected, steps });
  console.log(`${verdict} ${id} ${title}`);
  for (const s of steps) console.log(`     ${s}`);
}

const fees = async () => {
  const f = await n.client.estimateFeesPerGas();
  return { maxFeePerGas: f.maxFeePerGas };
};
const baseFee = async () => (await n.client.getBlock()).baseFeePerGas ?? 0n;

async function agent(payees: Address[] = [PAYEE]) {
  const a = await freshAgent(n, payees, { funding: FUNDING, perTxCap: PER_TX, dailyCap: DAILY });
  agents.push(a);
  return a;
}

/** Sends a no-op from the admin so that a new block is built. */
const nextBlock = () =>
  sendAndWait(n, accounts.admin, { to: accounts.admin.address, value: 0n, gas: 21_000n });

// ---- b. fees -------------------------------------------------------------------------------------

async function feeCases() {
  const a = await agent();
  const f = await fees();
  const value = parseEther("0.01");

  const tip = await sendRaw(
    n,
    await sign(
      n,
      a,
      { to: PAYEE, value, tip: 10n * GWEI, maxFeePerGas: f.maxFeePerGas + 10n * GWEI },
      f,
    ),
  );
  record(
    "b1",
    "type 2 payment with a 10 gwei tip",
    "refused: agent: tip too high",
    refusedWith(tip, "agent: tip too high"),
    [describe(tip)],
  );

  const legacy = await sendRaw(
    n,
    await sign(
      n,
      a,
      { to: PAYEE, value, type: "legacy", maxFeePerGas: (await baseFee()) + 10n * GWEI },
      f,
    ),
  );
  record(
    "b2",
    "legacy payment with a gas price 10 gwei above the base fee (the whole margin is tip)",
    "refused: agent: tip too high",
    refusedWith(legacy, "agent: tip too high"),
    [describe(legacy)],
  );

  // A fee cap whose maximum fee (21000 x fee cap) is 0.2: inside perTxCap, above dailyFeeCap (0.15).
  const overFeeCap = await sendRaw(
    n,
    await sign(n, a, { to: PAYEE, value, tip: GWEI, maxFeePerGas: parseEther("0.2") / 21_000n }, f),
  );
  record(
    "b3",
    "1 gwei tip, fee cap with a maximum fee of 0.2 (dailyFeeCap 0.15)",
    "refused: agent: fee budget exceeded",
    refusedWith(overFeeCap, "agent: fee budget exceeded"),
    [describe(overFeeCap)],
  );

  // A fee cap whose maximum fee alone is above perTxCap (1): the v1 cap refuses it first.
  const overPerTx = await sendRaw(
    n,
    await sign(n, a, { to: PAYEE, value, tip: GWEI, maxFeePerGas: parseEther("1.1") / 21_000n }, f),
  );
  record(
    "b4",
    "1 gwei tip, fee cap with a maximum fee of 1.1 (perTxCap 1)",
    "refused: agent: budget exceeded",
    refusedWith(overPerTx, "agent: budget exceeded"),
    [describe(overPerTx)],
  );

  // Inside every cap with a high fee cap (maximum fee 0.1): included, and only base fee + tip is paid.
  const before = await n.client.getBalance({ address: a.address });
  const [spentBefore] = await readPolicy.spend(n, a.address);
  const maxFee = parseEther("0.1") / 21_000n;
  const ok = await sendRaw(
    n,
    await sign(n, a, { to: PAYEE, value, tip: GWEI, maxFeePerGas: maxFee }, f),
  );
  const steps = [describe(ok)];
  let pass = false;
  if (ok.status === "included") {
    const r = await n.client.getTransactionReceipt({ hash: ok.hash });
    const block = await n.client.getBlock({ blockNumber: r.blockNumber });
    const paidFee = r.gasUsed * r.effectiveGasPrice;
    const drop = before - (await n.client.getBalance({ address: a.address }));
    const [spentAfter] = await readPolicy.spend(n, a.address);
    const effTip = r.effectiveGasPrice - (block.baseFeePerGas ?? 0n);
    steps.push(
      `fee paid ${formatEther(paidFee)} (effective gas price ${r.effectiveGasPrice} wei = base fee ${block.baseFeePerGas} + tip ${effTip}); maximum fee allowed by the fee cap ${formatEther(21_000n * maxFee)}`,
      `balance drop ${formatEther(drop)} = value ${formatEther(value)} + fee paid; counted toward dailyCap ${formatEther(spentAfter - spentBefore)} (value + gas limit x fee cap)`,
    );
    pass = highFeeCapVerdict({
      success: r.status === "success",
      effectiveTip: effTip,
      balanceDrop: drop,
      paidFee,
      value,
      counted: spentAfter - spentBefore,
      maxFeePerGas: maxFee,
    });
  }
  record(
    "b5",
    "1 gwei tip, fee cap with a maximum fee of 0.1 (inside perTxCap and dailyFeeCap)",
    "included; fee paid is base fee + at most 1 gwei tip; the maximum fee counts toward the caps",
    pass,
    steps,
  );
}

// ---- c. a payment in the pool when the owner freezes ---------------------------------------------------

async function freezeRace(trials = 5) {
  const steps: string[] = [];
  const trialResults: { beforeFreeze: boolean; payment: Sent }[] = [];
  let raced = 0;
  let included = 0;
  let stillPooled = 0;
  for (let i = 0; i < trials; i++) {
    const a = await agent();
    // The freeze is signed and the relayer's transaction built before the payment is sent, so the
    // two arrive milliseconds apart. Under v2 a freeze is signed on the freeze epoch.
    const [ids, epoch, relayerNonce] = await Promise.all([
      policyIds(n),
      readFreezeEpoch(n.client, a.address),
      n.client.getTransactionCount({ address: accounts.relayer.address, blockTag: "pending" }),
    ]);
    const req = setFrozenRequest(2, ids, a.address, true, { ownerNonce: 0n, freezeEpoch: epoch });
    const f = await fees();
    const freezeRaw = await accounts.relayer.signTransaction({
      chainId: n.chain.id,
      type: "eip1559",
      nonce: relayerNonce,
      to: AGENT_POLICY_ADDRESS,
      data: req.data(ownerProof(req.challenge)),
      gas: 1_000_000n,
      maxFeePerGas: f.maxFeePerGas + 20n * GWEI,
      maxPriorityFeePerGas: 10n * GWEI,
    });
    const payRaw = await sign(n, a, { to: PAYEE, value: parseEther("0.1"), tip: GWEI }, f);
    let payHash: Hex;
    try {
      payHash = await n.client.sendRawTransaction({ serializedTransaction: payRaw });
    } catch (e) {
      steps.push(
        `trial ${i + 1}: payment refused before the freeze was sent (${String(e).slice(0, 80)})`,
      );
      continue;
    }
    const freezeHash = await n.client.sendRawTransaction({ serializedTransaction: freezeRaw });
    const pooledAtFreeze = await inPool(n, payHash);
    const fr = await n.client.waitForTransactionReceipt({ hash: freezeHash });
    const [, frozen] = await readPolicy.mandate(n, a.address);
    // Give the pool and the builder several blocks.
    for (let k = 0; k < 3; k++) await nextBlock();
    const pay = await waitFor(n, payHash, 4_000);
    const payBlock = pay.status === "included" ? pay.block : undefined;
    const beforeFreeze = payBlock !== undefined && payBlock < fr.blockNumber;
    trialResults.push({ beforeFreeze, payment: pay });
    if (!beforeFreeze) raced++;
    if (!beforeFreeze && pay.status === "included") included++;
    if (pay.status === "not included" && pay.inPool) stillPooled++;
    steps.push(
      `trial ${i + 1}: payment in the pool when the freeze was sent: ${pooledAtFreeze}; freeze in block ${fr.blockNumber} (${fr.status}, frozen ${frozen}); payment: ${describe(pay)}${beforeFreeze ? " (before the freeze block: no race this trial)" : ""}`,
    );
  }
  steps.push(
    `${raced} trials raced the freeze; included after or with the freeze: ${included}; still in the pool: ${stillPooled}`,
  );
  record(
    "c",
    "payment in the pool when the owner freezes",
    "not included once the freeze is in a block, and not kept in the pool",
    freezeRaceVerdict(trialResults),
    steps,
  );
}

// ---- d. a listed payee gets code ---------------------------------------------------------------------

async function payeeGetsCode() {
  const steps: string[] = [];
  // The deployer's next contract address: listed while it has no code.
  const deployerNonce = await n.client.getTransactionCount({
    address: accounts.deployer.address,
    blockTag: "pending",
  });
  const future = getContractAddress({
    from: accounts.deployer.address,
    nonce: BigInt(deployerNonce),
  });
  const a = await agent([PAYEE, future]);
  const f = await fees();
  const first = await sendRaw(n, await sign(n, a, { to: future, value: parseEther("0.01") }, f));
  steps.push(`${future} listed, no code yet: ${describe(first)}`);
  // The deployer key deploys a one-byte contract at that address (its next nonce).
  await sendAndWait(n, accounts.deployer, { data: "0x6001600c60003960016000f300", gas: 100_000n });
  const code = await n.client.getCode({ address: future });
  steps.push(`deployer created a contract at ${future}: code ${code ?? "0x"}`);
  const second = await sendRaw(
    n,
    await sign(n, a, { to: future, value: parseEther("0.01") }, await fees()),
  );
  steps.push(`same payee after it got code: ${describe(second)}`);
  record(
    "d",
    "listed payee that gets code after it was listed",
    "first payment included; after the deploy refused: agent: payee has code",
    payeeGetsCodeVerdict(first, code, second),
    steps,
  );
}

// ---- e. control: not a registered agent ----------------------------------------------------------------

async function notAnAgent() {
  const eoa = privateKeyToAccount(generatePrivateKey());
  await sendAndWait(n, accounts.admin, {
    to: PRECOMPILES.txAllowList,
    data: encodeFunctionData({
      abi: allowListAbi,
      functionName: "setEnabled",
      args: [eoa.address],
    }),
  });
  await sendAndWait(n, accounts.admin, { to: eoa.address, value: coin(20), gas: 21_000n });
  const isAgent = await n.client.readContract({
    address: AGENT_POLICY_ADDRESS,
    abi: agentPolicyAbi,
    functionName: "isAgent",
    args: [eoa.address],
  });
  const stranger = privateKeyToAccount(generatePrivateKey()).address;
  const f = await fees();
  // Everything an agent may not do at once: a stranger, 10 coins, a 10 gwei tip, 64 bytes of data,
  // a gas limit above the intrinsic gas, an access list.
  const sent = await sendRaw(
    n,
    await sign(
      n,
      eoa,
      {
        to: stranger,
        value: coin(10),
        tip: 10n * GWEI,
        maxFeePerGas: f.maxFeePerGas + 10n * GWEI,
        data: `0x${"ab".repeat(64)}`,
        gas: 60_000n,
        accessList: [{ address: PAYEE, storageKeys: [] }],
      },
      f,
    ),
  );
  const got = await n.client.getBalance({ address: stranger });
  record(
    "e",
    "control: an allowed sender that is not a registered agent",
    "included: the agent rule does not apply",
    !isAgent && sent.status === "included" && got === coin(10),
    [
      `isAgent ${isAgent}; 10 coins to a stranger with a 10 gwei tip, 64 bytes of data, gas 60000, an access list: ${describe(sent)}; stranger balance ${formatEther(got)}`,
    ],
  );
}

// ---- a. the 00:00 UTC boundary ---------------------------------------------------------------------------

async function utcBoundary(enabled: boolean) {
  const title = "spending up to dailyCap just before and again just after 00:00 UTC";
  const expected =
    "before: payments up to dailyCap included, the next refused (agent: budget exceeded); after the day changes: the same again";
  // A fresh network's head can be the genesis block, whose time is not the clock: build a block first.
  await nextBlock();
  const now = Number((await n.client.getBlock()).timestamp);
  const toMidnight = 86_400 - (now % 86_400);
  const maxWait = Number(process.env.EDGE_UTC_MAX_WAIT ?? 900);
  if (!enabled || toMidnight > maxWait) {
    record("a", title, expected, "not run", [
      `the day index comes from the block timestamp, which comes from the nodes' clock; the clock is not changed for a test, so the case needs a real wait. Next 00:00 UTC is ${toMidnight} s after this run (limit ${enabled ? maxWait : 0} s). Run \`pnpm --filter attacks edge --utc-boundary\` within ${Math.round(maxWait / 60)} minutes before 00:00 UTC.`,
    ]);
    return;
  }
  const a = await agent();
  const steps: string[] = [];
  const wait = Math.max(0, toMidnight - 45) * 1000;
  steps.push(`waiting ${wait / 1000} s until 45 s before 00:00 UTC`);
  console.log(`a: ${steps[0]}`);
  await new Promise((r) => setTimeout(r, wait));
  const value = parseEther("0.99");
  const round = async (label: string) => {
    const out: Sent[] = [];
    for (let i = 0; i < 4; i++)
      out.push(await sendRaw(n, await sign(n, a, { to: PAYEE, value }, await fees())));
    const days = await Promise.all(
      out.map(async (s) =>
        s.status === "included"
          ? (await n.client.getBlock({ blockNumber: s.block })).timestamp / 86_400n
          : undefined,
      ),
    );
    const [spent, day] = await readPolicy.spend(n, a.address);
    steps.push(
      `${label}: ${out.map(describe).join(" | ")}; block days ${days.map((d) => d ?? "-").join(",")}; spentToday ${formatEther(spent)} on day ${day}`,
    );
    const ok = boundaryRoundOk(out);
    return { ok, day: days[0], sameDay: new Set(days.slice(0, 3).map(String)).size === 1 };
  };
  const before = await round("before 00:00 UTC");
  // Wait for a block on the next day.
  while ((await n.client.getBlock()).timestamp / 86_400n === before.day) {
    await new Promise((r) => setTimeout(r, 2000));
    await nextBlock();
  }
  const after = await round("after 00:00 UTC");
  record("a", title, expected, boundaryVerdict(before, after), steps);
}

// ---- invariant ------------------------------------------------------------------------------------------

async function invariant() {
  const steps: string[] = [];
  let ok = true;
  for (const a of agents) {
    const balance = await n.client.getBalance({ address: a.address });
    const [, , totalCharged] = await readPolicy.spend(n, a.address);
    const holds = balance >= FUNDING - totalCharged;
    ok &&= holds;
    steps.push(
      `${a.address}: balance ${formatEther(balance)} >= funded ${formatEther(FUNDING)} - totalCharged ${formatEther(totalCharged)}: ${holds}`,
    );
  }
  record(
    "inv",
    "balance >= funded - totalCharged for every agent of the run",
    "holds for every agent",
    ok,
    steps,
  );
}

async function main() {
  const v = await ruleVersion(n);
  if (v !== 2)
    throw new Error(`the network runs agent rule v${v}; start it with SEALED_RULE_V2_AT=0`);
  const at = new Date().toISOString();
  const head = await n.client.getBlockNumber();
  console.log(`edge cases on ${n.url}, rule v${v}, block ${head}`);
  await utcBoundary(process.argv.includes("--utc-boundary"));
  await feeCases();
  await freezeRace();
  await payeeGetsCode();
  await notAnAgent();
  await invariant();
  const failed = results.filter((r) => r.verdict === "FAIL").length;
  const out = {
    version: 1,
    at,
    network: "local Sealed L1 (3 nodes, scripts/localnet.sh, SEALED_RULE_V2_AT=0)",
    ruleVersion: v,
    mandate: {
      perTxCap: "1",
      dailyCap: "3",
      dailyFeeCap: formatEther(DAILY_FEE),
      funding: formatEther(FUNDING),
    },
    results,
    ok: failed === 0,
  };
  const dir = resolve(HERE, "../results");
  mkdirSync(dir, { recursive: true });
  const file = resolve(dir, `edge-${at.replace(/[:.]/g, "-")}.json`);
  writeFileSync(file, `${JSON.stringify(out, null, 2)}\n`);
  console.log(`results: ${file}`);
  console.log(
    `edge: ${failed ? "FAIL" : "PASS"} (${results.filter((r) => r.verdict === "PASS").length} PASS, ${failed} FAIL, ${results.filter((r) => r.verdict === "NOT RUN").length} NOT RUN)`,
  );
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error("edge: FAIL:", e instanceof Error ? e.message.split("\n")[0] : e);
  process.exit(1);
});
