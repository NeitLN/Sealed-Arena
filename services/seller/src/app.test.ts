import { agentPaymentGas, CHAIN_ID, paymentData, pickSignedNativeTx } from "@sealed-arena/shared";
import { decodePaymentRequiredHeader, encodePaymentSignatureHeader } from "@x402/core/http";
import type { PaymentRequirements } from "@x402/core/types";
import { type Address, type Hex, keccak256, type PublicClient } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";
import { createSellerApp, PRODUCTS } from "./app.js";

const payTo: Address = "0x976EA74026E726554dB657fA54763abd0C3a0aa9";
const buyer = privateKeyToAccount(generatePrivateKey());
const product = PRODUCTS[0] as (typeof PRODUCTS)[number];

/** A seller whose facilitator verifies every payment and never confirms a settle. */
function setup() {
  const onChain = new Map<Hex, { to: Address; value: bigint; input: Hex }>();
  let chainReads = 0;
  const client = {
    getTransaction: async ({ hash }: { hash: Hex }) => {
      chainReads++;
      // Slow enough that two concurrent requests overlap.
      await new Promise((r) => setTimeout(r, 20));
      const tx = onChain.get(hash);
      if (!tx) throw new Error("not found");
      return tx;
    },
    getTransactionReceipt: async ({ hash }: { hash: Hex }) => {
      if (!onChain.has(hash)) throw new Error("not found");
      return { status: "success" };
    },
  } as unknown as PublicClient;
  const facilitator = (async (input: string | URL | Request) => {
    const path = new URL(String(input)).pathname;
    if (path === "/verify") return Response.json({ isValid: true });
    return Response.json({
      success: false,
      errorReason: "facilitator_unreachable",
      transaction: "",
      network: "eip155:261126",
    });
  }) as typeof fetch;
  const app = createSellerApp({
    baseUrl: "http://seller.test",
    payTo,
    facilitatorUrl: "http://facilitator.test",
    client,
    products: [product],
    fetch: facilitator,
  });
  return { app, onChain, reads: () => chainReads };
}

async function quote(app: ReturnType<typeof createSellerApp>) {
  const res = await app.request(product?.path ?? "");
  const required = decodePaymentRequiredHeader(res.headers.get("PAYMENT-REQUIRED") ?? "");
  const req = pickSignedNativeTx(required) as PaymentRequirements;
  return { required, req };
}

async function sign(req: PaymentRequirements, nonce = 0): Promise<Hex> {
  const data = paymentData(req.extra.resourceUrl as string, req.extra.requestId as Hex);
  return buyer.signTransaction({
    type: "eip1559",
    chainId: CHAIN_ID,
    nonce,
    gas: agentPaymentGas(data),
    maxFeePerGas: 25_000_000_000n,
    maxPriorityFeePerGas: 1_000_000_000n,
    to: req.payTo as Address,
    value: BigInt(req.amount),
    data,
  });
}

describe("seller with a lost settle answer", () => {
  it("delivers a pending payment once it is on chain, to one of two concurrent retries", async () => {
    const { app, onChain } = setup();
    const { required, req } = await quote(app);
    const raw = await sign(req);
    const header = encodePaymentSignatureHeader({
      x402Version: 2,
      resource: required.resource,
      accepted: req,
      payload: { signedTransaction: raw },
    });
    const send = () => app.request(product.path, { headers: { "PAYMENT-SIGNATURE": header } });

    const first = await send();
    expect(first.status).toBe(402);
    expect(((await first.json()) as { error: string }).error).toBe("facilitator_unreachable");

    // Not on chain yet: still pending.
    const early = await send();
    expect(((await early.json()) as { error: string }).error).toBe("settlement_pending");

    onChain.set(keccak256(raw), {
      to: payTo,
      value: BigInt(req.amount),
      input: paymentData(req.extra.resourceUrl as string, req.extra.requestId as Hex),
    });
    const [a, b] = await Promise.all([send(), send()]);
    expect([a.status, b.status].sort()).toEqual([200, 402]);
    // And once delivered, the id is used.
    expect((await send()).status).toBe(402);
  });

  it("refuses another transaction for a pending request id", async () => {
    const { app } = setup();
    const { required, req } = await quote(app);
    const pay = async (raw: Hex) => {
      const header = encodePaymentSignatureHeader({
        x402Version: 2,
        resource: required.resource,
        accepted: req,
        payload: { signedTransaction: raw },
      });
      const res = await app.request(product.path, { headers: { "PAYMENT-SIGNATURE": header } });
      return ((await res.json()) as { error: string }).error;
    };
    expect(await pay(await sign(req, 0))).toBe("facilitator_unreachable");
    expect(await pay(await sign(req, 1))).toBe("request_id_already_used");
  });

  it("forgets a pending payment after its time to live", async () => {
    const short = createSellerApp({
      baseUrl: "http://seller.test",
      payTo,
      facilitatorUrl: "http://facilitator.test",
      client: {} as PublicClient,
      products: [product],
      pendingTtlMs: 0,
      fetch: (async (input: string | URL | Request) =>
        new URL(String(input)).pathname === "/verify"
          ? Response.json({ isValid: true })
          : Response.json({
              success: false,
              errorReason: "x",
              transaction: "",
              network: "eip155:261126",
            })) as typeof fetch,
    });
    const { required, req } = await quote(short);
    const header = encodePaymentSignatureHeader({
      x402Version: 2,
      resource: required.resource,
      accepted: req,
      payload: { signedTransaction: await sign(req) },
    });
    await short.request(product.path, { headers: { "PAYMENT-SIGNATURE": header } });
    await new Promise((r) => setTimeout(r, 5));
    await short.request(product.path); // a new 402 prunes expired entries
    const res = await short.request(product.path, { headers: { "PAYMENT-SIGNATURE": header } });
    expect(((await res.json()) as { error: string }).error).toBe("unknown_request_id");
  });
});
