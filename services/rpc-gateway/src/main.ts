import { serve } from "@hono/node-server";
import { createGatewayApp } from "./app.js";
import { sqliteStore } from "./store.js";

const rpc = process.env.SEALED_RPC_URL;
if (!rpc)
  throw new Error("SEALED_RPC_URL is not set (the node's RPC, reachable only from this host)");
const salt = process.env.GATEWAY_IP_SALT;
if (!salt || salt.length < 16)
  throw new Error("GATEWAY_IP_SALT must be a secret of at least 16 characters");
const port = Number(process.env.GATEWAY_PORT ?? 4050);
const origins = process.env.GATEWAY_ALLOWED_ORIGINS?.split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// A typo must not switch the limit off (Number("abc") is NaN, and NaN compares false).
const perMinuteEnv = process.env.GATEWAY_PER_MINUTE;
const perMinute = perMinuteEnv === undefined ? undefined : Number(perMinuteEnv);
if (perMinute !== undefined && !(Number.isInteger(perMinute) && perMinute > 0))
  throw new Error(`GATEWAY_PER_MINUTE must be a positive whole number, got "${perMinuteEnv}"`);
const store = await sqliteStore(process.env.GATEWAY_DB ?? "attempts.db");
const app = createGatewayApp({
  store,
  ipSalt: salt,
  trustProxy: process.env.GATEWAY_TRUST_PROXY === "1",
  ...(perMinute ? { perMinute } : {}),
  ...(origins?.length ? { origins } : {}),
  upstream: async (req) => {
    const res = await fetch(rpc, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(req),
    });
    return res.json();
  },
});
serve({ fetch: app.fetch, port, hostname: process.env.GATEWAY_HOST ?? "127.0.0.1" }, (info) => {
  console.log(`rpc gateway on http://127.0.0.1:${info.port} → ${rpc}`);
});
