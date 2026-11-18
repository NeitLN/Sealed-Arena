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

/** eth_getTransactionByHash and eth_getTransactionReceipt, raw: null means the chain has no such transaction. */
export async function lookUp(c: PublicClient, hash: Hex | string) {
  const [tx, receipt] = await Promise.all([
    c.request({ method: "eth_getTransactionByHash", params: [hash as Hex] }),
    c.request({ method: "eth_getTransactionReceipt", params: [hash as Hex] }),
  ]);
  return { tx, receipt, found: tx != null || receipt != null };
}

export type Verdict = "unchanged" | "changedOther" | "found";

/**
 * The hash lookup decides. The key is public, so another visitor's payment inside the mandate can
 * move the nonce and balance meanwhile; that is reported as such, not as this transaction.
 */
export function verdict(before: Account, after: Account, found: boolean): Verdict {
  if (found) return "found";
  return before.nonce === after.nonce && before.balance === after.balance
    ? "unchanged"
    : "changedOther";
}

/** A command anyone can run to repeat the lookup. */
export const curlFor = (rpc: string, hash: string) =>
  `curl -s -X POST ${rpc} -H 'content-type: application/json' \\\n  -d '{"jsonrpc":"2.0","id":1,"method":"eth_getTransactionByHash","params":["${hash}"]}'`;
