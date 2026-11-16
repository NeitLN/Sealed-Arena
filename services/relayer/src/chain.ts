import { AGENT_POLICY_ADDRESS, CHAIN_ID, LOCAL_ROLES } from "@sealed-arena/shared";
import { createPublicClient, createWalletClient, defineChain, type Hex, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { RelayChain } from "./app.js";

const isLocal = (url: string) => /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(url);

/**
 * The relayer's key: RELAYER_PRIVATE_KEY, or the public development key when the RPC is on this
 * machine (local network only).
 */
export function relayerKey(rpc: string, env: NodeJS.ProcessEnv = process.env): Hex {
  const k = env.RELAYER_PRIVATE_KEY;
  if (k) return k as Hex;
  if (isLocal(rpc)) return LOCAL_ROLES.relayer.privateKey;
  throw new Error("RELAYER_PRIVATE_KEY is not set and the RPC is not local");
}

export function sealedRelayChain(rpc: string, key: Hex): RelayChain {
  const chain = defineChain({
    id: CHAIN_ID,
    name: "Sealed",
    nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
    rpcUrls: { default: { http: [rpc] } },
  });
  const account = privateKeyToAccount(key);
  const pub = createPublicClient({ chain, transport: http(rpc) });
  const wallet = createWalletClient({ account, chain, transport: http(rpc) });
  return {
    relayer: account.address,
    chainId: CHAIN_ID,
    async simulate(data) {
      await pub.call({ account: account.address, to: AGENT_POLICY_ADDRESS, data });
    },
    async send(data) {
      const gas = await pub.estimateGas({
        account: account.address,
        to: AGENT_POLICY_ADDRESS,
        data,
      });
      const hash = await wallet.sendTransaction({
        to: AGENT_POLICY_ADDRESS,
        data,
        gas: (gas * 12n) / 10n,
      });
      const receipt = await pub.waitForTransactionReceipt({ hash });
      return { transaction: hash, status: receipt.status };
    },
  };
}
