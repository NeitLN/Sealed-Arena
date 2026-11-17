import { AGENT_POLICY_ADDRESS, agentPolicyAbi, arenaRecorderAbi } from "@sealed-arena/shared";
import { decodeFunctionData, encodeFunctionData, erc20Abi, type Hex } from "viem";
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
  const targets: string[] = [];
  const c: RelayChain = {
    relayer: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
    chainId: 261126,
    simulate: async () => {
      if (o.revert) throw new Error(o.revert);
    },
    canSend: async (a) =>
      (o.allowed ?? [agent]).map((x) => x.toLowerCase()).includes(a.toLowerCase()),
    send: async (data, to) => {
      sent.push(data);
      targets.push(to ?? "policy");
      return { transaction: "0xabc", status: "success" };
    },
  };
  return { c, sent, targets };
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

  describe("arena actions", () => {
    const recorder = "0x60d046fa32a101229f78d69b655a91193cdf4f77";
    const arena = (app: ReturnType<typeof createRelayerApp>, body: unknown, ip = "9.9.9.9") =>
      app.request("/arena", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": ip },
        body: JSON.stringify(body),
      });

    it("sends each action for an agent at most once per cooldown, whoever asks", async () => {
      const { c, sent } = chain();
      let t = 1_000_000;
      const app = createRelayerApp({
        chain: c,
        trustProxy: true,
        arenaRecorder: recorder,
        arenaCooldownMs: 60_000,
        now: () => t,
      });
      expect((await arena(app, { action: "checkpoint", agent }, "1.1.1.1")).status).toBe(200);
      // Another client, same agent and action: refused without sending (no gas spent).
      const again = await arena(app, { action: "checkpoint", agent }, "2.2.2.2");
      expect(again.status).toBe(429);
      expect(await again.json()).toMatchObject({ error: "cooldown" });
      // The other action, or another agent, is not held back.
      expect((await arena(app, { action: "reportBreach", agent }, "3.3.3.3")).status).toBe(200);
      const other = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
      expect((await arena(app, { action: "checkpoint", agent: other }, "4.4.4.4")).status).toBe(
        200,
      );
      expect(sent).toHaveLength(3);
      t += 60_000;
      expect((await arena(app, { action: "checkpoint", agent }, "5.5.5.5")).status).toBe(200);
      expect(sent).toHaveLength(4);
    });

    it("sends once when two requests for the same agent arrive together", async () => {
      const { c, sent } = chain();
      const app = createRelayerApp({ chain: c, trustProxy: true, arenaRecorder: recorder });
      const [a, b] = await Promise.all([
        arena(app, { action: "checkpoint", agent }, "1.1.1.1"),
        arena(app, { action: "checkpoint", agent }, "2.2.2.2"),
      ]);
      expect([a.status, b.status].sort()).toEqual([200, 429]);
      expect(sent).toHaveLength(1);
    });

    it("does not start a cooldown when the simulation refuses the action", async () => {
      const { c, sent } = chain({ revert: "execution reverted: not enrolled" });
      const app = createRelayerApp({ chain: c, trustProxy: true, arenaRecorder: recorder });
      expect((await arena(app, { action: "checkpoint", agent })).status).toBe(422);
      expect((await arena(app, { action: "checkpoint", agent }, "8.8.8.8")).status).toBe(422);
      expect(sent).toEqual([]);
    });

    it.each(["checkpoint", "reportBreach"])(
      "sends %s to the ArenaRecorder, built by the relayer",
      async (action) => {
        const { c, sent, targets } = chain();
        const app = createRelayerApp({ chain: c, trustProxy: true, arenaRecorder: recorder });
        const res = await arena(app, { action, agent });
        expect(res.status).toBe(200);
        expect(targets).toEqual([recorder]);
        expect(decodeFunctionData({ abi: arenaRecorderAbi, data: sent[0] as Hex })).toEqual({
          functionName: action,
          args: [agent],
        });
      },
    );

    it("refuses other actions, bad agents, and works only when a recorder is configured", async () => {
      const { c, sent } = chain();
      const app = createRelayerApp({ chain: c, trustProxy: true, arenaRecorder: recorder });
      expect((await arena(app, { action: "enroll", agent })).status).toBe(400);
      expect((await arena(app, { action: "checkpoint", agent: "0x1234" })).status).toBe(400);
      const none = createRelayerApp({ chain: chain().c, trustProxy: true });
      expect((await arena(none, { action: "checkpoint", agent })).status).toBe(404);
      expect(sent).toEqual([]);
    });
  });
});
