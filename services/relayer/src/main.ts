import { serve } from "@hono/node-server";
import { createRelayerApp } from "./app.js";
import { demoIssuer, relayerKey, sealedRelayChain } from "./chain.js";

const rpc = process.env.SEALED_RPC_URL;
if (!rpc) throw new Error("SEALED_RPC_URL is not set (see .env.example)");
const port = Number(process.env.RELAYER_PORT ?? 4040);
const origins = process.env.RELAYER_ALLOWED_ORIGINS?.split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const chain = sealedRelayChain(rpc, relayerKey(rpc));
// Demo agents for the owner console (POST /demo/claim): a separate key with the TxAllowList
// manager role. Off unless RELAYER_DEMO_MANAGER_KEY is set.
const demoKey = process.env.RELAYER_DEMO_MANAGER_KEY as `0x${string}` | undefined;
/** A whole number from the environment; unset or empty means the default. */
function wholeEnv(name: string, min: number): number | undefined {
  const raw = process.env[name]?.trim();
  if (!raw) return undefined;
  const n = Number(raw);
  if (!(Number.isInteger(n) && n >= min))
    throw new Error(`${name} must be a whole number of at least ${min}, got "${raw}"`);
  return n;
}
const perDay = wholeEnv("RELAYER_DEMO_PER_DAY", 1);
const perClientMs = wholeEnv("RELAYER_DEMO_WINDOW_MS", 0);
const agentGapMs = wholeEnv("RELAYER_AGENT_GAP_MS", 0);
const agentPerHour = wholeEnv("RELAYER_AGENT_PER_HOUR", 1);

const app = createRelayerApp({
  chain,
  publicRpc: process.env.RELAYER_PUBLIC_RPC ?? rpc,
  ...(process.env.RELAYER_ARENA_RECORDER
    ? { arenaRecorder: process.env.RELAYER_ARENA_RECORDER as `0x${string}` }
    : {}),
  trustProxy: process.env.RELAYER_TRUST_PROXY === "1",
  ...(demoKey
    ? {
        demo: {
          issuer: demoIssuer(rpc, demoKey),
          ...(perDay !== undefined ? { perDay } : {}),
          ...(perClientMs !== undefined ? { perClientMs } : {}),
        },
      }
    : {}),
  ...(agentGapMs !== undefined ? { agentGapMs } : {}),
  ...(agentPerHour !== undefined ? { agentPerHour } : {}),
  ...(origins?.length ? { origins } : {}),
});
serve({ fetch: app.fetch, port, hostname: process.env.RELAYER_HOST ?? "127.0.0.1" }, (info) => {
  console.log(`relayer ${chain.relayer} on http://127.0.0.1:${info.port} (rpc ${rpc})`);
});
