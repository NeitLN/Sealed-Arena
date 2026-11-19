import { describe, expect, it } from "vitest";
import { rewriteResponse, stripSealedUpgrades } from "./chain-config-proxy.js";

// The shape the Fuji node answers today (trimmed).
const config = {
  chainId: 261126,
  warpConfig: { blockTimestamp: 1709740800, requirePrimaryNetworkSigners: true },
  agentPolicyConfig: { blockTimestamp: 0 },
  upgrades: {
    precompileUpgrades: [
      { agentRuleV2Config: { blockTimestamp: 1795086000 } },
      { warpConfig: { blockTimestamp: 1800000000, quorumNumerator: 70 } },
    ],
  },
};

describe("chain-config proxy", () => {
  it("drops only the Sealed precompile upgrades; the Warp config and the rest stay", () => {
    expect(stripSealedUpgrades(config)).toEqual({
      ...config,
      upgrades: {
        precompileUpgrades: [{ warpConfig: { blockTimestamp: 1800000000, quorumNumerator: 70 } }],
      },
    });
  });

  it("rewrites eth_getChainConfig answers only, single and batch, matched by id", () => {
    const single = rewriteResponse(
      JSON.stringify({ jsonrpc: "2.0", id: 7, method: "eth_getChainConfig", params: [] }),
      JSON.stringify({ jsonrpc: "2.0", id: 7, result: config }),
    );
    expect(JSON.parse(single).result.upgrades.precompileUpgrades).toHaveLength(1);

    const batch = rewriteResponse(
      JSON.stringify([
        { jsonrpc: "2.0", id: 1, method: "eth_blockNumber" },
        { jsonrpc: "2.0", id: 2, method: "eth_getChainConfig" },
      ]),
      JSON.stringify([
        { jsonrpc: "2.0", id: 2, result: config },
        { jsonrpc: "2.0", id: 1, result: config },
      ]),
    );
    const [two, one] = JSON.parse(batch);
    expect(two.result.upgrades.precompileUpgrades).toHaveLength(1);
    expect(one.result.upgrades.precompileUpgrades).toHaveLength(2);
  });

  it("passes other calls and non-JSON bodies through byte for byte", () => {
    const body = '{"jsonrpc":"2.0","id":1,"result":"0x1de"}';
    expect(rewriteResponse('{"jsonrpc":"2.0","id":1,"method":"eth_blockNumber"}', body)).toBe(body);
    expect(rewriteResponse("not json", "also not json")).toBe("also not json");
    const err = '{"jsonrpc":"2.0","id":3,"error":{"code":-32000,"message":"x"}}';
    expect(rewriteResponse('{"id":3,"method":"eth_getChainConfig"}', err)).toBe(
      JSON.stringify(JSON.parse(err)),
    );
  });
});
