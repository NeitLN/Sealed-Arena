import type { Address, Hex } from "viem";

/**
 * The open red-team challenge on the Sealed L1 (Fuji testnet).
 *
 * The agent's private key below is PUBLIC ON PURPOSE: anyone may use it to try to move coins
 * outside the agent's mandate. It holds only test coins on this testnet L1. Never fund it on any
 * other chain. The owner key that sets the mandate is not public.
 */
export const ARENA = {
  url: "https://sealed-arena.vercel.app/arena",
  agent: "0x30b01562945BB3cE72241b0EaaEB3F41660982F6" as Address,
  agentPrivateKey: "0x440d3721e44d7bbac6c584089dc7abe2f87eb1188dc0bbdb98aae2a613da6833" as Hex,
  recorder: "0x60d046fa32a101229f78d69b655a91193cdf4f77" as Address,
  chainIdHex: "0x3fc06",
  chainName: "Sealed (Fuji testnet)",
  validators: ["NodeID-6TgSfU7azciZHPtkWZ6qnc8wsqMHyTTGL"],
  source: "https://github.com/NeitLN/Sealed-Arena",
  deployments:
    "https://github.com/NeitLN/Sealed-Arena/blob/main/services/fuji-ops/deployments/fuji.json",
};

/** Where the gateway (public RPC, attempt records) is: the relayer's origin. */
export const GATEWAY_URL: string =
  import.meta.env.VITE_GATEWAY_URL ?? "https://sealed-arena.duckdns.org";
