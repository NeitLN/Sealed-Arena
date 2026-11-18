// "Verify it yourself" on /arena: what the chain says about a payment the node refused, read from
// the public RPC before the send and again after the answer.
import type { Address, Hex, PublicClient } from "viem";

export type Account = { nonce: number; balance: bigint; block: bigint };

/** The agent's nonce and balance at the latest block, and that block's number. */
export async function readAccount(c: PublicClient, agent: Address): Promise<Account> {
  const [nonce, balance, block] = await Promise.all([
    c.getTransactionCount({ address: agent, blockTag: "latest" }),
    c.getBalance({ address: agent, blockTag: "latest" }),
    c.getBlockNumber(),
  ]);
  return { nonce, balance, block };
}

export type Lookup = { inBlock: boolean; pending: boolean };

/**
 * eth_getTransactionByHash and eth_getTransactionReceipt. A transaction with a receipt or a block
 * number is in a block; one the node returns without either is waiting in its pool; null for both
 * means the node does not know it.
 */
export async function lookUp(c: PublicClient, hash: Hex | string) {
  const [tx, receipt] = (await Promise.all([
    c.request({ method: "eth_getTransactionByHash", params: [hash as Hex] }),
    c.request({ method: "eth_getTransactionReceipt", params: [hash as Hex] }),
  ])) as [{ blockNumber?: string | null } | null, unknown];
  const inBlock = receipt != null || (tx != null && tx.blockNumber != null);
  return { tx, receipt, inBlock, pending: !inBlock && tx != null };
}

export type Verdict = "unchanged" | "changedOther" | "pending" | "inBlock";

/**
 * The hash lookup decides. The key is public, so the account can change meanwhile for other
 * reasons (someone else's payment, a top-up); that is reported as a change, not as this transaction.
 */
export function verdict(before: Account, after: Account, look: Lookup): Verdict {
  if (look.inBlock) return "inBlock";
  if (look.pending) return "pending";
  return before.nonce === after.nonce && before.balance === after.balance
    ? "unchanged"
    : "changedOther";
}

/** A command anyone can run to repeat the lookup. */
export const curlFor = (rpc: string, hash: string) =>
  `curl -s -X POST ${rpc} -H 'content-type: application/json' \\\n  -d '{"jsonrpc":"2.0","id":1,"method":"eth_getTransactionByHash","params":["${hash}"]}'`;
