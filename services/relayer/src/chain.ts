import {
  AGENT_POLICY_ADDRESS,
  allowListAbi,
  CHAIN_ID,
  LOCAL_ROLES,
  PRECOMPILES,
} from "@sealed-arena/shared";
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
    async simulate(data, to = AGENT_POLICY_ADDRESS) {
      await pub.call({ account: account.address, to, data });
    },
    async canSend(agent) {
      const role = await pub.readContract({
        address: PRECOMPILES.txAllowList,
        abi: allowListAbi,
        functionName: "readAllowList",
        args: [agent],
      });
      return role > 0n;
    },
    async send(data, to = AGENT_POLICY_ADDRESS) {
      const gas = await pub.estimateGas({
        account: account.address,
        to,
        data,
      });
      const hash = await wallet.sendTransaction({
        to,
        data,
        // Generous: gas can depend on the block time (an ArenaRecorder checkpoint writes a score
        // that is zero when simulated and non-zero a block later). Unused gas is refunded.
        gas: (gas * 3n) / 2n + 50_000n,
      });
      // Sends go through one queue: a transaction that never lands must not hold the others back.
      const receipt = await pub.waitForTransactionReceipt({ hash, timeout: 60_000 });
      return { transaction: hash, status: receipt.status };
    },
  };
}
