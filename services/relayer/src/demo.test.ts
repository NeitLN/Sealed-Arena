import { agentPolicyAbi, domainV2, registerDigest, registerDigestV2 } from "@sealed-arena/shared";
import { type Address, decodeFunctionData, type Hex, recoverAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";
import { createRelayerApp, type DemoIssuer, type RelayChain } from "./app.js";

const X = `0x${"11".repeat(32)}` as Hex;
const Y = `0x${"22".repeat(32)}` as Hex;
const IDS = { chainId: 261126n, networkId: 12345, blockchainId: `0x${"ab".repeat(32)}` as Hex };

function setup(
  o: {
    revert?: string;
    now?: () => number;
    perDay?: number;
    ready?: boolean;
    version?: 1 | 2;
  } = {},
) {
  const steps: string[] = [];
  const sent: Hex[] = [];
  const chain: RelayChain = {
    relayer: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
    chainId: 261126,
    policy: async () => ({ version: o.version ?? 1, ids: IDS }),
    simulate: async () => {
      if (o.revert) throw new Error(o.revert);
    },
    canSend: async () => false,
    send: async (data) => {
      sent.push(data);
      steps.push("register");
      return { transaction: "0xaaa", status: "success" };
    },
  };
  const issuer: DemoIssuer = {
    ready: async () => o.ready ?? true,
    enable: async (a) => {
      steps.push(`enable ${a}`);
      return "0xbbb";
    },
    fund: async (a, wei) => {
      steps.push(`fund ${a} ${wei}`);
      return "0xccc";
    },
  };
  const app = createRelayerApp({
    chain,
    trustProxy: true,
    demo: { issuer, funding: 5n, ...(o.perDay ? { perDay: o.perDay } : {}) },
    ...(o.now ? { now: o.now } : {}),
  });
  return { app, steps, sent };
}

const claim = (app: ReturnType<typeof createRelayerApp>, body: unknown, ip = "1.2.3.4") =>
  app.request("/demo/claim", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });

describe("demo agents", () => {
  it("is off unless configured", async () => {
    const chain = setup();
    const off = createRelayerApp({
      chain: { ...chain, relayer: "0x0", chainId: 1 } as unknown as RelayChain,
    });
    expect((await claim(off, { ownerX: X, ownerY: Y })).status).toBe(404);
  });

  it("registers a new agent to the visitor's passkey first, then allows and funds it", async () => {
    const { app, steps, sent } = setup();
    const res = await claim(app, { ownerX: X, ownerY: Y });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      agent: Address;
      privateKey: Hex;
      transactions: Record<string, string>;
    };
    expect(body.ok).toBe(true);
    expect(privateKeyToAccount(body.privateKey).address).toBe(body.agent);
    expect(steps).toEqual(["register", `enable ${body.agent}`, `fund ${body.agent} 5`]);
    expect(body.transactions).toEqual({ register: "0xaaa", enable: "0xbbb", fund: "0xccc" });

    // The register call names this agent and this passkey, signed by the agent's key.
    const { functionName, args } = decodeFunctionData({
      abi: agentPolicyAbi,
      data: sent[0] as Hex,
    });
    expect(functionName).toBe("register");
    const [agent, x, y, sig] = args as readonly [Address, Hex, Hex, Hex];
    expect([agent, x, y]).toEqual([body.agent, X, Y]);
    const signer = await recoverAddress({
      hash: registerDigest(261126n, agent, X, Y),
      signature: sig,
    });
    expect(signer).toBe(body.agent);
  });

  it("refuses a malformed passkey without sending anything", async () => {
    const { app, steps } = setup();
    for (const body of [
      {},
      { ownerX: X },
      { ownerX: "0x12", ownerY: Y },
      { ownerX: X, ownerY: "nope" },
    ])
      expect((await claim(app, body)).status).toBe(400);
    expect(steps).toEqual([]);
  });

  it("answers 503 demo-disabled, sending nothing, when the manager key has lost its role", async () => {
    const { app, steps } = setup({ ready: false });
    const res = await claim(app, { ownerX: X, ownerY: Y });
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: "demo-disabled" });
    expect(steps).toEqual([]);
  });

  it("does not allow-list the agent when registering fails", async () => {
    const { app, steps } = setup({ revert: "execution reverted: bad key" });
    const res = await claim(app, { ownerX: X, ownerY: Y });
    expect(res.status).toBe(422);
    expect(steps).toEqual([]);
  });

  it("gives one agent per address every 10 minutes", async () => {
    let t = 1_000_000;
    const { app } = setup({ now: () => t });
    expect((await claim(app, { ownerX: X, ownerY: Y })).status).toBe(200);
    expect((await claim(app, { ownerX: X, ownerY: Y })).status).toBe(429);
    expect((await claim(app, { ownerX: X, ownerY: Y }, "5.6.7.8")).status).toBe(200);
    t += 10 * 60_000;
    expect((await claim(app, { ownerX: X, ownerY: Y })).status).toBe(200);
  });

  it("stops at the daily cap", async () => {
    const { app } = setup({ perDay: 2 });
    expect((await claim(app, { ownerX: X, ownerY: Y }, "1.1.1.1")).status).toBe(200);
    expect((await claim(app, { ownerX: X, ownerY: Y }, "2.2.2.2")).status).toBe(200);
    const res = await claim(app, { ownerX: X, ownerY: Y }, "3.3.3.3");
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ error: "demo_cap" });
  });
});

describe("demo agents under rule v2", () => {
  it("the agent signs the v2 register digest (bound to the network and blockchain ids)", async () => {
    const { app, sent } = setup({ version: 2 });
    const res = await claim(app, { ownerX: X, ownerY: Y });
    expect(res.status).toBe(200);
    const { args } = decodeFunctionData({ abi: agentPolicyAbi, data: sent[0] as Hex });
    const [agent, , , sig] = args as readonly [Address, Hex, Hex, Hex];
    const domain = domainV2(IDS.networkId, IDS.blockchainId, IDS.chainId);
    expect(
      await recoverAddress({ hash: registerDigestV2(domain, agent, X, Y), signature: sig }),
    ).toBe(agent);
  });
});
