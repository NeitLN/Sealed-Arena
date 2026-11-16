import { serve } from "@hono/node-server";
import { createRelayerApp } from "./app.js";
import { relayerKey, sealedRelayChain } from "./chain.js";

const rpc = process.env.SEALED_RPC_URL;
if (!rpc) throw new Error("SEALED_RPC_URL is not set (see .env.example)");
const port = Number(process.env.RELAYER_PORT ?? 4040);
const origins = process.env.RELAYER_ALLOWED_ORIGINS?.split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const chain = sealedRelayChain(rpc, relayerKey(rpc));

const app = createRelayerApp({
  chain,
  publicRpc: process.env.RELAYER_PUBLIC_RPC ?? rpc,
  trustProxy: process.env.RELAYER_TRUST_PROXY === "1",
  ...(origins?.length ? { origins } : {}),
});
serve({ fetch: app.fetch, port, hostname: process.env.RELAYER_HOST ?? "127.0.0.1" }, (info) => {
  console.log(`relayer ${chain.relayer} on http://127.0.0.1:${info.port} (rpc ${rpc})`);
});
