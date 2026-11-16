import { serve } from "@hono/node-server";
import { CHAIN_ID, LOCAL_PAYEES } from "@sealed-arena/shared";
import { type Address, createPublicClient, defineChain, http } from "viem";
import { createSellerApp } from "./app.js";

const rpc = process.env.SEALED_RPC_URL;
if (!rpc) throw new Error("SEALED_RPC_URL is not set (see .env.example)");
const port = Number(process.env.SELLER_PORT ?? 4021);
const payTo = (process.env.SELLER_PAY_TO ?? LOCAL_PAYEES[0]) as Address;
const facilitatorUrl = process.env.FACILITATOR_URL ?? "http://127.0.0.1:4020";
const baseUrl = process.env.SELLER_BASE_URL ?? `http://127.0.0.1:${port}`;

const chain = defineChain({
  id: CHAIN_ID,
  name: "Sealed",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: [rpc] } },
});
const client = createPublicClient({ chain, transport: http(rpc) });

serve(
  {
    fetch: createSellerApp({ baseUrl, payTo, facilitatorUrl, client }).fetch,
    port,
    hostname: "127.0.0.1",
  },
  (info) => {
    console.log(
      `seller on http://127.0.0.1:${info.port}, pays to ${payTo}, facilitator ${facilitatorUrl}`,
    );
  },
);
