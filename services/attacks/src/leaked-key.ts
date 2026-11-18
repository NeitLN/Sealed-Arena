// Leaked-key attack suite (layer 9). Plays someone who holds the agent's private key
// and tries every way to move the agent's coins outside its mandate on the local
// 3-node Sealed L1. Run after `scripts/localnet.sh up && scripts/localnet.sh seed`:
//   pnpm --filter attacks leaked-key
//
// Each case returns { name, expected, result, reason }. One positive control must
// succeed, so a broken network cannot make the suite look green. At the end the
// suite checks the invariant balance drop <= totalCharged increase, that no stranger
// received coins, and that the three nodes agree on the chain.
// LEAKED_KEY_JSON=<file> also writes the results as JSON (used by the evaluation report).
import { writeFileSync } from "node:fs";
import {
  AGENT_POLICY_ADDRESS,
  agentPolicyAbi,
  allowListAbi,
  CHAIN_ID,
  LOCAL_PAYEES,
  nativeMinterAbi,
  PRECOMPILES,
} from "@sealed-arena/shared";
import { type Address, encodeFunctionData, type Hex, keccak256, toHex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import {
  accounts,
  coin,
  type Node,
  nodes,
  OWNER_X,
  OWNER_Y,
  readPolicy,
  sendAndWait,
  setFrozen,
  setMandate,
} from "./localnet.js";
import { SAMPLE_MANDATE } from "./seed.js";

type Outcome = "blocked" | "succeeded";
export type CaseResult = {
  name: string;
  expected: Outcome;
  result: Outcome;
  reason: string;
  /** For blocked cases: the rejection reason must contain this text. */
  expectedReason?: string;
};

/** The error each blocked case must be rejected with, matched on the case name. */
const EXPECTED_REASONS: Array<[RegExp, string]> = [
  [/stranger/, "agent: payee not allowed"],
  [/above perTxCap|huge gas fee|past dailyCap/, "agent: budget exceeded"],
  [/create a contract/, "agent: contract creation not allowed"],
  [/call an existing contract/, "agent: payee not allowed"],
  [/listed payee that has code/, "agent: payee has code"],
  [
    /with the agent key|NativeMinter|TxAllowList admin|contract deployer/,
    "agent: payee not allowed",
  ],
  [/replay/, "nonce too low"],
  [/while frozen/, "agent: frozen"],
  [/expired/, "agent: mandate expired"],
];

const expectedReasonFor = (name: string) => EXPECTED_REASONS.find(([re]) => re.test(name))?.[1];
const matches = (r: CaseResult) =>
  r.result === r.expected &&
  (r.expectedReason === undefined || r.reason.includes(r.expectedReason));

// SEALED_AGENT_KEY picks another registered agent (the ArenaRecorder check, the Fuji run).
const agent = accounts.agent;
const GAS_PRICE = 25_000_000_000n; // 25 gwei, above the local minimum base fee
const TIP = 1_000_000_000n;
const ALL = nodes();
const N0 = ALL[0] as Node;
const stranger = privateKeyToAccount(generatePrivateKey()).address;
const [PAYEE] = LOCAL_PAYEES;

type TxKind = "legacy" | "eip2930" | "eip1559" | "eip4844" | "eip7702";
type Attempt = {
  to?: Address;
  value?: bigint;
  data?: Hex;
  gas?: bigint;
  kind?: TxKind;
  nonce?: number;
  fee?: bigint;
};

async function signAgent(n: Node, a: Attempt): Promise<Hex> {
  const nonce =
    a.nonce ??
    (await n.client.getTransactionCount({ address: agent.address, blockTag: "pending" }));
  const base = {
    chainId: CHAIN_ID,
    nonce,
    gas: a.gas ?? 21_000n,
    to: a.to,
    value: a.value ?? 0n,
    data: a.data,
  };
  const fee = a.fee ?? GAS_PRICE;
  switch (a.kind ?? "eip1559") {
    case "legacy":
      return agent.signTransaction({ ...base, type: "legacy", gasPrice: fee });
    case "eip2930":
      return agent.signTransaction({ ...base, type: "eip2930", gasPrice: fee, accessList: [] });
    case "eip4844":
      // A blob transaction without its sidecar: the version hash is made up, no KZG is needed.
      return agent.signTransaction({
        ...base,
        to: a.to ?? PAYEE,
        type: "eip4844",
        maxFeePerGas: fee,
        maxPriorityFeePerGas: TIP,
        maxFeePerBlobGas: 1n,
        blobVersionedHashes: [`0x01${"00".repeat(31)}`],
      });
    case "eip7702": {
      // A set-code transaction: the agent authorises code for its own account.
      const authorization = await agent.signAuthorization({
        address: a.to ?? PAYEE,
        chainId: CHAIN_ID,
        nonce: nonce + 1,
      });
      return agent.signTransaction({
        ...base,
        type: "eip7702",
        maxFeePerGas: fee,
        maxPriorityFeePerGas: TIP,
        authorizationList: [authorization],
      });
    }
    default:
      return agent.signTransaction({
        ...base,
        type: "eip1559",
        maxFeePerGas: fee,
        maxPriorityFeePerGas: TIP,
      });
  }
}

const reasonOf = (err: unknown): string => {
  const text =
    err instanceof Error
      ? `${err.message} ${(err as { details?: string }).details ?? ""}`
      : String(err);
  return (
    text.match(/agent: [a-z ]+/)?.[0] ??
    text.match(
      /(nonce too low|already known|replacement transaction underpriced|[a-z ]*not allowed[a-z ]*)/i,
    )?.[0] ??
    // The node's own words (viem keeps them in `details`) rather than viem's summary.
    (err as { details?: string }).details?.split("\n")[0]?.slice(0, 120) ??
    text.split("\n")[0]?.slice(0, 90) ??
    "rejected"
  );
};

/** Sends a raw agent transaction; "blocked" unless it is included in a block. */
async function attempt(n: Node, raw: Hex): Promise<{ result: Outcome; reason: string }> {
  let hash: Hex;
  try {
    hash = await n.client.sendRawTransaction({ serializedTransaction: raw });
  } catch (err) {
    return { result: "blocked", reason: `RPC rejected: ${reasonOf(err)}` };
  }
  try {
    const r = await n.client.waitForTransactionReceipt({ hash, timeout: 20_000 });
    return {
      result: "succeeded",
      reason: `included in block ${r.blockNumber} (status ${r.status})`,
    };
  } catch {
    return { result: "blocked", reason: "accepted by the RPC but never included" };
  }
}

async function nextBlock(): Promise<void> {
  await sendAndWait(N0, accounts.admin, { to: accounts.admin.address, value: 0n, gas: 21_000n });
}

const sampleMandate = (
  extra: {
    payees?: readonly Address[];
    perTxCap?: bigint;
    dailyCap?: bigint;
    expiry?: bigint;
  } = {},
) => ({
  ...SAMPLE_MANDATE,
  expiry: BigInt(Math.floor(Date.now() / 1000) + 7 * 86_400),
  ...extra,
});

async function run(): Promise<CaseResult[]> {
  const results: CaseResult[] = [];
  const add = (name: string, expected: Outcome, r: { result: Outcome; reason: string }) => {
    const expectedReason =
      expected === "blocked" && !name.startsWith("20 payments")
        ? expectedReasonFor(name)
        : undefined;
    const entry: CaseResult = {
      name,
      expected,
      ...r,
      ...(expectedReason ? { expectedReason } : {}),
    };
    results.push(entry);
    const mark = matches(entry) ? "ok " : "!! ";
    console.log(`${mark} ${name}: ${r.result} (${r.reason})`);
  };
  const forbidden = async (name: string, a: Attempt, n: Node = N0) =>
    add(name, "blocked", await attempt(n, await signAgent(n, a)));

  // The daily cases assume a fresh day: spending left from an earlier run the same UTC day would
  // make the control and the dailyCap case wrong, not the rule. Stop instead of reporting them.
  // getSpend returns the stored counter and the day it belongs to; the rule starts a new count
  // on the first payment of a new day, so an old day's counter is not today's spending.
  const [spentBefore, spendDay] = await readPolicy.spend(N0, agent.address);
  const today = (await N0.client.getBlock()).timestamp / 86_400n;
  if (spentBefore > 0n && spendDay === today)
    throw new Error(
      `NOT RUN: the agent already spent ${spentBefore} wei today; run again after 00:00 UTC`,
    );

  // 0. Positive control: inside the mandate.
  const controlRaw = await signAgent(N0, { to: PAYEE, value: coin(1) / 10n });
  add(
    "control: pay an allowed payee inside the mandate",
    "succeeded",
    await attempt(N0, controlRaw),
  );

  // 1. Native transfer to an address outside the mandate, every transaction type.
  for (const kind of ["legacy", "eip2930", "eip1559"] as const) {
    await forbidden(`transfer to a stranger (${kind})`, {
      to: stranger,
      value: coin(1) / 10n,
      kind,
    });
  }

  // 1b. An allowed payee inside the caps, as a blob (type 3) or set-code (type 4) transaction: only a
  // gate on the transaction type can refuse these. The reason is recorded as the node gave it.
  for (const [kind, label] of [
    ["eip4844", "a blob transaction (type 3)"],
    ["eip7702", "a set-code transaction (type 4)"],
  ] as const) {
    await forbidden(`transfer to an allowed payee as ${label}`, {
      to: PAYEE as Address,
      value: coin(1) / 10n,
      kind,
    });
  }

  // 2. Amounts and fees above the per-transaction cap.
  await forbidden("transfer above perTxCap", { to: PAYEE, value: SAMPLE_MANDATE.perTxCap });
  await forbidden("burn coins through a huge gas fee", {
    to: PAYEE,
    fee: SAMPLE_MANDATE.perTxCap / 21_000n + 1n,
  });

  // 3. Code: create, call an existing contract, pay a listed payee that has code.
  await forbidden("create a contract", { data: "0x6001600c60003960016000f300", gas: 100_000n });
  const hash = await accounts.deployer.signTransaction({
    chainId: CHAIN_ID,
    nonce: await N0.client.getTransactionCount({
      address: accounts.deployer.address,
      blockTag: "pending",
    }),
    type: "eip1559",
    gas: 100_000n,
    maxFeePerGas: GAS_PRICE,
    maxPriorityFeePerGas: TIP,
    data: "0x6001600c60003960016000f300",
  });
  const deployed = await N0.client.waitForTransactionReceipt({
    hash: await N0.client.sendRawTransaction({ serializedTransaction: hash }),
  });
  const contract = deployed.contractAddress as Address;
  await forbidden("call an existing contract", { to: contract, gas: 50_000n });
  await setMandate(N0, agent.address, sampleMandate({ payees: [PAYEE as Address, contract] }));
  await forbidden("pay a listed payee that has code", { to: contract, gas: 50_000n });
  await setMandate(N0, agent.address, sampleMandate());

  // 4. Change the rules with the agent key.
  const policyCall = (data: Hex) => ({ to: AGENT_POLICY_ADDRESS as Address, data, gas: 600_000n });
  await forbidden(
    "setMandate with the agent key",
    policyCall(
      encodeFunctionData({
        abi: agentPolicyAbi,
        functionName: "setMandate",
        args: [
          agent.address,
          { payees: [stranger], perTxCap: coin(100), dailyCap: coin(100), expiry: 2n ** 63n },
          0n,
          "0x",
        ],
      }),
    ),
  );
  await forbidden(
    "freeze with the agent key",
    policyCall(
      encodeFunctionData({
        abi: agentPolicyAbi,
        functionName: "freeze",
        args: [agent.address, 0n, "0x"],
      }),
    ),
  );
  await forbidden(
    "unfreeze with the agent key",
    policyCall(
      encodeFunctionData({
        abi: agentPolicyAbi,
        functionName: "unfreeze",
        args: [agent.address, 0n, "0x"],
      }),
    ),
  );
  await forbidden(
    "register again with the agent key",
    policyCall(
      encodeFunctionData({
        abi: agentPolicyAbi,
        functionName: "register",
        args: [agent.address, OWNER_Y, OWNER_X, await agent.sign({ hash: keccak256(toHex("x")) })],
      }),
    ),
  );
  await forbidden("mint coins through NativeMinter", {
    to: PRECOMPILES.nativeMinter,
    data: encodeFunctionData({
      abi: nativeMinterAbi,
      functionName: "mintNativeCoin",
      args: [agent.address, coin(1000)],
    }),
    gas: 100_000n,
  });
  await forbidden("make itself TxAllowList admin", {
    to: PRECOMPILES.txAllowList,
    data: encodeFunctionData({
      abi: allowListAbi,
      functionName: "setAdmin",
      args: [agent.address],
    }),
    gas: 100_000n,
  });
  await forbidden("enable itself as a contract deployer", {
    to: PRECOMPILES.contractDeployerAllowList,
    data: encodeFunctionData({
      abi: allowListAbi,
      functionName: "setEnabled",
      args: [agent.address],
    }),
    gas: 100_000n,
  });

  // 5. Replay and nonce games.
  add("replay the control transaction", "blocked", await attempt(N0, controlRaw));
  const nonce = await N0.client.getTransactionCount({
    address: agent.address,
    blockTag: "pending",
  });
  await forbidden("same nonce, higher fee, to a stranger", {
    to: stranger,
    value: 1n,
    nonce,
    fee: GAS_PRICE * 10n,
  });

  // 6. Each node directly.
  for (const n of ALL) {
    await forbidden(
      `transfer to a stranger sent straight to node ${n.index + 1}`,
      { to: stranger, value: 1n },
      n,
    );
  }

  // 7. Frozen and expired mandates.
  await setFrozen(N0, agent.address, true);
  await forbidden("pay an allowed payee while frozen", { to: PAYEE, value: 1n });
  await setFrozen(N0, agent.address, false);

  const expiry = BigInt(Math.floor(Date.now() / 1000) + 12);
  await setMandate(N0, agent.address, sampleMandate({ expiry }));
  await new Promise((r) => setTimeout(r, 15_000));
  await nextBlock();
  await forbidden("pay an allowed payee after the mandate expired", { to: PAYEE, value: 1n });
  await setMandate(N0, agent.address, sampleMandate());

  // 8. Daily budget: sequential payments, then 20 at once (last, it can leave pending txs).
  let sequentialRejected = "";
  for (let i = 0; i < 6 && !sequentialRejected; i++) {
    const r = await attempt(
      N0,
      await signAgent(N0, { to: PAYEE, value: (SAMPLE_MANDATE.perTxCap * 9n) / 10n }),
    );
    if (r.result === "blocked") sequentialRejected = r.reason;
  }
  const daily = SAMPLE_MANDATE.dailyCap;
  const afterSequential = (await readPolicy.spend(N0, agent.address))[0];
  add(
    "repeated payments past dailyCap",
    "blocked",
    sequentialRejected && afterSequential <= daily
      ? {
          result: "blocked",
          reason: `spentToday ${afterSequential} <= dailyCap ${daily}; next payment: ${sequentialRejected}`,
        }
      : { result: "succeeded", reason: `spentToday ${afterSequential}, dailyCap ${daily}` },
  );

  // The owner raises the budget by 2 coins; 20 payments of 0.5 coin arrive at once.
  const raised = afterSequential + coin(2);
  await setMandate(N0, agent.address, sampleMandate({ dailyCap: raised }));
  const start = await N0.client.getTransactionCount({
    address: agent.address,
    blockTag: "pending",
  });
  const raws = await Promise.all(
    Array.from({ length: 20 }, (_, i) =>
      signAgent(N0, { to: PAYEE, value: coin(1) / 2n, nonce: start + i }),
    ),
  );
  const sent = await Promise.allSettled(
    raws.map((raw) => N0.client.sendRawTransaction({ serializedTransaction: raw })),
  );
  await new Promise((r) => setTimeout(r, 6_000));
  await nextBlock();
  const included = (await N0.client.getTransactionCount({ address: agent.address })) - start;
  const spentAfter = (await readPolicy.spend(N0, agent.address))[0];
  add(
    "20 payments at once past dailyCap",
    "blocked",
    spentAfter <= raised
      ? {
          result: "blocked",
          reason: `${sent.filter((s) => s.status === "fulfilled").length}/20 accepted by the pool, ${included} included, spentToday ${spentAfter} <= dailyCap ${raised}`,
        }
      : { result: "succeeded", reason: `spentToday ${spentAfter} above dailyCap ${raised}` },
  );
  return results;
}

async function main(): Promise<void> {
  const balanceStart = await N0.client.getBalance({ address: agent.address });
  const chargedStart = (await readPolicy.spend(N0, agent.address))[2];

  const results = await run();

  await nextBlock();
  const balanceEnd = await N0.client.getBalance({ address: agent.address });
  const chargedEnd = (await readPolicy.spend(N0, agent.address))[2];
  const drop = balanceStart - balanceEnd;
  const charged = chargedEnd - chargedStart;
  const invariant = drop <= charged;
  const strangerBalance = await N0.client.getBalance({ address: stranger });

  // The three nodes agree on the block at the lowest common height.
  const heights = await Promise.all(ALL.map((n) => n.client.getBlockNumber()));
  let common = heights[0] ?? 0n;
  for (const h of heights) if (h < common) common = h;
  const hashes = await Promise.all(
    ALL.map(async (n) => (await n.client.getBlock({ blockNumber: common })).hash),
  );
  const agree = hashes.every((h) => h === hashes[0]);

  console.log("\n| Case | Expected | Result | Reason |\n|---|---|---|---|");
  for (const r of results) console.log(`| ${r.name} | ${r.expected} | ${r.result} | ${r.reason} |`);
  console.log(
    `\nInvariant: balance drop ${drop} <= totalCharged increase ${charged}: ${invariant ? "PASS" : "FAIL"}`,
  );
  console.log(
    `Stranger ${stranger} balance: ${strangerBalance} (${strangerBalance === 0n ? "PASS" : "FAIL"})`,
  );
  console.log(
    `Nodes agree on block ${common}: ${agree ? "PASS" : "FAIL"} (${hashes.map((h) => h.slice(0, 10)).join(", ")})`,
  );

  const mismatches = results.filter((r) => !matches(r));
  const ok = mismatches.length === 0 && invariant && strangerBalance === 0n && agree;
  // Machine-readable copy for the evaluation report (services/attacks/suite).
  if (process.env.LEAKED_KEY_JSON) {
    writeFileSync(
      process.env.LEAKED_KEY_JSON,
      `${JSON.stringify(
        {
          at: new Date().toISOString(),
          results,
          invariant,
          strangerBalance: strangerBalance.toString(),
          nodesAgree: agree,
          ok,
        },
        null,
        2,
      )}
`,
    );
  }
  console.log(
    `\nleaked-key: ${ok ? "PASS" : "FAIL"} (${results.length} cases, ${mismatches.length} unexpected)`,
  );
  if (!ok) process.exit(1);
}

main().catch((err) => {
  console.error("leaked-key: FAIL:", err instanceof Error ? err.message : err);
  process.exit(1);
});
