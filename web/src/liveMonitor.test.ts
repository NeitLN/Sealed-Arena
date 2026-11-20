import { type Address, type Hex, TransactionReceiptNotFoundError } from "viem";
import { describe, expect, it } from "vitest";
import { ARENA } from "./arena.config.js";
import { receiptState } from "./liveMonitor.js";

const to = "0x0000000000000000000000000000000000000001" as Address;
describe("live receipt evidence", () => {
  it("requires a matching sender's mined receipt to confirm payment", async () => {
    expect(
      await receiptState(async () => ({
        from: ARENA.agent,
        to,
        status: "success",
        blockNumber: 123n,
      })),
    ).toEqual({ kind: "included", to, block: 123n });
    expect(
      await receiptState(async () => ({ from: to, to, status: "success", blockNumber: 123n })),
    ).toEqual({ kind: "unknown" });
  });
  it("separates reverted inclusion from a successful payment", async () => {
    expect(
      await receiptState(async () => ({
        from: ARENA.agent,
        to,
        status: "reverted",
        blockNumber: 123n,
      })),
    ).toMatchObject({ kind: "reverted" });
  });
  it("distinguishes missing receipts from an unavailable RPC", async () => {
    expect(
      await receiptState(async () => {
        throw new TransactionReceiptNotFoundError({ hash: `0x${"11".repeat(32)}` as Hex });
      }),
    ).toEqual({ kind: "pending" });
    expect(
      await receiptState(async () => {
        throw new Error("offline");
      }),
    ).toEqual({ kind: "unknown" });
  });
});
