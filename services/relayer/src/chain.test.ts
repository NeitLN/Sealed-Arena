import { LOCAL_ROLES } from "@sealed-arena/shared";
import { describe, expect, it } from "vitest";
import { revertReason } from "./app.js";
import { relayerKey } from "./chain.js";

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
