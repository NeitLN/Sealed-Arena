// "Try a forbidden payment" on /arena: sign a real transaction with the public challenge key in the
// browser and send it to the Sealed L1 through the public RPC, then show what the node answered.
import { CHAIN_ID } from "@sealed-arena/shared";
import { type Address, type Hex, keccak256, type PublicClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";

export type SendOutcome =
  | { kind: "refused"; reason: string }
  | { kind: "accepted"; hash: string }
  | { kind: "busy" }
  /** The node answered with an error that is not the rule's (e.g. insufficient funds). */
  | { kind: "node"; message: string }
  /** No answer from the node (network, timeout). */
  | { kind: "error"; message: string };

/** What the node's answer means. A refusal is only a message the rule itself wrote ("agent: …"). */
export function classifySend(r: { hash?: string; error?: unknown }): SendOutcome {
  if (r.hash) return { kind: "accepted", hash: r.hash };
  const e = r.error as
    | {
        details?: unknown;
        message?: unknown;
        status?: unknown;
        code?: unknown;
        cause?: { code?: unknown };
      }
    | undefined;
  const text = [e?.details, e?.message].filter((x) => typeof x === "string").join("\n");
  const rule = text.match(/agent: [a-z][a-z ]*[a-z]/);
  if (rule) return { kind: "refused", reason: rule[0] };
  if (e?.status === 429 || /rate limited|\b429\b/.test(text)) return { kind: "busy" };
  const first = (typeof e?.details === "string" ? e.details : String(e?.message ?? r.error))
    .split("\n")[0]
    ?.trim();
  // A JSON-RPC error code means the node answered; without one, the request did not get through.
  let answered = false;
  for (let x: unknown = e, depth = 0; x && depth < 6; depth++) {
    if (typeof (x as { code?: unknown }).code === "number") answered = true;
    x = (x as { cause?: unknown }).cause;
  }
  return { kind: answered ? "node" : "error", message: first || "unknown error" };
}

/**
 * Signs a plain transfer with the challenge agent's key and sends it as it is, with a fixed gas of
 * 21,000 instead of an estimate: a plain transfer needs exactly that, and it saves a call. (The rule
 * does not run in eth_estimateGas or eth_call, see decision D1; the answer comes from the send.)
 */
export async function sendAsAgent(
  client: PublicClient,
  key: Hex,
  to: Address,
  value: bigint,
): Promise<SendOutcome & { signed?: Hex }> {
  const account = privateKeyToAccount(key);
  // The hash of the signed bytes, known before the node answers: anyone can look it up afterwards.
  let signed: Hex | undefined;
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
    signed = keccak256(raw);
    const hash = await client.request({ method: "eth_sendRawTransaction", params: [raw] });
    return { ...classifySend({ hash: hash as string }), signed };
  } catch (error) {
    return { ...classifySend({ error }), ...(signed ? { signed } : {}) };
  }
}
