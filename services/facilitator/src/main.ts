import { serve } from "@hono/node-server";
import { CHAIN_ID } from "@sealed-arena/shared";
import { createPublicClient, defineChain, http } from "viem";
import { createFacilitatorApp } from "./app.js";

const rpc = process.env.SEALED_RPC_URL;
if (!rpc) throw new Error("SEALED_RPC_URL is not set (see .env.example)");
const port = Number(process.env.FACILITATOR_PORT ?? 4020);

const chain = defineChain({
  id: CHAIN_ID,
  name: "Sealed",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: [rpc] } },
});
const client = createPublicClient({ chain, transport: http(rpc) });

serve({ fetch: createFacilitatorApp(client).fetch, port, hostname: "127.0.0.1" }, (info) => {
  console.log(`facilitator on http://127.0.0.1:${info.port} (rpc ${rpc})`);
});
