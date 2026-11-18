// A node without the agent rule, in a local network of three validators (chain/tests/byzantine).
//
// Node 3 runs a Subnet-EVM plugin built without the rule (chain/tests/byzantine/build-norule.sh):
// its pool takes an agent's payment to a stranger, and it puts that payment in the blocks it
// builds. Nodes 1 and 2 run the rule. The test sends the forbidden payment straight to node 3,
// keeps the chain busy with allowed payments through node 1, and then checks that the payment
// never reached the chain the network accepted, that the stranger received nothing, that the
// chain kept going and the three nodes agree on it, and what the nodes logged.
//
// Run with: bash chain/tests/byzantine/run.sh (it starts the network in this mode first).
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { LOCAL_PAYEES } from "@sealed-arena/shared";
import { type Address, type Hex, parseEther } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { accounts, coin, freshAgent, type Node, nodes, wallet } from "./localnet.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ALL = nodes();
const [N1, N2, N3] = ALL as [Node, Node, Node];
const PAYEE: Address = LOCAL_PAYEES[0];
const stranger = privateKeyToAccount(generatePrivateKey()).address;
const GAS_PRICE = 25_000_000_000n;
const TIP = 1_000_000_000n;
/** How long to keep the chain busy while node 3 gets its turns to propose. */
const RUN_MS = Number(process.env.BYZANTINE_RUN_MS ?? 90_000);

type Check = { name: string; ok: boolean; detail: string };
const checks: Check[] = [];
const check = (name: string, ok: boolean, detail: string) => {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}: ${detail}`);
};

/** The node ID of the node behind `n` (info.getNodeID on its HTTP port). */
async function nodeID(n: Node): Promise<string> {
  const base = n.url.slice(0, n.url.indexOf("/ext/"));
  const r = await fetch(`${base}/ext/info`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "info.getNodeID", params: {} }),
  });
  return ((await r.json()) as { result: { nodeID: string } }).result.nodeID;
}

/** Lines from the nodes' chain logs (inside the container) that mention `needle`. */
function logLines(needle: string): string[] {
  try {
    const out = execFileSync(
      "docker",
      [
        "exec",
        "sealed-node",
        "sh",
        "-c",
        `grep -H -F ${JSON.stringify(needle)} /data/networks/*/*/logs/*.log || true`,
      ],
      { encoding: "utf8", maxBuffer: 1 << 26 },
    );
    return out.split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

async function main() {
  if (ALL.length < 3) throw new Error("needs three nodes");
  const agent = await freshAgent(N1, [PAYEE], { funding: coin(5) });
  const agentWallet = (n: Node) => wallet(n, agent);
  const fees = { gas: 21_000n, maxFeePerGas: GAS_PRICE, maxPriorityFeePerGas: TIP };
  const before = await N1.client.getBlockNumber();

  // 1. The forbidden payment, straight to node 3. Node 1 refuses the same payment on arrival.
  const nonce = await N1.client.getTransactionCount({
    address: agent.address,
    blockTag: "pending",
  });
  const onNode1 = await agentWallet(N1)
    .sendTransaction({ to: stranger, value: parseEther("0.01"), nonce, ...fees })
    .then(
      () => "accepted",
      (e: unknown) => /agent: [a-z ]+/.exec(String((e as Error).message))?.[0] ?? "refused",
    );
  check(
    "node 1 refuses the payment to a stranger on arrival",
    onNode1 === "agent: payee not allowed",
    onNode1,
  );

  let forbidden: Hex | undefined;
  try {
    forbidden = await agentWallet(N3).sendTransaction({
      to: stranger,
      value: parseEther("0.01"),
      nonce,
      ...fees,
    });
  } catch (e) {
    check(
      "node 3 (no rule) takes the payment into its pool",
      false,
      String((e as Error).message).split("\n")[0] ?? "",
    );
  }
  if (forbidden) check("node 3 (no rule) takes the payment into its pool", true, forbidden);

  // 2. Keep the chain busy through node 1 with small transfers from the admin (allowed to send,
  // not an agent), so blocks keep coming and node 3 gets its turns to propose.
  const end = Date.now() + RUN_MS;
  let sent = 0;
  while (Date.now() < end) {
    await wallet(N1, accounts.admin)
      .sendTransaction({ to: PAYEE, value: 1n, ...fees })
      .then(() => sent++)
      .catch(() => undefined);
    await new Promise((r) => setTimeout(r, 2000));
  }
  await new Promise((r) => setTimeout(r, 6000));

  // 3. What the accepted chain holds.
  const heights = await Promise.all(ALL.map((n) => n.client.getBlockNumber()));
  // biome-ignore lint/complexity/useMathMinMax: bigint, Math.min does not take it
  const common = heights.reduce((a, b) => (a < b ? a : b));
  const hashes = await Promise.all(
    ALL.map(async (n) => (await n.client.getBlock({ blockNumber: common })).hash),
  );
  check(
    "the chain kept going",
    common > before + 5n,
    `height ${before} -> ${common} with ${sent} allowed payments sent through node 1`,
  );
  check(
    "the three nodes agree on the accepted chain",
    hashes.every((h) => h === hashes[0]),
    `block ${common}: ${hashes.map((h) => h.slice(0, 10)).join(", ")}`,
  );
  if (forbidden) {
    const receipts = await Promise.all(
      [N1, N2].map((n) => n.client.getTransactionReceipt({ hash: forbidden }).catch(() => null)),
    );
    check(
      "the forbidden payment is in no accepted block (nodes 1 and 2)",
      receipts.every((r) => r === null),
      receipts.map((r) => (r ? `block ${r.blockNumber}` : "no receipt")).join(", "),
    );
  }
  const strangerBalance = await N1.client.getBalance({ address: stranger });
  check("the stranger received nothing", strangerBalance === 0n, `${strangerBalance} wei`);

  // 4. What the nodes logged (debug level): blocks proposed by node 3 that carried the payment,
  // and which nodes refused them. A log line is "<node dir>/logs/<chain>.log:... block
  // verification failed {"nodeID": <proposer>, ... "error": "... agent: payee not allowed ..."}".
  const [id1, id2, id3] = await Promise.all([N1, N2, N3].map(nodeID));
  const rule = logLines("agent: payee not allowed");
  const rejections = rule.filter((l) => l.includes("block verification failed"));
  const rejectedBy = new Set(rejections.map((l) => /NodeID-[A-Za-z0-9]+/.exec(l)?.[0]));
  const proposers = new Set(
    rejections.map((l) => /"nodeID": "(NodeID-[A-Za-z0-9]+)"/.exec(l)?.[1]),
  );
  const heightsRejected = [...new Set(rejections.map((l) => /"height": (\d+)/.exec(l)?.[1]))];
  const blocksRejected = new Set(rejections.map((l) => /"blkID": "([A-Za-z0-9]+)"/.exec(l)?.[1]));
  check(
    "nodes 1 and 2 rejected blocks proposed by node 3, for the agent rule",
    rejectedBy.has(id1) &&
      rejectedBy.has(id2) &&
      !rejectedBy.has(id3) &&
      [...proposers].every((p) => p === id3) &&
      proposers.size === 1,
    `${blocksRejected.size} distinct blocks rejected (${rejections.length} log lines) at height(s) ${heightsRejected.join(", ")}; proposer ${[...proposers].join(", ")} (node 3 is ${id3}); rejected by ${[...rejectedBy].map((x) => (x === id1 ? "node 1" : x === id2 ? "node 2" : x)).join(" and ")}`,
  );
  const built = forbidden ? logLines(forbidden.slice(2, 18)) : [];

  const at = new Date().toISOString();
  const out = resolve(
    HERE,
    `../../../chain/tests/byzantine/results/byzantine-${at.replace(/[:.]/g, "-")}.json`,
  );
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(
    out,
    `${JSON.stringify(
      {
        at,
        network:
          "local Sealed L1, 3 validators in one container; node 3 runs the plugin without the agent rule",
        agent: agent.address,
        stranger,
        forbiddenTx: forbidden ?? null,
        heights: heights.map(String),
        nodeIDs: { node1: id1, node2: id2, node3: id3 },
        checks,
        logs: {
          rejections: rejections.slice(0, 20),
          rule: rule.slice(0, 40),
          mentionsOfTheTransaction: built.slice(0, 40),
        },
      },
      null,
      2,
    )}\n`,
  );
  console.log(`result: ${out}`);
  const failed = checks.filter((c) => !c.ok);
  console.log(`byzantine: ${checks.length - failed.length}/${checks.length} PASS`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error("byzantine: FAIL:", e instanceof Error ? e.message : e);
  process.exit(1);
});
