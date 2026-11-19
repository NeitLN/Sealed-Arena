import {
  type Address,
  bytesToHex,
  encodeAbiParameters,
  getAddress,
  type Hex,
  isAddressEqual,
  keccak256,
  parseTransaction,
  recoverTransactionAddress,
} from "viem";
import type { Mandate } from "./agentPolicy.js";
import { CHAIN_ID } from "./chain.js";
import { AGENT_MAX_TIP, agentPaymentGas } from "./policyCalls.js";

/**
 * x402 payment with a signed native-coin transaction (docs/ARCHITECTURE.md section 4, docs/decisions/D5.md).
 *
 * The client signs an ordinary L1 transaction that pays the seller in the native coin.
 * Its `data` binds the payment to one resource and one 402 response, so a signed payment
 * cannot be reused for another resource or another request.
 */

/** CAIP-2 id of the Sealed L1. */
export const X402_NETWORK = `eip155:${CHAIN_ID}` as const;
export const X402_SCHEME = "exact";
/** `asset` value for the native coin (it has no token contract). */
export const NATIVE_ASSET = "native";
/** `extra.assetTransferMethod` of this payment method. */
export const SIGNED_NATIVE_TX = "signed-native-tx";
/** Settle first, then serve the resource. */
export const UPFRONT_FLOW = "upfront";

/** `data` of the payment transaction: keccak256(abi.encode(resourceUrl, requestId)). */
export function paymentData(resourceUrl: string, requestId: Hex): Hex {
  return keccak256(
    encodeAbiParameters([{ type: "string" }, { type: "bytes32" }], [resourceUrl, requestId]),
  );
}

/** A fresh random 32-byte request id for one 402 response. */
export function newRequestId(): Hex {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
}

/** The payload a client puts in PAYMENT-SIGNATURE for this method. */
export type SignedNativeTxPayload = {
  /** The signed raw transaction (EIP-1559). */
  signedTransaction: Hex;
};

export type ExpectedPayment = {
  payTo: Address;
  amount: bigint;
  resourceUrl: string;
  requestId: Hex;
};

export type PaymentCheck =
  | {
      ok: true;
      payer: Address;
      hash: Hex;
      nonce: number;
      gas: bigint;
      maxFeePerGas: bigint;
      maxPriorityFeePerGas: bigint;
      data: Hex;
    }
  | { ok: false; reason: string; payer?: Address };

/**
 * Checks a signed payment against what the seller asked for, without touching the chain.
 * The mandate, balance and nonce checks need the chain and live in the facilitator.
 */
export async function checkSignedNativeTx(raw: Hex, want: ExpectedPayment): Promise<PaymentCheck> {
  let tx: ReturnType<typeof parseTransaction>;
  try {
    tx = parseTransaction(raw);
  } catch {
    return { ok: false, reason: "invalid_payload" };
  }
  if (
    tx.type !== "eip1559" ||
    tx.r === undefined ||
    tx.s === undefined ||
    tx.yParity === undefined
  ) {
    return { ok: false, reason: "invalid_payload" };
  }

  let payer: Address;
  try {
    payer = getAddress(await recoverTransactionAddress({ serializedTransaction: raw as never }));
  } catch {
    return { ok: false, reason: "invalid_exact_evm_payload_signature" };
  }

  if (tx.chainId !== CHAIN_ID) return { ok: false, reason: "invalid_network", payer };
  if (!tx.to || !isAddressEqual(tx.to, want.payTo)) {
    return { ok: false, reason: "invalid_exact_evm_payload_recipient_mismatch", payer };
  }
  if ((tx.value ?? 0n) !== want.amount) {
    return { ok: false, reason: "invalid_exact_evm_payload_authorization_value_mismatch", payer };
  }
  if ((tx.data ?? "0x").toLowerCase() !== paymentData(want.resourceUrl, want.requestId)) {
    return { ok: false, reason: "invalid_exact_native_payload_data_mismatch", payer };
  }
  if (tx.accessList && tx.accessList.length > 0)
    return { ok: false, reason: "invalid_payload", payer };

  return {
    ok: true,
    payer,
    hash: keccak256(raw),
    nonce: tx.nonce ?? 0,
    gas: tx.gas ?? 0n,
    maxFeePerGas: tx.maxFeePerGas ?? 0n,
    maxPriorityFeePerGas: tx.maxPriorityFeePerGas ?? 0n,
    data: tx.data ?? "0x",
  };
}

/** What the chain rule charges a payment: value + gasLimit × maxFeePerGas (docs/ARCHITECTURE.md 3.1). */
export function paymentCharge(tx: { value: bigint; gas: bigint; maxFeePerGas: bigint }): bigint {
  return tx.value + tx.gas * tx.maxFeePerGas;
}

export type AgentState = {
  mandate: Mandate;
  frozen: boolean;
  /** getSpend().spentToday, already reset on a new UTC day. */
  spentToday: bigint;
  /** Unix seconds the payment is checked at. */
  now: bigint;
  payeeHasCode: boolean;
  /** Set when agent rule v2 is in force (ruleVersion() answers 2). */
  v2?: {
    /** getFeeSpend() of today, and the mandate's daily fee cap when it has one (getMandateV2). */
    feeSpentToday: bigint;
    feeCapSet: boolean;
    dailyFeeCap: bigint;
    /** Base fee of the latest block. */
    baseFee: bigint;
  };
};

/**
 * The agent rule of the chain (core.CheckAgentTx), in the same order, run before broadcasting
 * so the seller gets the reason without a transaction reaching the chain.
 * The chain checks again when the transaction is included; this is only an early answer.
 */
export function precheckMandate(
  s: AgentState,
  p: {
    to: Address;
    charge: bigint;
    /** Needed for the rule v2 checks (s.v2 set). */
    gas?: bigint;
    data?: Hex;
    maxFeePerGas?: bigint;
    maxPriorityFeePerGas?: bigint;
  },
): string | undefined {
  if (!s.mandate.payees.some((a) => isAddressEqual(a, p.to))) return "agent_payee_not_allowed";
  if (s.payeeHasCode) return "agent_payee_has_code";
  if (s.frozen) return "agent_frozen";
  if (s.now >= s.mandate.expiry) return "agent_mandate_expired";
  if (p.charge > s.mandate.perTxCap) return "agent_budget_exceeded";
  if (s.spentToday + p.charge > s.mandate.dailyCap) return "agent_budget_exceeded";
  if (s.v2) {
    // Rule v2, after every v1 condition, in the order of core.checkAgentTxV2 (the transaction
    // type and access list are checked by checkSignedNativeTx; the payee is the seller).
    const data = p.data ?? "0x";
    const size = (data.length - 2) / 2;
    if (size !== 0 && size !== 32) return "agent_call_data_must_be_empty_or_32_bytes";
    if (p.gas !== agentPaymentGas(data)) return "agent_gas_limit_must_be_21000_plus_the_data_cost";
    const feeCap = p.maxFeePerGas ?? 0n;
    const headroom = feeCap - s.v2.baseFee;
    const tipCap = p.maxPriorityFeePerGas ?? 0n;
    let tip = tipCap; // bigint: no Math.min
    if (headroom < tip) tip = headroom;
    if (tip > AGENT_MAX_TIP) return "agent_tip_too_high";
    if (s.v2.feeCapSet && s.v2.feeSpentToday + (p.gas ?? 0n) * feeCap > s.v2.dailyFeeCap)
      return "agent_fee_budget_exceeded";
  }
  return undefined;
}
