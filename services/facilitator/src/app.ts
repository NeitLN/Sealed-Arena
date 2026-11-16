import { X402_NETWORK } from "@sealed-arena/shared";
import { x402Facilitator } from "@x402/core/facilitator";
import type { PaymentPayload, PaymentRequirements } from "@x402/core/types";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { PublicClient } from "viem";
import { SignedNativeTxFacilitator } from "./scheme.js";

type Body = {
  x402Version?: number;
  paymentPayload?: PaymentPayload;
  paymentRequirements?: PaymentRequirements;
};

/** x402 facilitator HTTP API: POST /verify, POST /settle, GET /supported. */
export function createFacilitatorApp(
  client: PublicClient,
  opts: { receiptTimeoutMs?: number } = {},
) {
  const facilitator = new x402Facilitator().register(
    X402_NETWORK,
    new SignedNativeTxFacilitator(client, opts),
  );
  const app = new Hono();
  // A payment payload is a few kilobytes; refuse anything far larger.
  app.use("*", bodyLimit({ maxSize: 64 * 1024 }));

  const read = async (c: { req: { json: () => Promise<unknown> } }): Promise<Body | undefined> => {
    const body = (await c.req.json().catch(() => undefined)) as Body | undefined;
    if (!body?.paymentPayload || !body.paymentRequirements) return undefined;
    return body;
  };

  app.get("/supported", (c) => c.json(facilitator.getSupported()));

  app.post("/verify", async (c) => {
    const body = await read(c);
    if (!body) return c.json({ isValid: false, invalidReason: "invalid_payload" }, 400);
    try {
      return c.json(
        await facilitator.verify(
          body.paymentPayload as PaymentPayload,
          body.paymentRequirements as PaymentRequirements,
        ),
      );
    } catch (e) {
      return c.json(
        { isValid: false, invalidReason: "unexpected_verify_error", invalidMessage: String(e) },
        500,
      );
    }
  });

  app.post("/settle", async (c) => {
    const body = await read(c);
    if (!body)
      return c.json(
        { success: false, errorReason: "invalid_payload", transaction: "", network: X402_NETWORK },
        400,
      );
    try {
      return c.json(
        await facilitator.settle(
          body.paymentPayload as PaymentPayload,
          body.paymentRequirements as PaymentRequirements,
        ),
      );
    } catch (e) {
      return c.json(
        {
          success: false,
          errorReason: "unexpected_settle_error",
          errorMessage: String(e),
          transaction: "",
          network: X402_NETWORK,
        },
        500,
      );
    }
  });

  return app;
}
