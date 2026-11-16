import {
  NATIVE_ASSET,
  newRequestId,
  paymentData,
  SIGNED_NATIVE_TX,
  UPFRONT_FLOW,
  X402_NETWORK,
  X402_SCHEME,
} from "@sealed-arena/shared";
import {
  decodePaymentSignatureHeader,
  encodePaymentRequiredHeader,
  encodePaymentResponseHeader,
} from "@x402/core/http";
import type {
  PaymentPayload,
  PaymentRequired,
  PaymentRequirements,
  SettleResponse,
  VerifyResponse,
} from "@x402/core/types";
import { type Context, Hono } from "hono";
import { type Address, type Hex, isAddressEqual, isHex, keccak256, type PublicClient } from "viem";

/** One paid dataset. Prices are in wei of the native coin (18 decimals). */
export type Product = { path: string; description: string; price: bigint; data: unknown };

export const PRODUCTS: Product[] = [
  {
    path: "/data/fx-rates",
    description: "Sample FX rates (test data)",
    price: 1_000_000_000_000_000n, // 0.001
    data: { base: "USD", rates: { VND: 25_400, EUR: 0.93, JPY: 151.2 }, sample: true },
  },
  {
    path: "/data/weather",
    description: "Sample weather for three cities (test data)",
    price: 2_000_000_000_000_000n, // 0.002
    data: { HCMC: { tempC: 31 }, Hanoi: { tempC: 24 }, DaNang: { tempC: 28 }, sample: true },
  },
  {
    path: "/data/gas-prices",
    description: "Sample fuel prices (test data)",
    price: 5_000_000_000_000_000n, // 0.005
    data: { RON95: 21_000, E5: 20_100, diesel: 19_300, currency: "VND/l", sample: true },
  },
];

type Issued = {
  path: string;
  amount: bigint;
  expires: number;
  /** pending: settle did not confirm after the payment may have been broadcast; only that same transaction can still complete it. */
  state: "issued" | "settling" | "pending" | "delivering" | "used";
  /** Hash of the signed payment once it passed /verify. */
  txHash?: Hex;
};

export type SellerOptions = {
  /** Base URL the buyer reaches this seller at; resource URLs are built from it. */
  baseUrl: string;
  payTo: Address;
  facilitatorUrl: string;
  /** Reads the chain to check the settled transaction itself, not only the facilitator's word. */
  client: PublicClient;
  maxTimeoutSeconds?: number;
  /** How long a pending payment (settle not confirmed) can still be claimed with the same transaction. */
  pendingTtlMs?: number;
  /** How long a 402 request id stays payable. */
  requestTtlMs?: number;
  products?: Product[];
  fetch?: typeof fetch;
};

/** Sample seller: three paid datasets and one free route, paid with x402 signed-native-tx (upfront). */
export function createSellerApp(o: SellerOptions) {
  const products = o.products ?? PRODUCTS;
  const f = o.fetch ?? fetch;
  const maxTimeoutSeconds = o.maxTimeoutSeconds ?? 60;
  const ttl = o.requestTtlMs ?? 5 * 60_000;
  const pendingTtl = o.pendingTtlMs ?? 60 * 60_000;
  const issued = new Map<Hex, Issued>();
  const app = new Hono();

  const resourceUrl = (path: string) => new URL(path, o.baseUrl).toString();

  const requirements = (p: Product, requestId: Hex): PaymentRequirements => ({
    scheme: X402_SCHEME,
    network: X402_NETWORK,
    asset: NATIVE_ASSET,
    amount: p.price.toString(),
    payTo: o.payTo,
    maxTimeoutSeconds,
    extra: {
      assetTransferMethod: SIGNED_NATIVE_TX,
      paymentFlow: UPFRONT_FLOW,
      requestId,
      resourceUrl: resourceUrl(p.path),
    },
  });

  /** A 402 with a fresh request id for this request. */
  const paymentRequired = (c: Context, p: Product, error?: string) => {
    const now = Date.now();
    // Drop expired entries, except ones a request is working on right now.
    for (const [id, v] of issued) {
      if (v.expires < now && v.state !== "settling" && v.state !== "delivering") issued.delete(id);
    }
    const requestId = newRequestId();
    issued.set(requestId, { path: p.path, amount: p.price, expires: now + ttl, state: "issued" });
    const body: PaymentRequired = {
      x402Version: 2,
      ...(error ? { error } : {}),
      resource: {
        url: resourceUrl(p.path),
        description: p.description,
        mimeType: "application/json",
      },
      accepts: [requirements(p, requestId)],
    };
    c.header("PAYMENT-REQUIRED", encodePaymentRequiredHeader(body));
    c.header("Cache-Control", "no-store");
    return c.json(body, 402);
  };

  const post = async <T>(
    path: string,
    payload: PaymentPayload,
    req: PaymentRequirements,
  ): Promise<T> => {
    const res = await f(new URL(path, o.facilitatorUrl), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ x402Version: 2, paymentPayload: payload, paymentRequirements: req }),
    });
    return (await res.json()) as T;
  };

  /** Checks the settled transaction on chain: success, and to/value/data exactly as issued. */
  const settledOnChain = async (hash: string, req: PaymentRequirements): Promise<boolean> => {
    if (!isHex(hash) || hash.length !== 66) return false;
    const [tx, receipt] = await Promise.all([
      o.client.getTransaction({ hash }),
      o.client.getTransactionReceipt({ hash }),
    ]);
    return (
      receipt.status === "success" &&
      tx.to !== null &&
      isAddressEqual(tx.to, o.payTo) &&
      tx.value === BigInt(req.amount) &&
      tx.input.toLowerCase() ===
        paymentData(req.extra.resourceUrl as string, req.extra.requestId as Hex)
    );
  };

  app.get("/free/hello", (c) => c.json({ hello: "Sealed Arena", paid: false }));
  app.get("/catalog", (c) =>
    c.json(
      products.map((p) => ({
        url: resourceUrl(p.path),
        description: p.description,
        price: p.price.toString(),
      })),
    ),
  );

  for (const p of products) {
    app.get(p.path, async (c) => {
      const header = c.req.header("PAYMENT-SIGNATURE");
      if (!header) return paymentRequired(c, p);

      let payload: PaymentPayload;
      try {
        payload = decodePaymentSignatureHeader(header);
      } catch {
        return paymentRequired(c, p, "invalid_payload");
      }
      const requestId = payload.accepted?.extra?.requestId;
      const entry = isHex(requestId) ? issued.get(requestId) : undefined;
      if (!entry || entry.path !== p.path) return paymentRequired(c, p, "unknown_request_id");
      const raw = (payload.payload as { signedTransaction?: unknown }).signedTransaction;
      // The seller's own terms, never the copy the buyer sent back.
      const req = requirements(p, requestId as Hex);

      /** Delivers if `hash` is on chain with a successful receipt and the issued to/value/data. */
      const deliverIfOnChain = async (hash: Hex, payer?: string) => {
        if (!(await settledOnChain(hash, req).catch(() => false))) return undefined;
        entry.state = "used";
        const settled: SettleResponse = {
          success: true,
          transaction: hash,
          network: X402_NETWORK,
          amount: req.amount,
          ...(payer ? { payer } : {}),
        };
        c.header("PAYMENT-RESPONSE", encodePaymentResponseHeader(settled));
        return c.json({ resource: resourceUrl(p.path), data: p.data });
      };

      // A retry after an unconfirmed settle: only the same signed transaction, and only once it is on chain.
      if (entry.state === "pending") {
        if (!isHex(raw) || keccak256(raw) !== entry.txHash) {
          return paymentRequired(c, p, "request_id_already_used");
        }
        // Claimed before the await, so two concurrent retries cannot both deliver.
        entry.state = "delivering";
        const delivered = await deliverIfOnChain(entry.txHash);
        if (delivered) return delivered;
        entry.state = "pending";
        return paymentRequired(c, p, "settlement_pending");
      }
      if (entry.state !== "issued") return paymentRequired(c, p, "request_id_already_used");
      if (entry.expires < Date.now()) return paymentRequired(c, p, "request_id_expired");

      // Single use: claimed before any await, so a concurrent retry sees it as taken.
      entry.state = "settling";

      const verified = await post<VerifyResponse>("/verify", payload, req).catch(
        (): VerifyResponse => ({ isValid: false, invalidReason: "facilitator_unreachable" }),
      );
      if (!verified.isValid) {
        // Nothing reached the chain, but the id is burned: the buyer gets a fresh one.
        entry.state = "used";
        return paymentRequired(c, p, verified.invalidReason ?? "invalid_payment");
      }
      if (!isHex(raw)) {
        entry.state = "used";
        return paymentRequired(c, p, "invalid_payload");
      }
      const txHash = keccak256(raw);
      entry.txHash = txHash;

      const settled = await post<SettleResponse>("/settle", payload, req).catch(
        (): SettleResponse => ({
          success: false,
          errorReason: "facilitator_unreachable",
          transaction: "",
          network: X402_NETWORK,
        }),
      );
      // Whatever the facilitator said, the chain decides: the payment may have landed even if
      // the answer was lost or timed out. Check the signed transaction itself.
      const delivered = await deliverIfOnChain(txHash, settled.payer);
      if (delivered) return delivered;
      // Not on chain (yet): keep the id for this one transaction, so the buyer can retry it.
      entry.state = "pending";
      entry.expires = Date.now() + pendingTtl;
      return paymentRequired(c, p, settled.errorReason ?? "settlement_not_confirmed");
    });
  }

  return app;
}
