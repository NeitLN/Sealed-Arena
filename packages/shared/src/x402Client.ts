import {
  decodePaymentRequiredHeader,
  decodePaymentResponseHeader,
  encodePaymentSignatureHeader,
} from "@x402/core/http";
import type {
  PaymentPayload,
  PaymentRequired,
  PaymentRequirements,
  SettleResponse,
} from "@x402/core/types";
import type { Address, Hex, PublicClient } from "viem";
import type { PrivateKeyAccount } from "viem/accounts";
import { CHAIN_ID } from "./chain.js";
import {
  NATIVE_ASSET,
  PAYMENT_GAS,
  paymentData,
  SIGNED_NATIVE_TX,
  X402_NETWORK,
  X402_SCHEME,
} from "./x402.js";

/** The payment option this client can pay, from a 402 response. */
export function pickSignedNativeTx(required: PaymentRequired): PaymentRequirements | undefined {
  return required.accepts.find(
    (a) =>
      a.scheme === X402_SCHEME &&
      a.network === X402_NETWORK &&
      a.asset === NATIVE_ASSET &&
      a.extra?.assetTransferMethod === SIGNED_NATIVE_TX,
  );
}

/** Signs the payment transaction asked for by `req` (to = payTo, value = amount, data binds resource and request). */
export async function signPayment(
  account: PrivateKeyAccount,
  client: PublicClient,
  req: PaymentRequirements,
): Promise<Hex> {
  const [nonce, fees] = await Promise.all([
    client.getTransactionCount({ address: account.address, blockTag: "pending" }),
    client.estimateFeesPerGas(),
  ]);
  return account.signTransaction({
    type: "eip1559",
    chainId: CHAIN_ID,
    nonce,
    gas: PAYMENT_GAS,
    maxFeePerGas: fees.maxFeePerGas,
    maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
    to: req.payTo as Address,
    value: BigInt(req.amount),
    data: paymentData(req.extra.resourceUrl as string, req.extra.requestId as Hex),
  });
}

export type PaidFetchResult = {
  response: Response;
  /** Set when the seller asked for payment. */
  required?: PaymentRequired;
  /** PAYMENT-RESPONSE of the paid request, when there is one. */
  settlement?: SettleResponse;
};

/**
 * GET `url`; on 402 pay with a signed native transaction and retry once.
 * `maxAmount` (wei) is a client-side ceiling: a price above it is not paid.
 */
export async function fetchWithPayment(
  url: string,
  opts: {
    account: PrivateKeyAccount;
    client: PublicClient;
    maxAmount: bigint;
    fetch?: typeof fetch;
  },
): Promise<PaidFetchResult> {
  const f = opts.fetch ?? fetch;
  const first = await f(url);
  if (first.status !== 402) return { response: first };

  const header = first.headers.get("PAYMENT-REQUIRED");
  if (!header) throw new Error("402 without a PAYMENT-REQUIRED header");
  const required = decodePaymentRequiredHeader(header);
  const req = pickSignedNativeTx(required);
  if (!req) throw new Error("the seller offers no signed-native-tx payment on the Sealed L1");
  if (BigInt(req.amount) > opts.maxAmount) {
    throw new Error(`price ${req.amount} is above the client ceiling ${opts.maxAmount}`);
  }
  if (req.extra.resourceUrl !== required.resource.url)
    throw new Error("payment option names another resource");

  const payload: PaymentPayload = {
    x402Version: required.x402Version,
    resource: required.resource,
    accepted: req,
    payload: { signedTransaction: await signPayment(opts.account, opts.client, req) },
  };
  const response = await f(url, {
    headers: { "PAYMENT-SIGNATURE": encodePaymentSignatureHeader(payload) },
  });
  const settled = response.headers.get("PAYMENT-RESPONSE");
  return {
    response,
    required,
    ...(settled ? { settlement: decodePaymentResponseHeader(settled) } : {}),
  };
}
