import { cb58ToHex, FUJI_BLOCKCHAIN_ID, FUJI_POLICY_IDS, LOCAL_ROLES } from "@sealed-arena/shared";
import { describe, expect, it } from "vitest";
import { revertReason } from "./app.js";
import { policyIdsFor, relayerKey } from "./chain.js";

describe("relayerKey", () => {
  it("uses the development key only for an RPC on this machine", () => {
    expect(relayerKey("http://127.0.0.1:9650/ext/bc/x/rpc", {})).toBe(
      LOCAL_ROLES.relayer.privateKey,
    );
    expect(relayerKey("http://localhost:9650/ext/bc/x/rpc", {})).toBe(
      LOCAL_ROLES.relayer.privateKey,
    );
    expect(() => relayerKey("https://rpc.example.org/ext/bc/x/rpc", {})).toThrow();
    expect(() => relayerKey("http://127.0.0.1.evil.org/rpc", {})).toThrow();
  });

  it("prefers RELAYER_PRIVATE_KEY", () => {
    expect(relayerKey("https://rpc.example.org/", { RELAYER_PRIVATE_KEY: "0x01" })).toBe("0x01");
  });
});

describe("revertReason", () => {
  it("keeps the node's text after 'execution reverted'", () => {
    expect(revertReason(new Error("execution reverted: agentpolicy: bad nonce\nDetails: x"))).toBe(
      "agentpolicy: bad nonce",
    );
  });
});

describe("policyIdsFor", () => {
  it("the Sealed L1 on Fuji: fixed ids, no request", async () => {
    const f = (async () => {
      throw new Error("no request expected");
    }) as unknown as typeof fetch;
    expect(await policyIdsFor(`https://gw.example/ext/bc/${FUJI_BLOCKCHAIN_ID}/rpc`, f)).toEqual(
      FUJI_POLICY_IDS,
    );
  });

  it("another chain: the network id from the node's info API, the blockchain id from the path", async () => {
    const bc = "2ng8zEuCuk3PrSbZPaAKSQx49H6ShNWY9Bouwf1oHQPG54veB4";
    const calls: string[] = [];
    const f = (async (url: string, init: { body: string }) => {
      calls.push(`${url} ${JSON.parse(init.body).method}`);
      return new Response(JSON.stringify({ result: { networkID: "88888" } }));
    }) as unknown as typeof fetch;
    const ids = await policyIdsFor(`http://127.0.0.1:9650/ext/bc/${bc}/rpc`, f);
    expect(calls).toEqual(["http://127.0.0.1:9650/ext/info info.getNetworkID"]);
    expect(ids).toEqual({ chainId: 261126n, networkId: 88888, blockchainId: cb58ToHex(bc) });
  });

  it("refuses an RPC URL without a blockchain id", async () => {
    await expect(policyIdsFor("http://127.0.0.1:9650/ext/bc/C/rpc")).rejects.toThrow();
  });
});
