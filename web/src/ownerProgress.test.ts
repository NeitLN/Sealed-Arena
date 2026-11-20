import { describe, expect, it } from "vitest";
import { maximumLoss, ownerSteps } from "./ownerProgress.js";

describe("console progress", () => {
  it.each([
    [false, false, false, false, ["current", "pending", "pending", "pending"]],
    [true, false, false, false, ["done", "current", "pending", "pending"]],
    [true, true, false, false, ["done", "done", "current", "pending"]],
    [true, true, true, false, ["done", "done", "done", "current"]],
    [true, true, true, true, ["done", "done", "done", "done"]],
    [false, true, true, true, ["current", "pending", "pending", "pending"]],
  ])("uses prerequisites %s %s %s %s", (passkey, agent, linked, mandate, expected) => {
    expect(ownerSteps({ passkey, agent, linked, mandate })).toEqual(expected);
  });
});

describe("maximum loss", () => {
  it("adds one full daily cap to a seven-day mandate, including fees", () => {
    expect(maximumLoss(30n, 7n * 86_400n, 0n)).toEqual({
      days: 7n,
      boundaryDays: 1n,
      amount: 240n,
    });
  });
  it("covers spending on both sides of midnight UTC", () => {
    expect(maximumLoss(30n, 86_401n, 86_399n).amount).toBe(60n);
  });
  it("rounds partial days up without floating point", () => {
    expect(maximumLoss(10n ** 30n, 86_401n, 0n).amount).toBe(3n * 10n ** 30n);
  });
  it("allows nothing at or after expiry", () => {
    expect(maximumLoss(30n, 100n, 100n).amount).toBe(0n);
    expect(maximumLoss(30n, 100n, 101n).amount).toBe(0n);
  });
});
