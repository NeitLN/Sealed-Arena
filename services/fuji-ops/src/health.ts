// What must hold for the live demo on Fuji, one check per line (PASS, FAIL or N/A).
//   pnpm --filter fuji-ops health
// Reads only. The L1 through FUJI_L1_RPC or the SSH tunnel (127.0.0.1:19650). Set HEALTH_SSH to an
// ssh command for the VM (e.g. "ssh -i ~/.ssh/sealed_gcp sealed@<host>") to check the ICM relayer.
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { arenaRecorderAbi } from "@sealed-arena/shared";
import { type Address, createPublicClient, defineChain, formatEther, http, parseEther } from "viem";

const HERE = dirname(fileURLToPath(import.meta.url));
const ENV = process.env.SEALED_ENV_FILE ?? resolve(HERE, "../../../.env");
try {
  process.loadEnvFile(ENV);
} catch {
  // addresses below fall back to deployments/fuji.json where they can
}
const d = JSON.parse(readFileSync(resolve(HERE, "../deployments/fuji.json"), "utf8")) as {
  blockchainID: string;
  validators: Array<{ nodeID: string; validationID?: string }>;
  arenaRecorder: { address: Address };
  demoManager?: { address: Address };
};

/** The open challenge's agent (public on purpose, web/src/arena.config.ts). */
const CHALLENGE_AGENT: Address = "0x30b01562945BB3cE72241b0EaaEB3F41660982F6";
const PUBLIC_RPC = "https://sealed-arena.duckdns.org/rpc";
/** The validator must last until after the final pitch. */
const VALIDATOR_UNTIL = Date.parse("2026-12-05T00:00:00Z");
/** Measured fee of an L1 validator on Fuji (RUNBOOK §7). */
const AVAX_PER_DAY = 0.044;
/** What one demo agent costs: its 0.05 coins and the manager's two transactions. */
const PER_DEMO_AGENT = parseEther("0.05") + parseEther("0.001");
const MIN_DEMO_AGENTS = 40n;
/** Gas the relayer spends on one owner action, generously. */
const RELAYER_TX_GAS = 400_000n;
const MIN_RELAYER_TXS = 200n;

const rpc = process.env.FUJI_L1_RPC ?? `http://127.0.0.1:19650/ext/bc/${d.blockchainID}/rpc`;
const chain = defineChain({
  id: 261126,
  name: "Sealed (Fuji)",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: [rpc] } },
});
const l1 = createPublicClient({ chain, transport: http(rpc) });

type Result = ["PASS" | "FAIL" | "N/A", string];
const checks: Array<[string, () => Promise<Result>]> = [
  [
    "rpc",
    async () => {
      const r = await fetch(PUBLIC_RPC, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
      });
      const id = ((await r.json()) as { result?: string }).result;
      return [id === "0x3fc06" ? "PASS" : "FAIL", `${PUBLIC_RPC} eth_chainId ${id}`];
    },
  ],
  [
    "validator balance",
    async () => {
      const v = d.validators[0];
      if (!v?.validationID) return ["FAIL", "no validationID in deployments/fuji.json"];
      const r = await fetch("https://api.avax-test.network/ext/bc/P", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "platform.getL1Validator",
          params: { validationID: v.validationID },
        }),
      });
      const res = ((await r.json()) as { result?: { balance: string } }).result;
      if (!res) return ["FAIL", "validator not found on the P-Chain"];
      const avax = Number(res.balance) / 1e9;
      const until = Date.now() + (avax / AVAX_PER_DAY) * 86_400_000;
      const day = new Date(until).toISOString().slice(0, 10);
      return [
        until >= VALIDATOR_UNTIL ? "PASS" : "FAIL",
        `${avax.toFixed(4)} AVAX, lasts to about ${day} (needs ${new Date(VALIDATOR_UNTIL).toISOString().slice(0, 10)}); top up with platform l1 increase-validator-balance`,
      ];
    },
  ],
  [
    "demo manager",
    async () => {
      const m = d.demoManager?.address;
      if (!m) return ["N/A", "no demo manager in deployments/fuji.json"];
      const bal = await l1.getBalance({ address: m });
      const n = bal / PER_DEMO_AGENT;
      return [
        n >= MIN_DEMO_AGENTS ? "PASS" : "FAIL",
        `${formatEther(bal)} coins, about ${n} demo agents (wants ${MIN_DEMO_AGENTS}); top up with demo-manager fund`,
      ];
    },
  ],
  [
    "relayer gas",
    async () => {
      const relayer = process.env.FUJI_RELAYER_ADDRESS as Address | undefined;
      if (!relayer) return ["N/A", "FUJI_RELAYER_ADDRESS not set"];
      const [bal, price] = await Promise.all([
        l1.getBalance({ address: relayer }),
        l1.getGasPrice(),
      ]);
      const n = bal / (RELAYER_TX_GAS * price);
      return [
        n >= MIN_RELAYER_TXS ? "PASS" : "FAIL",
        `${formatEther(bal)} coins, about ${n} owner actions (wants ${MIN_RELAYER_TXS})`,
      ];
    },
  ],
  [
    "arena agent",
    async () => {
      const read = (functionName: string) =>
        l1.readContract({
          address: d.arenaRecorder.address,
          abi: arenaRecorderAbi,
          functionName,
          args: [CHALLENGE_AGENT],
        } as never) as Promise<unknown>;
      const [breached, funded, required] = await Promise.all([
        read("breached"),
        read("funded"),
        read("requiredBalance"),
      ]);
      const bal = await l1.getBalance({ address: CHALLENGE_AGENT });
      const ok = breached === false && bal >= (required as bigint);
      return [
        ok ? "PASS" : "FAIL",
        `breached ${breached}, balance ${formatEther(bal)}, required ${formatEther(required as bigint)}, funded ${funded}`,
      ];
    },
  ],
  [
    "icm-relayer",
    async () => {
      const ssh = process.env.HEALTH_SSH;
      if (!ssh) return ["N/A", "set HEALTH_SSH to check the VM"];
      const count = () =>
        execSync(`${ssh} "docker inspect -f '{{.RestartCount}} {{.State.Status}}' icm-relayer"`, {
          encoding: "utf8",
        }).trim();
      const a = count();
      await new Promise((r) => setTimeout(r, 60_000));
      const b = count();
      return [
        a === b && b.endsWith("running") ? "PASS" : "FAIL",
        `restart count and state ${a} → ${b} over 60 s`,
      ];
    },
  ],
];

let failed = false;
for (const [name, run] of checks) {
  const [status, detail] = await run().catch(
    (e): Result => ["FAIL", e instanceof Error ? (e.message.split("\n")[0] ?? "error") : String(e)],
  );
  if (status === "FAIL") failed = true;
  console.log(`${status.padEnd(4)}  ${name.padEnd(18)} ${detail}`);
}
process.exit(failed ? 1 : 0);
