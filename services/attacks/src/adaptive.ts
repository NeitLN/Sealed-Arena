// Scripted adaptive attacker on the local Sealed L1 under rule v2 (scripts/localnet.sh with
// SEALED_RULE_V2_AT=0). It holds the agent's key and works through an ordered list of variants:
// after each attempt, refused or not, it sends the next one: other transaction types, gas limits,
// tips and fee caps, call data sizes, access lists, nonce gaps and replacements, other payees,
// amounts split under perTxCap, bursts, and payments sent while the owner's freeze is on its way.
// Every attempt and the node's answer are recorded. At the end it checks that nothing left the
// mandate: balance >= funded - totalCharged, spentToday <= dailyCap, no address outside the mandate
// received anything, and the three nodes agree on the chain.
//   pnpm --filter attacks adaptive       writes services/attacks/results/adaptive-<time>.json
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AGENT_POLICY_ADDRESS,
  agentPolicyAbi,
  CHAIN_ID,
  LOCAL_PAYEES,
  nativeMinterAbi,
  PRECOMPILES,
  readFreezeEpoch,
  setFrozenRequest,
} from "@sealed-arena/shared";
import { type Address, encodeFunctionData, formatEther, type Hex, parseEther, toHex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
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
import { describe, reasonOf, type Sent, type Shape, sendRaw, sign, waitFor } from "./probe.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ALL = nodes();
const n = ALL[0] as Node;
const [A, B] = LOCAL_PAYEES as unknown as [Address, Address];
const GWEI = 1_000_000_000n;
const FUNDING = coin(10);
const PER_TX = coin(1);
const DAILY = coin(3);
const strangers = Array.from(
  { length: 3 },
  () => privateKeyToAccount(generatePrivateKey()).address,
);
const [S1, S2, S3] = strangers as [Address, Address, Address];
const bytes = (k: number, b = "ab") => `0x${b.repeat(k)}` as Hex;
const intrinsic = (data: Hex) => {
  let g = 21_000n;
  for (let i = 2; i < data.length; i += 2) g += data.slice(i, i + 2) === "00" ? 4n : 16n;
  return g;
};

type Attempt = {
  n: number;
  family: string;
  variant: string;
  outcome: "refused" | "included" | "not included";
  reason: string;
  insideMandate?: boolean;
};

async function main() {
  const v = await ruleVersion(n);
  if (v !== 2)
    throw new Error(`the network runs agent rule v${v}; start it with SEALED_RULE_V2_AT=0`);
  const at = new Date().toISOString();
  const agent = await freshAgent(n, [A, B], {
    funding: FUNDING,
    perTxCap: PER_TX,
    dailyCap: DAILY,
  });
  const payeesBefore = await Promise.all([A, B].map((p) => n.client.getBalance({ address: p })));
  console.log(`adaptive attacker on ${n.url}, rule v${v}, agent ${agent.address}`);
  const attempts: Attempt[] = [];
  const fees = async () => ({ maxFeePerGas: (await n.client.estimateFeesPerGas()).maxFeePerGas });
  const log = (family: string, variant: string, s: Sent) => {
    const a: Attempt = {
      n: attempts.length + 1,
      family,
      variant,
      outcome: s.status,
      reason: describe(s),
    };
    attempts.push(a);
    console.log(`${String(a.n).padStart(2)} [${family}] ${variant}: ${a.reason}`);
    return s;
  };
  const tryShape = async (family: string, variant: string, s: Shape, node: Node = n) =>
    log(family, variant, await sendRaw(node, await sign(node, agent, s, await fees()), 10_000));

  // 1. Payee outside the mandate, every way the transaction can be shaped.
  const out = "payee outside the mandate";
  await tryShape(out, "type 2 transfer of 0.5 to a stranger", { to: S1, value: parseEther("0.5") });
  await tryShape(out, "legacy transfer to a stranger", {
    to: S1,
    value: parseEther("0.5"),
    type: "legacy",
  });
  await tryShape(out, "type 1 transfer to a stranger", {
    to: S1,
    value: parseEther("0.5"),
    type: "eip2930",
  });
  await tryShape(out, "gas 30000 instead of 21000", {
    to: S1,
    value: parseEther("0.5"),
    gas: 30_000n,
  });
  await tryShape(out, "with a 32-byte payment reference", {
    to: S1,
    value: parseEther("0.5"),
    data: bytes(32),
    gas: intrinsic(bytes(32)),
  });
  await tryShape(out, "tip 0", { to: S1, value: parseEther("0.5"), tip: 0n });
  await tryShape(out, "value 0 (probe)", { to: S1, value: 0n });
  await tryShape(out, "to the agent's own address", {
    to: agent.address,
    value: parseEther("0.5"),
  });
  await tryShape(out, "a payee address one character off", {
    to: `${A.slice(0, -1)}${A.endsWith("0") ? "1" : "0"}`.toLowerCase() as Address,
    value: parseEther("0.5"),
  });
  for (const node of ALL.slice(1))
    await tryShape(
      out,
      `to a stranger, sent straight to node ${node.index + 1}`,
      { to: S2, value: parseEther("0.5") },
      node,
    );

  // 2. Code and precompiles.
  const code = "contracts and precompiles";
  await tryShape(code, "contract creation", {
    data: "0x6001600c60003960016000f300",
    gas: 100_000n,
  });
  await tryShape(code, "the ecrecover precompile (0x01)", {
    to: "0x0000000000000000000000000000000000000001",
    value: parseEther("0.5"),
  });
  await tryShape(code, "NativeMinter: mint 1000 coins to itself", {
    to: PRECOMPILES.nativeMinter,
    data: encodeFunctionData({
      abi: nativeMinterAbi,
      functionName: "mintNativeCoin",
      args: [agent.address, coin(1000)],
    }),
    gas: 100_000n,
  });
  await tryShape(code, "AgentPolicy: setMandate with a stranger and no owner proof", {
    to: AGENT_POLICY_ADDRESS,
    data: encodeFunctionData({
      abi: agentPolicyAbi,
      functionName: "setMandate",
      args: [
        agent.address,
        { payees: [S1], perTxCap: coin(100), dailyCap: coin(100), expiry: 2n ** 63n },
        0n,
        "0x",
      ],
    }),
    gas: 600_000n,
  });

  // 3. Listed payee, the shape of the transaction stretched (fees, data, gas, access lists).
  const shape = "listed payee, odd shape";
  await tryShape(shape, "tip 10 gwei (the extra goes to the block producer, not the payee)", {
    to: A,
    value: parseEther("0.01"),
    tip: 10n * GWEI,
    maxFeePerGas: (await fees()).maxFeePerGas + 10n * GWEI,
  });
  await tryShape(shape, "legacy, gas price 10 gwei above the base fee", {
    to: A,
    value: parseEther("0.01"),
    type: "legacy",
    maxFeePerGas: ((await n.client.getBlock()).baseFeePerGas ?? 0n) + 10n * GWEI,
  });
  await tryShape(shape, "fee cap with a maximum fee of 0.2 (daily fee cap 0.15)", {
    to: A,
    value: parseEther("0.01"),
    maxFeePerGas: parseEther("0.2") / 21_000n,
  });
  await tryShape(shape, "fee cap with a maximum fee of 1.5 (perTxCap 1)", {
    to: A,
    value: parseEther("0.01"),
    maxFeePerGas: parseEther("1.5") / 21_000n,
  });
  for (const k of [1, 31, 33, 64, 1024])
    await tryShape(shape, `${k} bytes of call data, gas = intrinsic`, {
      to: A,
      value: parseEther("0.01"),
      data: bytes(k),
      gas: intrinsic(bytes(k)),
    });
  await tryShape(shape, "32 bytes of call data, gas 21000 (below intrinsic)", {
    to: A,
    value: parseEther("0.01"),
    data: bytes(32),
    gas: 21_000n,
  });
  await tryShape(shape, "32 bytes of call data, gas = intrinsic + 1", {
    to: A,
    value: parseEther("0.01"),
    data: bytes(32),
    gas: intrinsic(bytes(32)) + 1n,
  });
  await tryShape(shape, "no data, gas 21001", { to: A, value: parseEther("0.01"), gas: 21_001n });
  await tryShape(shape, "type 1 with an access list entry", {
    to: A,
    value: parseEther("0.01"),
    type: "eip2930",
    accessList: [{ address: S1, storageKeys: [] }],
    gas: 23_400n,
  });
  await tryShape(shape, "type 2 with an access list entry", {
    to: A,
    value: parseEther("0.01"),
    accessList: [{ address: A, storageKeys: [toHex(0, { size: 32 })] }],
    gas: 25_300n,
  });
  log(
    shape,
    "signed for another chain id",
    await sendRaw(
      n,
      await agent.signTransaction({
        chainId: CHAIN_ID + 1,
        type: "eip1559",
        nonce: await n.client.getTransactionCount({ address: agent.address, blockTag: "pending" }),
        to: S1,
        value: parseEther("0.5"),
        gas: 21_000n,
        maxFeePerGas: (await fees()).maxFeePerGas,
        maxPriorityFeePerGas: GWEI,
      }),
    ),
  );

  // 4. Amounts: the cap itself, then splitting under it.
  const amt = "amounts";
  await tryShape(amt, "exactly perTxCap (1) to seller A: the fee makes the charge larger", {
    to: A,
    value: PER_TX,
  });
  await tryShape(amt, "0.99 to seller A (inside the mandate)", {
    to: A,
    value: parseEther("0.99"),
  });
  await tryShape(amt, "0.99 to seller B (inside the mandate)", {
    to: B,
    value: parseEther("0.99"),
  });

  // 5. Nonces: gaps and replacements.
  const nonceFam = "nonces";
  const next = await n.client.getTransactionCount({ address: agent.address, blockTag: "pending" });
  await tryShape(nonceFam, "nonce gap of 5, to a stranger", {
    to: S1,
    value: parseEther("0.5"),
    nonce: next + 5,
  });
  // A small payment to seller A with a low tip, replaced at once by one to a stranger.
  const low = await sign(
    n,
    agent,
    { to: A, value: parseEther("0.01"), tip: GWEI / 2n, nonce: next },
    await fees(),
  );
  const lowHash = await n.client
    .sendRawTransaction({ serializedTransaction: low })
    .catch((e) => reasonOf(e));
  log(
    nonceFam,
    "replace a pending payment (same nonce, higher tip) with one to a stranger",
    await sendRaw(
      n,
      await sign(
        n,
        agent,
        { to: S1, value: parseEther("0.5"), tip: GWEI, nonce: next },
        await fees(),
      ),
      6_000,
    ),
  );
  log(
    nonceFam,
    "replace it with one of 0.9 to seller B (would pass the daily cap)",
    await sendRaw(
      n,
      await sign(
        n,
        agent,
        { to: B, value: parseEther("0.9"), tip: GWEI, nonce: next },
        await fees(),
      ),
      6_000,
    ),
  );
  if (typeof lowHash === "string" && lowHash.startsWith("0x"))
    log(
      nonceFam,
      "the original low-tip payment to seller A",
      await waitFor(n, lowHash as Hex, 10_000),
    );

  // 6. Split under perTxCap, all at once, to exhaust and pass the daily cap.
  const burst = "bursts";
  const start = await n.client.getTransactionCount({ address: agent.address, blockTag: "pending" });
  const f = await fees();
  const raws = await Promise.all(
    Array.from({ length: 12 }, (_, i) =>
      sign(n, agent, { to: i % 2 ? B : A, value: parseEther("0.3"), nonce: start + i }, f),
    ),
  );
  const sent = await Promise.allSettled(
    raws.map((r) => n.client.sendRawTransaction({ serializedTransaction: r })),
  );
  for (let k = 0; k < 3; k++)
    await sendAndWait(n, accounts.admin, { to: accounts.admin.address, value: 0n, gas: 21_000n });
  for (const [i, s] of sent.entries()) {
    const result: Sent =
      s.status === "rejected"
        ? { status: "refused", reason: reasonOf(s.reason) }
        : await waitFor(n, s.value, 3_000);
    log(burst, `12 payments of 0.3 sent at once, #${i + 1}`, result);
  }
  await tryShape(burst, "0.01 to seller A after the burst", { to: A, value: parseEther("0.01") });

  // 7. Race the owner's freeze: the freeze is sent, then payments at the highest allowed tip.
  const race = "racing a freeze";
  const [ids, epoch, relayerNonce] = await Promise.all([
    policyIds(n),
    readFreezeEpoch(n.client, agent.address),
    n.client.getTransactionCount({ address: accounts.relayer.address, blockTag: "pending" }),
  ]);
  const req = setFrozenRequest(2, ids, agent.address, true, { ownerNonce: 0n, freezeEpoch: epoch });
  const ff = await fees();
  const freezeRaw = await accounts.relayer.signTransaction({
    chainId: CHAIN_ID,
    type: "eip1559",
    nonce: relayerNonce,
    to: AGENT_POLICY_ADDRESS,
    data: req.data(ownerProof(req.challenge)),
    gas: 1_000_000n,
    maxFeePerGas: ff.maxFeePerGas + 2n * GWEI,
    maxPriorityFeePerGas: 2n * GWEI,
  });
  const rs = await n.client.getTransactionCount({ address: agent.address, blockTag: "pending" });
  const racers = await Promise.all(
    Array.from({ length: 5 }, (_, i) =>
      sign(n, agent, { to: A, value: parseEther("0.001"), nonce: rs + i }, ff),
    ),
  );
  const freezeHash = await n.client.sendRawTransaction({ serializedTransaction: freezeRaw });
  const racing = await Promise.allSettled(
    racers.map((r) => n.client.sendRawTransaction({ serializedTransaction: r })),
  );
  const freezeR = await n.client.waitForTransactionReceipt({ hash: freezeHash });
  for (let k = 0; k < 3; k++)
    await sendAndWait(n, accounts.admin, { to: accounts.admin.address, value: 0n, gas: 21_000n });
  for (const [i, s] of racing.entries()) {
    const r: Sent =
      s.status === "rejected"
        ? { status: "refused", reason: reasonOf(s.reason) }
        : await waitFor(n, s.value, 3_000);
    const late = r.status === "included" && r.block >= freezeR.blockNumber;
    log(
      race,
      `payment #${i + 1} sent right after the freeze (freeze in block ${freezeR.blockNumber})${late ? " INCLUDED AT OR AFTER THE FREEZE" : ""}`,
      r,
    );
  }
  await tryShape(race, "0.001 to seller A once frozen", { to: A, value: parseEther("0.001") });
  await tryShape(race, "to a stranger once frozen", { to: S3, value: parseEther("0.001") });

  // ---- what moved ------------------------------------------------------------------------------
  await sendAndWait(n, accounts.admin, { to: accounts.admin.address, value: 0n, gas: 21_000n });
  const balance = await n.client.getBalance({ address: agent.address });
  const [spentToday, , totalCharged] = await readPolicy.spend(n, agent.address);
  const strangerBalances = await Promise.all(
    strangers.map((s) => n.client.getBalance({ address: s })),
  );
  const payeesAfter = await Promise.all([A, B].map((p) => n.client.getBalance({ address: p })));
  const toPayees = payeesAfter.reduce((s, b, i) => s + b - (payeesBefore[i] ?? 0n), 0n);
  const heights = await Promise.all(ALL.map((x) => x.client.getBlockNumber()));
  const common = [...heights].sort((x, y) => (x < y ? -1 : 1))[0] ?? 0n;
  const hashes = await Promise.all(
    ALL.map(async (x) => (await x.client.getBlock({ blockNumber: common })).hash),
  );
  const included = attempts.filter((a) => a.outcome === "included");
  const lateRace = attempts.filter((a) =>
    a.variant.includes("INCLUDED AT OR AFTER THE FREEZE"),
  ).length;
  const checks = {
    invariant: {
      ok: balance >= FUNDING - totalCharged,
      detail: `balance ${formatEther(balance)} >= funded ${formatEther(FUNDING)} - totalCharged ${formatEther(totalCharged)}`,
    },
    dailyCap: {
      ok: spentToday <= DAILY,
      detail: `spentToday ${formatEther(spentToday)} <= dailyCap ${formatEther(DAILY)}`,
    },
    strangers: {
      ok: strangerBalances.every((b) => b === 0n),
      detail: `stranger balances ${strangerBalances.map((b) => formatEther(b)).join(", ")}`,
    },
    payees: {
      ok: toPayees <= DAILY,
      detail: `sellers A and B received ${formatEther(toPayees)} in total`,
    },
    freeze: {
      ok: lateRace === 0,
      detail: `${lateRace} payments included at or after the freeze block`,
    },
    nodesAgree: {
      ok: hashes.every((h) => h === hashes[0]),
      detail: `block ${common}: ${hashes.map((h) => h.slice(0, 10)).join(", ")}`,
    },
  };
  for (const [k, c] of Object.entries(checks))
    console.log(`${c.ok ? "PASS" : "FAIL"} ${k}: ${c.detail}`);
  const ok = Object.values(checks).every((c) => c.ok);
  const reasons: Record<string, number> = {};
  for (const a of attempts) {
    const k =
      a.outcome === "refused"
        ? (a.reason.match(/agent: [a-z ]+|refused: [^:(]+/)?.[0] ?? a.reason)
        : a.reason
            .replace(/ in block \d+/, "")
            .replace(/\(.*\)/, "")
            .trim();
    reasons[k] = (reasons[k] ?? 0) + 1;
  }
  const result = {
    version: 1,
    at,
    network: "local Sealed L1 (3 nodes, scripts/localnet.sh, SEALED_RULE_V2_AT=0)",
    ruleVersion: v,
    agent: agent.address,
    mandate: { payees: [A, B], perTxCap: "1", dailyCap: "3", dailyFeeCap: "0.15", funding: "10" },
    attempts,
    summary: { attempts: attempts.length, included: included.length, reasons },
    checks,
    ok,
  };
  const dir = resolve(HERE, "../results");
  mkdirSync(dir, { recursive: true });
  const file = resolve(dir, `adaptive-${at.replace(/[:.]/g, "-")}.json`);
  writeFileSync(file, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`results: ${file}`);
  console.log(
    `adaptive: ${ok ? "PASS" : "FAIL"} (${attempts.length} attempts, ${included.length} included inside the mandate)`,
  );
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error("adaptive: FAIL:", e instanceof Error ? e.message.split("\n")[0] : e);
  process.exit(1);
});
