import { CHAIN_ID, FUJI_POLICY_IDS, registerDigestFor } from "@sealed-arena/shared";
import { type Hex, recoverAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";
import { prepareDemoClaim, type RelayerInfo } from "./owner.js";

const passkey = {
  credentialId: "local",
  x: `0x${"11".repeat(32)}` as Hex,
  y: `0x${"22".repeat(32)}` as Hex,
};
const info: RelayerInfo = {
  relayer: "0x0000000000000000000000000000000000000001",
  target: "0x0000000000000000000000000000000000000002",
  chainId: CHAIN_ID,
  rpc: "http://localhost:9650/rpc",
  networkId: FUJI_POLICY_IDS.networkId,
  blockchainId: FUJI_POLICY_IDS.blockchainId,
  ruleVersion: 2,
};

describe("browser demo claim", () => {
  it.each([1, 2] as const)("keeps the key out of the v%s API payload", async (version) => {
    const { privateKey, request } = await prepareDemoClaim(passkey, {
      ...info,
      ruleVersion: version,
    });
    expect(Object.keys(request).sort()).toEqual(["agent", "agentSig", "ownerX", "ownerY"]);
    expect(JSON.stringify(request)).not.toContain(privateKey);
    expect(privateKeyToAccount(privateKey).address).toBe(request.agent);
    expect(
      await recoverAddress({
        hash: registerDigestFor(version, FUJI_POLICY_IDS, request.agent, passkey.x, passkey.y),
        signature: request.agentSig,
      }),
    ).toBe(request.agent);
  });
  it("fails closed without policy metadata or on another chain", async () => {
    const { ruleVersion: _, ...missing } = info;
    await expect(prepareDemoClaim(passkey, missing)).rejects.toThrow("demoFailed");
    await expect(prepareDemoClaim(passkey, { ...info, chainId: 1 })).rejects.toThrow(
      "chain_mismatch",
    );
  });
});
