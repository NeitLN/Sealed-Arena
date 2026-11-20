import { type Address, encodeAbiParameters, type Hex, keccak256 } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";
import { UNLIMITED_PAYMENTS } from "./agentPolicy.js";
import { CHAIN_ID } from "./chain.js";
import {
  checkSignedNativeTx,
  effectiveMandateV3,
  newRequestId,
  paymentCharge,
  paymentData,
  precheckMandate,
  SIGNED_NATIVE_TX,
  X402_NETWORK,
} from "./x402.js";

const payer = privateKeyToAccount(generatePrivateKey());
const payTo: Address = "0x976EA74026E726554dB657fA54763abd0C3a0aa9";
const resourceUrl = "http://127.0.0.1:4021/data/prices";
const requestId = newRequestId();
const amount = 1_000_000_000_000_000n;
const expected = { payTo, amount, resourceUrl, requestId };

const sign = (o: Partial<{ to: Address; value: bigint; data: Hex; chainId: number }> = {}) =>
  payer.signTransaction({
    type: "eip1559",
    chainId: o.chainId ?? CHAIN_ID,
    nonce: 0,
    gas: 30_000n,
    maxFeePerGas: 25_000_000_000n,
    maxPriorityFeePerGas: 1_000_000_000n,
    to: o.to ?? payTo,
    value: o.value ?? amount,
    data: o.data ?? paymentData(resourceUrl, requestId),
  });

describe("x402 constants", () => {
  it("name the Sealed network in CAIP-2 form and the transfer method", () => {
    expect(X402_NETWORK).toBe("eip155:261126");
    expect(SIGNED_NATIVE_TX).toBe("signed-native-tx");
  });
});

describe("paymentData", () => {
  it("is keccak256(abi.encode(resourceUrl, requestId))", () => {
    const want = keccak256(
      encodeAbiParameters([{ type: "string" }, { type: "bytes32" }], [resourceUrl, requestId]),
    );
    expect(paymentData(resourceUrl, requestId)).toBe(want);
  });

  it("changes with the resource and with the request id", () => {
    const base = paymentData(resourceUrl, requestId);
    expect(paymentData(`${resourceUrl}x`, requestId)).not.toBe(base);
    expect(paymentData(resourceUrl, newRequestId())).not.toBe(base);
  });

  it("issues 32-byte random request ids", () => {
    const a = newRequestId();
    expect(a).toMatch(/^0x[0-9a-f]{64}$/);
    expect(newRequestId()).not.toBe(a);
  });
});

describe("checkSignedNativeTx", () => {
  it("accepts the exact payment and recovers the payer", async () => {
    const r = await checkSignedNativeTx(await sign(), expected);
    expect(r).toMatchObject({ ok: true, payer: payer.address });
  });

  it.each([
    [
      "another recipient",
      { to: "0x14dC79964da2C08b23698B3D3cc7Ca32193d9955" as Address },
      "invalid_exact_evm_payload_recipient_mismatch",
    ],
    [
      "less than the price",
      { value: amount - 1n },
      "invalid_exact_evm_payload_authorization_value_mismatch",
    ],
    [
      "more than the price",
      { value: amount + 1n },
      "invalid_exact_evm_payload_authorization_value_mismatch",
    ],
    [
      "data of another resource",
      { data: paymentData(`${resourceUrl}/other`, requestId) },
      "invalid_exact_native_payload_data_mismatch",
    ],
    [
      "data of another request",
      { data: paymentData(resourceUrl, newRequestId()) },
      "invalid_exact_native_payload_data_mismatch",
    ],
    ["another chain id", { chainId: 43113 }, "invalid_network"],
  ])("rejects %s", async (_name, override, reason) => {
    const r = await checkSignedNativeTx(await sign(override), expected);
    expect(r).toMatchObject({ ok: false, reason });
  });

  it("rejects bytes that are not a signed transaction", async () => {
    expect(await checkSignedNativeTx("0x1234", expected)).toMatchObject({
      ok: false,
      reason: "invalid_payload",
    });
  });

  it("does not attribute a tampered signature to the payer", async () => {
    const raw = await sign();
    const tampered =
      `${raw.slice(0, -8)}${raw.slice(-8, -6) === "00" ? "01" : "00"}${raw.slice(-6)}` as Hex;
    const r = await checkSignedNativeTx(tampered, expected);
    if (r.ok) expect(r.payer).not.toBe(payer.address);
    else expect(r.reason).toBe("invalid_exact_evm_payload_signature");
  });
});

describe("precheckMandate", () => {
  const mandate = {
    payees: [payTo],
    perTxCap: 10n ** 18n,
    dailyCap: 2n * 10n ** 18n,
    expiry: 2_000_000_000n,
  };
  const ok = { mandate, frozen: false, spentToday: 0n, now: 1_900_000_000n, payeeHasCode: false };
  const pay = { to: payTo, charge: amount };

  it("passes a payment inside the mandate", () => {
    expect(precheckMandate(ok, pay)).toBeUndefined();
  });

  it.each([
    [
      "a payee outside the list",
      { ...ok },
      { ...pay, to: "0x14dC79964da2C08b23698B3D3cc7Ca32193d9955" as Address },
      "agent_payee_not_allowed",
    ],
    ["a payee with code", { ...ok, payeeHasCode: true }, pay, "agent_payee_has_code"],
    ["a frozen agent", { ...ok, frozen: true }, pay, "agent_frozen"],
    ["an expired mandate", { ...ok, now: mandate.expiry }, pay, "agent_mandate_expired"],
    [
      "a charge above perTxCap",
      ok,
      { ...pay, charge: mandate.perTxCap + 1n },
      "agent_budget_exceeded",
    ],
    [
      "a charge past dailyCap",
      { ...ok, spentToday: mandate.dailyCap - amount + 1n },
      pay,
      "agent_budget_exceeded",
    ],
  ])("rejects %s", (_name, state, payment, reason) => {
    expect(precheckMandate(state, payment)).toBe(reason);
  });

  it("checks in the order of the chain rule: payee before frozen", () => {
    expect(
      precheckMandate(
        { ...ok, frozen: true },
        { ...pay, to: "0x14dC79964da2C08b23698B3D3cc7Ca32193d9955" },
      ),
    ).toBe("agent_payee_not_allowed");
  });

  describe("under rule v2", () => {
    const ref = `0x${"ab".repeat(32)}` as const;
    const gwei = 1_000_000_000n;
    const v2 = { feeSpentToday: 0n, feeCapSet: true, dailyFeeCap: 10n ** 16n, baseFee: 25n * gwei };
    const p2 = {
      ...pay,
      data: ref,
      gas: 21_000n + 16n * 32n,
      maxFeePerGas: 50n * gwei,
      maxPriorityFeePerGas: gwei,
    };

    it("passes a payment within the v2 limits", () => {
      expect(precheckMandate({ ...ok, v2 }, p2)).toBeUndefined();
    });
    it.each([
      [
        "gas other than the intrinsic gas",
        { gas: 30_000n },
        {},
        "agent_gas_limit_must_be_21000_plus_the_data_cost",
      ],
      ["a tip above 1 gwei", { maxPriorityFeePerGas: gwei + 1n }, {}, "agent_tip_too_high"],
      [
        "the daily fee cap passed",
        {},
        { feeSpentToday: 10n ** 16n - 1n },
        "agent_fee_budget_exceeded",
      ],
    ])("rejects %s", (_name, payPatch, v2Patch, reason) => {
      expect(precheckMandate({ ...ok, v2: { ...v2, ...v2Patch } }, { ...p2, ...payPatch })).toBe(
        reason,
      );
    });
    it("the tip is capped by fee cap minus base fee; no fee cap set means no fee budget", () => {
      // tipCap 5 gwei but only 1 gwei above the base fee: effective tip 1 gwei.
      expect(
        precheckMandate(
          { ...ok, v2 },
          { ...p2, maxFeePerGas: 26n * gwei, maxPriorityFeePerGas: 5n * gwei },
        ),
      ).toBeUndefined();
      expect(
        precheckMandate({ ...ok, v2: { ...v2, feeCapSet: false, feeSpentToday: 10n ** 18n } }, p2),
      ).toBeUndefined();
    });
    it("v1 conditions come first", () => {
      expect(precheckMandate({ ...ok, frozen: true, v2 }, { ...p2, gas: 1n })).toBe("agent_frozen");
    });
  });

  describe("under rule v3", () => {
    const gwei = 1_000_000_000n;
    const v2 = { feeSpentToday: 0n, feeCapSet: true, dailyFeeCap: 10n ** 16n, baseFee: 25n * gwei };
    const p3 = {
      ...pay,
      value: 500n,
      gas: 21_000n,
      maxFeePerGas: 50n * gwei,
      maxPriorityFeePerGas: gwei,
    };
    const v3 = {
      paymentsToday: 2,
      maxPaymentsPerDay: 3,
      payeeSpentToday: 400n,
      payeeDailyCap: 1_000n,
    };

    it("passes within the payment count and the payee cap", () => {
      expect(precheckMandate({ ...ok, v2, v3 }, p3)).toBeUndefined();
      expect(
        precheckMandate({ ...ok, v2, v3: { ...v3, payeeSpentToday: 500n } }, p3),
      ).toBeUndefined();
    });
    it("rejects the payment past the day's count, and value past the payee cap (fees not counted)", () => {
      expect(precheckMandate({ ...ok, v2, v3: { ...v3, paymentsToday: 3 } }, p3)).toBe(
        "agent_daily_payment_count_exceeded",
      );
      expect(precheckMandate({ ...ok, v2, v3: { ...v3, payeeSpentToday: 501n } }, p3)).toBe(
        "agent_payee_budget_exceeded",
      );
    });
    it("no limit: UNLIMITED_PAYMENTS and no payee cap", () => {
      const { payeeDailyCap: _, ...noCap } = v3;
      expect(
        precheckMandate(
          {
            ...ok,
            v2,
            v3: {
              ...noCap,
              paymentsToday: 10_000,
              maxPaymentsPerDay: UNLIMITED_PAYMENTS,
              payeeSpentToday: 10n ** 30n,
            },
          },
          p3,
        ),
      ).toBeUndefined();
    });
    it("v2 conditions come first", () => {
      expect(
        precheckMandate(
          { ...ok, v2, v3: { ...v3, paymentsToday: 3 } },
          { ...p3, maxPriorityFeePerGas: 2n * gwei },
        ),
      ).toBe("agent_tip_too_high");
    });
    it("a scheduled mandate applies from its eta by the caller's clock", () => {
      expect(effectiveMandateV3("old", "new", 0n, 10n ** 12n)).toBe("old");
      expect(effectiveMandateV3("old", "new", 100n, 99n)).toBe("old");
      expect(effectiveMandateV3("old", "new", 100n, 100n)).toBe("new");
    });
  });

  it("charges value plus gas limit times fee cap, like the chain rule", () => {
    expect(paymentCharge({ value: 5n, gas: 30_000n, maxFeePerGas: 2n })).toBe(60_005n);
  });
});
