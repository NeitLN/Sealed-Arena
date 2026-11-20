// Small helpers shared by the edge-case and adaptive-attacker scripts: sign an agent transaction
// with any shape, send it raw, and record what the node did with it.
import { CHAIN_ID } from "@sealed-arena/shared";
import type { AccessList, Address, Hex } from "viem";
import type { PrivateKeyAccount } from "viem/accounts";
import type { Node } from "./localnet.js";

export type Shape = {
  to?: Address;
  value?: bigint;
  data?: Hex;
  gas?: bigint;
  type?: "legacy" | "eip2930" | "eip1559";
  nonce?: number;
  maxFeePerGas?: bigint;
  tip?: bigint;
  accessList?: AccessList;
};

/** Signs a transaction of the given shape; missing fields get agent-payment defaults. */
export async function sign(
  n: Node,
  who: PrivateKeyAccount,
  s: Shape,
  fees: { maxFeePerGas: bigint },
): Promise<Hex> {
  const nonce =
    s.nonce ?? (await n.client.getTransactionCount({ address: who.address, blockTag: "pending" }));
  const base = {
    chainId: CHAIN_ID,
    nonce,
    gas: s.gas ?? 21_000n,
    to: s.to,
    value: s.value ?? 0n,
    data: s.data,
  };
  const maxFee = s.maxFeePerGas ?? fees.maxFeePerGas;
  const tip = s.tip ?? 1_000_000_000n;
  switch (s.type ?? "eip1559") {
    case "legacy":
      return who.signTransaction({ ...base, type: "legacy", gasPrice: maxFee });
    case "eip2930":
      return who.signTransaction({
        ...base,
        type: "eip2930",
        gasPrice: maxFee,
        accessList: s.accessList ?? [],
      });
    default:
      return who.signTransaction({
        ...base,
        type: "eip1559",
        maxFeePerGas: maxFee,
        maxPriorityFeePerGas: tip,
        ...(s.accessList ? { accessList: s.accessList } : {}),
      });
  }
}

/** The node's own reason for refusing a transaction (viem keeps it in `details`). */
export function reasonOf(e: unknown): string {
  const text = (
    e instanceof Error ? `${(e as { details?: string }).details ?? ""} ${e.message}` : String(e)
  ).replaceAll(" Missing or invalid parameters.", "");
  return (
    text
      .match(/agent: [a-z0-9 -]+(: [^\n"]*)?/)?.[0]
      ?.trim()
      .slice(0, 160) ??
    text
      .match(
        /(nonce too low|already known|replacement transaction underpriced|insufficient funds[^\n"]*|[a-z ]*not allowed[a-z ]*|transaction type not supported|intrinsic gas too low|exceeds block gas limit)/i,
      )?.[0]
      ?.slice(0, 120) ??
    (e as { details?: string }).details?.split("\n")[0]?.slice(0, 120) ??
    text.split("\n")[0]?.slice(0, 120) ??
    "rejected"
  );
}

export type Sent =
  | { status: "refused"; reason: string }
  | { status: "included"; hash: Hex; block: bigint; ok: boolean }
  | { status: "not included"; hash: Hex; inPool: boolean };

/** Sends a raw transaction and waits up to `timeout` ms for it to be in a block. */
export async function sendRaw(n: Node, raw: Hex, timeout = 15_000): Promise<Sent> {
  let hash: Hex;
  try {
    hash = await n.client.sendRawTransaction({ serializedTransaction: raw });
  } catch (e) {
    return { status: "refused", reason: reasonOf(e) };
  }
  return waitFor(n, hash, timeout);
}

export async function waitFor(n: Node, hash: Hex, timeout: number): Promise<Sent> {
  const r = await n.client
    .waitForTransactionReceipt({ hash, timeout, pollingInterval: 250 })
    .catch(() => undefined);
  if (r) return { status: "included", hash, block: r.blockNumber, ok: r.status === "success" };
  return { status: "not included", hash, inPool: await inPool(n, hash) };
}

/** Whether the node still holds the transaction (pending, not in a block). */
export async function inPool(n: Node, hash: Hex): Promise<boolean> {
  const t = (await n.client.request({
    method: "eth_getTransactionByHash",
    params: [hash],
  })) as { blockNumber: string | null } | null;
  return t !== null && t.blockNumber === null;
}

export const describe = (s: Sent) =>
  s.status === "refused"
    ? `refused: ${s.reason}`
    : s.status === "included"
      ? `included in block ${s.block} (${s.ok ? "success" : "reverted"})`
      : `accepted, not in a block (${s.inPool ? "still in the pool" : "dropped by the pool"})`;
