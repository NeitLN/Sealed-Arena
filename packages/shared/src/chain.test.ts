import { describe, expect, it } from "vitest";
import { ADDRESSES, CHAIN_ID, CHAIN_NAME, NATIVE_SYMBOL } from "./chain.js";

describe("chain constants", () => {
  it("uses the Sealed L1 chain id", () => {
    expect(CHAIN_ID).toBe(261126);
  });

  it("names the chain and its native coin", () => {
    expect(CHAIN_NAME).toBe("Sealed");
    expect(NATIVE_SYMBOL).toBe("USDC");
  });

  it("leaves addresses unset until they are deployed or verified", () => {
    for (const value of Object.values(ADDRESSES)) {
      expect(value).toBeUndefined();
    }
  });
});
