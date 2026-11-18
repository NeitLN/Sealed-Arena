import type { PublicClient } from "viem";
import { describe, expect, it } from "vitest";
import { lookUp, readAccount, verdict } from "./verify.js";

const before = { nonce: 3, balance: 5n, block: 100n };

describe("verdict", () => {
  it("unchanged: the hash is unknown and the account did not move", () => {
    expect(verdict(before, { ...before, block: 101n }, false)).toBe("unchanged");
  });
  it("changedOther: the hash is unknown but the account moved (the key is public)", () => {
    expect(verdict(before, { ...before, nonce: 4, balance: 4n }, false)).toBe("changedOther");
  });
  it("found: the chain has the transaction, whatever the account did", () => {
    expect(verdict(before, before, true)).toBe("found");
  });
});

describe("reads", () => {
  const fake = (o: { tx?: unknown; receipt?: unknown }) =>
    ({
      getTransactionCount: async () => 3,
      getBalance: async () => 5n,
      getBlockNumber: async () => 100n,
      request: async ({ method }: { method: string }) =>
        method === "eth_getTransactionByHash" ? (o.tx ?? null) : (o.receipt ?? null),
    }) as unknown as PublicClient;

  it("reads nonce, balance and block at the latest block", async () => {
    expect(await readAccount(fake({}), "0x0000000000000000000000000000000000000001")).toEqual(
      before,
    );
  });

  it("looks the hash up and reports null as not found", async () => {
    expect(await lookUp(fake({}), "0xabc")).toEqual({ tx: null, receipt: null, found: false });
    expect((await lookUp(fake({ tx: { hash: "0xabc" } }), "0xabc")).found).toBe(true);
  });
});
