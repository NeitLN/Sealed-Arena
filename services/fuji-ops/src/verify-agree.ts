// Does your own node agree with the public RPC? (docs/VERIFY.md)
//   pnpm --filter fuji-ops verify-agree                       every height both sides have
//   pnpm --filter fuji-ops verify-agree -- --from 480 --to 560 --step 1
// Compares the block hash and the state root at each height between VERIFIER_RPC (your node,
// default the container started by chain/scripts/verifier.sh) and PUBLIC_RPC (the team's gateway).
// Reads only. Prints PASS / FAIL lines and exits non-zero on any FAIL.
import { compareHeaders, type Header, heightsToCheck } from "./checks.js";

const BLOCKCHAIN_ID = "UFo3xChM9b9efQkg93qPnswkJi7VR1XW7KQg9wE7gnCULfbYo";
/** The network upgrade the validator runs with (docs/RUNBOOK.md 7.1). */
const RULE_V2_AT = 1795086000;
const VERIFIER_BASE = process.env.VERIFIER_URL ?? "http://127.0.0.1:19750";
const VERIFIER_RPC = process.env.VERIFIER_RPC ?? `${VERIFIER_BASE}/ext/bc/${BLOCKCHAIN_ID}/rpc`;
const PUBLIC_RPC = process.env.PUBLIC_RPC ?? "https://sealed-arena.duckdns.org/rpc";
/** The gateway counts each call in a batch toward its per-minute limit; stay well under it. */
const BATCH = 20;
const PAUSE_MS = Number(process.env.VERIFY_PAUSE_MS ?? 2500);
/** How far apart the two tips may be (the verifier follows a few blocks behind at most). */
const TIP_SLACK = 5;

type RpcReply = { id: number; result?: unknown; error?: { message: string } };

function arg(name: string): number | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return undefined;
  const v = Number(process.argv[i + 1]);
  if (!Number.isInteger(v) || v < 0) throw new Error(`--${name} needs a non-negative integer`);
  return v;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function post(url: string, body: unknown): Promise<unknown> {
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (r.status === 429 && attempt < 5) {
      await sleep(15_000);
      continue;
    }
    if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
    return r.json();
  }
}

async function call<T>(url: string, method: string, params: unknown = []): Promise<T> {
  const res = (await post(url, { jsonrpc: "2.0", id: 1, method, params })) as RpcReply;
  if (res.error) throw new Error(`${url} ${method}: ${res.error.message}`);
  return res.result as T;
}

async function headers(url: string, heights: number[]): Promise<Map<number, Header | null>> {
  const body = heights.map((h, id) => ({
    jsonrpc: "2.0",
    id,
    method: "eth_getBlockByNumber",
    params: [`0x${h.toString(16)}`, false],
  }));
  const res = (await post(url, body)) as RpcReply[];
  if (!Array.isArray(res)) throw new Error(`${url}: batch answer is not a list`);
  const out = new Map<number, Header | null>();
  for (const r of res) {
    const h = heights[r.id];
    if (h === undefined) continue;
    if (r.error) throw new Error(`${url} block ${h}: ${r.error.message}`);
    out.set(h, (r.result as Header | null) ?? null);
  }
  return out;
}

let failed = false;
const report = (status: "PASS" | "FAIL", name: string, detail: string) => {
  if (status === "FAIL") failed = true;
  console.log(`${status.padEnd(4)}  ${name.padEnd(20)} ${detail}`);
};

// 1. The verifier is a node of this chain, has finished bootstrapping and runs the same upgrade.
const boot = (await post(`${VERIFIER_BASE}/ext/info`, {
  jsonrpc: "2.0",
  id: 1,
  method: "info.isBootstrapped",
  params: { chain: BLOCKCHAIN_ID },
}).catch((e: unknown) => ({ error: { message: e instanceof Error ? e.message : String(e) } }))) as {
  result?: { isBootstrapped: boolean };
  error?: { message: string };
};
if (boot.result?.isBootstrapped !== true) {
  report("FAIL", "verifier bootstrapped", `${VERIFIER_BASE}: ${JSON.stringify(boot)}`);
  process.exit(1);
}
report("PASS", "verifier bootstrapped", `${VERIFIER_BASE}, chain ${BLOCKCHAIN_ID}`);

const [vChain, pChain] = await Promise.all([
  call<string>(VERIFIER_RPC, "eth_chainId"),
  call<string>(PUBLIC_RPC, "eth_chainId"),
]);
report(
  vChain === "0x3fc06" && pChain === "0x3fc06" ? "PASS" : "FAIL",
  "chain id",
  `verifier ${vChain}, public ${pChain} (want 0x3fc06 = 261126)`,
);

const cfg = await call<{ upgrades?: { precompileUpgrades?: Array<Record<string, unknown>> } }>(
  VERIFIER_RPC,
  "eth_getChainConfig",
).catch(() => undefined);
const v2 = cfg?.upgrades?.precompileUpgrades?.find((u) => "agentRuleV2Config" in u) as
  | { agentRuleV2Config: { blockTimestamp: number } }
  | undefined;
const at = v2?.agentRuleV2Config.blockTimestamp;
report(
  at === RULE_V2_AT ? "PASS" : "FAIL",
  "verifier upgrade",
  `agentRuleV2Config.blockTimestamp ${at ?? "missing"} (want ${RULE_V2_AT})`,
);

// 2. Block hash and state root at every height both sides have (or the range asked for).
const [vTip, pTip] = (
  await Promise.all([
    call<string>(VERIFIER_RPC, "eth_blockNumber"),
    call<string>(PUBLIC_RPC, "eth_blockNumber"),
  ])
).map((x) => Number(BigInt(x))) as [number, number];
report(
  Math.abs(vTip - pTip) <= TIP_SLACK ? "PASS" : "FAIL",
  "tips",
  `verifier ${vTip}, public ${pTip} (want within ${TIP_SLACK} blocks)`,
);

const from = arg("from") ?? 0;
const to = Math.min(arg("to") ?? Math.min(vTip, pTip), vTip, pTip);
const step = arg("step") ?? 1;
const heights = heightsToCheck(from, to, step);

let checked = 0;
const differ: string[] = [];
for (let i = 0; i < heights.length; i += BATCH) {
  const part = heights.slice(i, i + BATCH);
  const [mine, theirs] = await Promise.all([
    headers(VERIFIER_RPC, part),
    headers(PUBLIC_RPC, part),
  ]);
  const r = compareHeaders(part, mine, theirs);
  checked += r.checked;
  differ.push(...r.differ);
  if (i + BATCH < heights.length) await sleep(PAUSE_MS);
}
report(
  differ.length === 0 && checked > 0 ? "PASS" : "FAIL",
  "hash and state root",
  `${checked} heights checked, ${from}..${to} step ${step}; ${differ.length} differ`,
);
for (const m of differ.slice(0, 20)) console.log(`      ${m}`);

console.log(
  `verifier ${VERIFIER_RPC}\npublic   ${PUBLIC_RPC}\nat       ${new Date().toISOString()}`,
);
process.exit(failed ? 1 : 0);
