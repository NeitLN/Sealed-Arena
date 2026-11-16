import { AGENT_POLICY_ADDRESS, agentPolicyAbi } from "@sealed-arena/shared";
import { encodeFunctionData, erc20Abi, type Hex } from "viem";
import { describe, expect, it } from "vitest";
import { createRelayerApp, type RelayChain } from "./app.js";

const agent = "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc";
const freezeData = encodeFunctionData({
  abi: agentPolicyAbi,
  functionName: "freeze",
  args: [agent, 0n, "0x"],
});

function chain(o: { revert?: string; allowed?: string[] } = {}) {
  const sent: Hex[] = [];
  const c: RelayChain = {
    relayer: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
    chainId: 261126,
    simulate: async () => {
      if (o.revert) throw new Error(o.revert);
    },
    canSend: async (a) =>
      (o.allowed ?? [agent]).map((x) => x.toLowerCase()).includes(a.toLowerCase()),
    send: async (data) => {
      sent.push(data);
      return { transaction: "0xabc", status: "success" };
    },
  };
  return { c, sent };
}

const post = (app: ReturnType<typeof createRelayerApp>, body: unknown, ip = "1.2.3.4") =>
  app.request("/relay", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });

describe("relayer", () => {
  it("sends an AgentPolicy owner action and returns the transaction", async () => {
    const { c, sent } = chain();
    const res = await post(createRelayerApp({ chain: c, trustProxy: true }), { data: freezeData });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      function: "freeze",
      transaction: "0xabc",
      status: "success",
    });
    expect(sent).toEqual([freezeData]);
  });

  it.each(["register", "setMandate", "freeze", "unfreeze"])("allows %s", async (name) => {
    const fn = agentPolicyAbi.find((x) => x.type === "function" && x.name === name);
    expect(fn).toBeDefined();
  });

  it("refuses anything that is not one of the four owner actions, without sending (E7)", async () => {
    const { c, sent } = chain();
    const app = createRelayerApp({ chain: c, trustProxy: true });
    const transfer = encodeFunctionData({
      abi: erc20Abi,
      functionName: "transfer",
      args: [agent, 1n],
    });
    for (const data of [transfer, "0x", "0x1234", "not hex"]) {
      const res = await post(app, { data });
      expect(res.status).toBe(400);
    }
    const view = encodeFunctionData({
      abi: agentPolicyAbi,
      functionName: "isAgent",
      args: [agent],
    });
    expect((await post(app, { data: view })).status).toBe(400);
    expect(sent).toEqual([]);
  });

  it("returns the chain's reason when the call would revert, and sends nothing (R6)", async () => {
    const { c, sent } = chain({
      revert: "execution reverted: agentpolicy: owner signature invalid",
    });
    const res = await post(createRelayerApp({ chain: c, trustProxy: true }), { data: freezeData });
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({
      ok: false,
      error: "reverted",
      reason: "agentpolicy: owner signature invalid",
    });
    expect(sent).toEqual([]);
  });

  it("limits requests per client address", async () => {
    const { c } = chain();
    const app = createRelayerApp({ chain: c, trustProxy: true, perMinute: 3 });
    const codes = [];
    for (let i = 0; i < 4; i++) codes.push((await post(app, { data: freezeData })).status);
    expect(codes).toEqual([200, 200, 200, 429]);
    expect((await post(app, { data: freezeData }, "5.6.7.8")).status).toBe(200);
  });

  it("says who it is and where it sends", async () => {
    const { c } = chain();
    const res = await createRelayerApp({ chain: c, publicRpc: "http://rpc.test/" }).request(
      "/info",
    );
    expect(await res.json()).toEqual({
      relayer: c.relayer,
      chainId: 261126,
      target: AGENT_POLICY_ADDRESS,
      rpc: "http://rpc.test/",
    });
  });

  it("registers only agents the admin has allowed to send, so the relayer's gas cannot be drained (A6)", async () => {
    const stranger = "0x00000000000000000000000000000000000beef1";
    const reg = (who: string) =>
      encodeFunctionData({
        abi: agentPolicyAbi,
        functionName: "register",
        args: [who as `0x${string}`, `0x${"11".repeat(32)}`, `0x${"22".repeat(32)}`, "0x"],
      });
    const { c, sent } = chain({ allowed: [agent] });
    const app = createRelayerApp({ chain: c, trustProxy: true });
    const refused = await post(app, { data: reg(stranger) });
    expect(refused.status).toBe(403);
    expect(await refused.json()).toMatchObject({ ok: false, error: "agent_not_allowed" });
    expect(sent).toEqual([]);
    expect((await post(app, { data: reg(agent) })).status).toBe(200);
    expect(sent).toHaveLength(1);
  });
});
