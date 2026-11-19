import {
  AGENT_POLICY_ADDRESS,
  allowListAbi,
  blockchainIdFromRpc,
  CHAIN_ID,
  cb58ToHex,
  FUJI_BLOCKCHAIN_ID,
  FUJI_POLICY_IDS,
  LOCAL_ROLES,
  type PolicyIds,
  PRECOMPILES,
  readRuleVersion,
} from "@sealed-arena/shared";
import { createPublicClient, createWalletClient, defineChain, type Hex, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { DemoIssuer, RelayChain } from "./app.js";

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

/**
 * The ids a v2 owner proof is bound to: the Sealed L1 on Fuji by its blockchain id, any other
 * chain (the local network) through the node's info API.
 */
export async function policyIdsFor(rpc: string, f: typeof fetch = fetch): Promise<PolicyIds> {
  const bc = blockchainIdFromRpc(rpc);
  if (!bc) throw new Error("the RPC URL has no /ext/bc/<blockchain id>/rpc path");
  if (bc === FUJI_BLOCKCHAIN_ID) return FUJI_POLICY_IDS;
  const r = await f(`${rpc.slice(0, rpc.indexOf("/ext/"))}/ext/info`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "info.getNetworkID", params: {} }),
  });
  const networkId = Number(
    ((await r.json()) as { result?: { networkID?: string } }).result?.networkID,
  );
  if (!Number.isInteger(networkId) || networkId <= 0) throw new Error("info.getNetworkID failed");
  return { chainId: BigInt(CHAIN_ID), networkId, blockchainId: cb58ToHex(bc) };
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
  let ids: Promise<PolicyIds> | undefined;
  return {
    relayer: account.address,
    chainId: CHAIN_ID,
    async policy() {
      ids ??= policyIdsFor(rpc).catch((e: unknown) => {
        ids = undefined;
        throw e;
      });
      const [version, i] = await Promise.all([readRuleVersion(pub), ids]);
      return { version, ids: i };
    },
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

/**
 * The demo issuer: a separate key with the TxAllowList manager role (it can allow and remove
 * senders, not change admins). One transaction at a time, each waited for in a block.
 */
export function demoIssuer(rpc: string, key: Hex): DemoIssuer {
  const chain = defineChain({
    id: CHAIN_ID,
    name: "Sealed",
    nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
    rpcUrls: { default: { http: [rpc] } },
  });
  const account = privateKeyToAccount(key);
  const pub = createPublicClient({ chain, transport: http(rpc) });
  const wallet = createWalletClient({ account, chain, transport: http(rpc) });
  let queue: Promise<unknown> = Promise.resolve();
  const one = <T>(f: () => Promise<T>): Promise<T> => {
    const next = queue.then(f);
    queue = next.catch(() => undefined);
    return next;
  };
  const landed = async (hash: Hex) => {
    const r = await pub.waitForTransactionReceipt({ hash, timeout: 60_000 });
    if (r.status !== "success") throw new Error(`reverted: ${hash}`);
    return hash;
  };
  return {
    async ready() {
      const role = await pub.readContract({
        address: PRECOMPILES.txAllowList,
        abi: allowListAbi,
        functionName: "readAllowList",
        args: [account.address],
      });
      return role === 3n; // manager
    },
    enable: (agent) =>
      one(async () =>
        landed(
          await wallet.writeContract({
            address: PRECOMPILES.txAllowList,
            abi: allowListAbi,
            functionName: "setEnabled",
            args: [agent],
          }),
        ),
      ),
    fund: (agent, wei) =>
      one(async () => landed(await wallet.sendTransaction({ to: agent, value: wei }))),
  };
}
