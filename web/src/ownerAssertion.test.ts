import { challengeToBase64Url } from "@sealed-arena/shared";
import type { Hex } from "viem";
import { describe, expect, it } from "vitest";
import { assertionProblem } from "./owner.js";

const challenge = `0x${"5e".repeat(32)}` as Hex;
const authData = (flags: number) => {
  const b = new Uint8Array(37);
  b[32] = flags;
  return b;
};
const cd = (s: string) => new TextEncoder().encode(s);
const good = cd(
  `{"type":"webauthn.get","challenge":"${challengeToBase64Url(challenge)}","origin":"https://sealed.example"}`,
);

describe("owner page: assertions under rule v3", () => {
  it("refuses an assertion without user verification for every action except freeze", () => {
    for (const action of [
      "setMandate",
      "unfreeze",
      "cancelPending",
      "setGuardian",
      "sweep",
    ] as const) {
      expect(
        assertionProblem(3, action, challenge, {
          authenticatorData: authData(0x01),
          clientDataJSON: good,
        }),
      ).toBe("passkey_no_user_verification");
      expect(
        assertionProblem(3, action, challenge, {
          authenticatorData: authData(0x05),
          clientDataJSON: good,
        }),
      ).toBeUndefined();
    }
    expect(
      assertionProblem(3, "freeze", challenge, {
        authenticatorData: authData(0x01),
        clientDataJSON: good,
      }),
    ).toBeUndefined();
  });

  it("refuses clientDataJSON the strict parser refuses (whitespace here)", () => {
    const spaced = cd(
      `{ "type": "webauthn.get", "challenge": "${challengeToBase64Url(challenge)}" }`,
    );
    expect(
      assertionProblem(3, "freeze", challenge, {
        authenticatorData: authData(0x05),
        clientDataJSON: spaced,
      }),
    ).toBe("passkey_client_data_refused");
  });

  it("checks nothing before rule v3", () => {
    const spaced = cd(`{ "type": "webauthn.get" }`);
    expect(
      assertionProblem(2, "setMandate", challenge, {
        authenticatorData: authData(0x01),
        clientDataJSON: spaced,
      }),
    ).toBeUndefined();
  });
});
