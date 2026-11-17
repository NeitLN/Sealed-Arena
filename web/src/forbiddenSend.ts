// "Try a forbidden payment" on /arena: sign a real transaction with the public challenge key in the
// browser and send it to the Sealed L1 through the public RPC, then show what the node answered.
import { CHAIN_ID } from "@sealed-arena/shared";
import type { Address, Hex, PublicClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";

export type SendOutcome =
  | { kind: "refused"; reason: string }
  | { kind: "accepted"; hash: string }
  | { kind: "busy" }
  | { kind: "error"; message: string };

/** What the node's answer means. A refusal is only a message the rule itself wrote ("agent: …"). */
export function classifySend(r: { hash?: string; error?: unknown }): SendOutcome {
  if (r.hash) return { kind: "accepted", hash: r.hash };
  const e = r.error as { details?: unknown; message?: unknown; status?: unknown } | undefined;
  const text = [e?.details, e?.message].filter((x) => typeof x === "string").join("\n");
  const rule = text.match(/agent: [a-z][a-z ]*[a-z]/);
  if (rule) return { kind: "refused", reason: rule[0] };
  if (e?.status === 429 || /rate limited|\b429\b/.test(text)) return { kind: "busy" };
  const first = (typeof e?.details === "string" ? e.details : String(e?.message ?? r.error))
    .split("\n")[0]
    ?.trim();
  return { kind: "error", message: first || "unknown error" };
}

/**
 * Signs a plain transfer with the challenge agent's key and sends it as it is: no gas estimate
 * first (an estimate would already fail at the rule and nothing would be sent).
 */
export async function sendAsAgent(
  client: PublicClient,
  key: Hex,
  to: Address,
  value: bigint,
): Promise<SendOutcome> {
  const account = privateKeyToAccount(key);
  try {
    const [nonce, fees] = await Promise.all([
      client.getTransactionCount({ address: account.address, blockTag: "pending" }),
      client.estimateFeesPerGas(),
    ]);
    const raw = await account.signTransaction({
      type: "eip1559",
      chainId: CHAIN_ID,
      nonce,
      gas: 21_000n,
      maxFeePerGas: fees.maxFeePerGas,
      maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
      to,
      value,
    });
    const hash = await client.request({ method: "eth_sendRawTransaction", params: [raw] });
    return classifySend({ hash: hash as string });
  } catch (error) {
    return classifySend({ error });
  }
}
