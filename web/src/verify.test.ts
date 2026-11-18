import type { PublicClient } from "viem";
import { describe, expect, it } from "vitest";
import { lookUp, readAccount, verdict } from "./verify.js";

const before = { nonce: 3, balance: 5n, block: 100n };
const none = { inBlock: false, pending: false };

describe("verdict", () => {
  it("unchanged: the hash is unknown and the account did not move", () => {
    expect(verdict(before, { ...before, block: 101n }, none)).toBe("unchanged");
  });
  it("changedOther: the hash is unknown but the nonce moved (the key is public)", () => {
    expect(verdict(before, { ...before, nonce: 4, balance: 4n }, none)).toBe("changedOther");
  });
  it("changedOther: the balance moved with the same nonce (someone topped the agent up)", () => {
    expect(verdict(before, { ...before, balance: 6n }, none)).toBe("changedOther");
  });
  it("pending: the node holds the transaction in its pool, not in a block", () => {
    expect(verdict(before, before, { inBlock: false, pending: true })).toBe("pending");
  });
  it("inBlock: the chain has the transaction in a block, whatever the account did", () => {
    expect(verdict(before, before, { inBlock: true, pending: false })).toBe("inBlock");
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

  it("tells a transaction in a block from one waiting in the pool", async () => {
    expect(await lookUp(fake({}), "0xabc")).toMatchObject({ inBlock: false, pending: false });
    expect(await lookUp(fake({ tx: { hash: "0xabc", blockNumber: null } }), "0xabc")).toMatchObject(
      { inBlock: false, pending: true },
    );
    expect(
      await lookUp(fake({ tx: { hash: "0xabc", blockNumber: "0x10" } }), "0xabc"),
    ).toMatchObject({ inBlock: true, pending: false });
    expect(
      await lookUp(fake({ tx: { hash: "0xabc" }, receipt: { blockNumber: "0x10" } }), "0xabc"),
    ).toMatchObject({ inBlock: true, pending: false });
  });
});
