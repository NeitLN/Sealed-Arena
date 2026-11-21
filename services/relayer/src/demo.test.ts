import {
  agentPolicyAbi,
  domainV2,
  registerDigest,
  registerDigestFor,
  registerDigestV2,
} from "@sealed-arena/shared";
import { type Address, decodeFunctionData, type Hex, recoverAddress } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
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
    perClientMs?: number;
    /** The first this many policy() reads fail (the node is briefly unreachable). */
    policyFails?: number;
    /** How the first register send ends instead of succeeding. */
    firstSend?: "reverted" | "throws";
    /** The first enable fails after the register was sent. */
    enableFails?: boolean;
  } = {},
) {
  const steps: string[] = [];
  const sent: Hex[] = [];
  let policyFails = o.policyFails ?? 0;
  let firstSend = o.firstSend;
  let enableFails = o.enableFails ?? false;
  const chain: RelayChain = {
    relayer: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
    chainId: 261126,
    policy: async () => {
      if (policyFails > 0) {
        policyFails--;
        throw new Error("fetch failed");
      }
      return { version: o.version ?? 1, ids: IDS };
    },
    simulate: async () => {
      if (o.revert) throw new Error(o.revert);
    },
    canSend: async () => false,
    send: async (data) => {
      const mode = firstSend;
      firstSend = undefined;
      if (mode === "throws") throw new Error("nonce too low");
      sent.push(data);
      steps.push("register");
      return { transaction: "0xaaa", status: mode === "reverted" ? "reverted" : "success" };
    },
  };
  const issuer: DemoIssuer = {
    ready: async () => o.ready ?? true,
    enable: async (a) => {
      if (enableFails) {
        enableFails = false;
        throw new Error("manager role missing");
      }
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
    demo: {
      issuer,
      funding: 5n,
      ...(o.perDay ? { perDay: o.perDay } : {}),
      ...(o.perClientMs ? { perClientMs: o.perClientMs } : {}),
    },
    ...(o.now ? { now: o.now } : {}),
  });
  return { app, steps, sent };
}

// Emulates the browser: key generation and raw digest signing happen before the request.
async function browserClaim(version: 1 | 2 = 1) {
  const key = privateKeyToAccount(generatePrivateKey());
  return {
    agent: key.address,
    ownerX: X,
    ownerY: Y,
    agentSig: await key.sign({ hash: registerDigestFor(version, IDS, key.address, X, Y) }),
  };
}
const claim = async (app: ReturnType<typeof createRelayerApp>, body: unknown, ip = "1.2.3.4") => {
  let request = body;
  const b = body as Record<string, unknown>;
  if (b.ownerX === X && b.ownerY === Y && !("agentSig" in b)) {
    const info = (await (await app.request("/info")).json()) as { ruleVersion?: 1 | 2 };
    request = await browserClaim(info.ruleVersion ?? 1);
  }
  return app.request("/demo/claim", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(request),
  });
};

describe("demo agents", () => {
  it("is off unless configured", async () => {
    const chain = setup();
    const off = createRelayerApp({
      chain: { ...chain, relayer: "0x0", chainId: 1 } as unknown as RelayChain,
    });
    expect((await claim(off, {})).status).toBe(404);
  });

  it("registers a new agent to the visitor's passkey first, then allows and funds it", async () => {
    const { app, steps, sent } = setup();
    const request = await browserClaim();
    const res = await claim(app, request);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      agent: Address;
      privateKey?: Hex;
      transactions: Record<string, string>;
    };
    expect(body.ok).toBe(true);
    expect(body.agent).toBe(request.agent);
    expect(body).not.toHaveProperty("privateKey");
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

  it.each([1, 2] as const)("refuses another key's signature under rule v%s", async (version) => {
    const { app, steps } = setup({ version });
    const request = await browserClaim(version);
    const other = privateKeyToAccount(generatePrivateKey());
    request.agentSig = await other.sign({
      hash: registerDigestFor(version, IDS, request.agent, X, Y),
    });
    const res = await claim(app, request);
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "signature_invalid" });
    expect(steps).toEqual([]);
  });

  it("refuses a signature for the wrong rule version", async () => {
    const { app, steps } = setup({ version: 2 });
    expect((await claim(app, await browserClaim(1))).status).toBe(400);
    expect(steps).toEqual([]);
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

  it("answers the per-address wait as demo_rate_limited with retryAfter in seconds and the window", async () => {
    let t = 1_000_000;
    const { app } = setup({ now: () => t });
    expect((await claim(app, { ownerX: X, ownerY: Y })).status).toBe(200);
    t += 60_000;
    const res = await claim(app, { ownerX: X, ownerY: Y });
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("540");
    expect(await res.json()).toEqual({
      ok: false,
      error: "demo_rate_limited",
      retryAfter: 540,
      windowMs: 600_000,
    });
  });

  it("takes the per-address window from the options", async () => {
    let t = 1_000_000;
    const { app } = setup({ now: () => t, perClientMs: 60_000 });
    expect((await claim(app, { ownerX: X, ownerY: Y })).status).toBe(200);
    const res = await claim(app, { ownerX: X, ownerY: Y });
    expect(await res.json()).toMatchObject({ retryAfter: 60, windowMs: 60_000 });
    t += 60_000;
    expect((await claim(app, { ownerX: X, ownerY: Y })).status).toBe(200);
  });

  it("lets two claims from one address arriving together pass only once", async () => {
    const { app, steps } = setup();
    const [a, b] = await Promise.all([
      claim(app, await browserClaim()),
      claim(app, await browserClaim()),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 429]);
    expect(steps.filter((s) => s === "register")).toHaveLength(1);
  });

  it("does not use the address slot or the day cap when the signature is wrong", async () => {
    const { app } = setup({ perDay: 1 });
    const bad = await browserClaim();
    bad.agentSig = await privateKeyToAccount(generatePrivateKey()).sign({
      hash: registerDigestFor(1, IDS, bad.agent, X, Y),
    });
    expect((await claim(app, bad)).status).toBe(400);
    // Same address, and the only claim of the day: both still free.
    expect((await claim(app, { ownerX: X, ownerY: Y })).status).toBe(200);
  });

  it("does not use the address slot or the day cap when reading the policy fails", async () => {
    const { app } = setup({ policyFails: 1, perDay: 1 });
    const first = await claim(app, await browserClaim());
    expect(first.status).toBe(502);
    expect(await first.json()).toMatchObject({ error: "send_failed" });
    expect((await claim(app, await browserClaim())).status).toBe(200);
  });

  it("does not use the address slot when the simulation refuses the register", async () => {
    const { app } = setup({ revert: "execution reverted: bad key", perDay: 1 });
    expect((await claim(app, await browserClaim())).status).toBe(422);
    const again = await claim(app, await browserClaim());
    expect(again.status).toBe(422);
    expect(await again.json()).toMatchObject({ error: "reverted" });
  });

  it("does not use the address slot when the register send fails", async () => {
    const { app } = setup({ firstSend: "throws", perDay: 1 });
    expect((await claim(app, await browserClaim())).status).toBe(502);
    expect((await claim(app, await browserClaim())).status).toBe(200);
  });

  it("keeps the slot once a register transaction was sent, even if it reverted", async () => {
    const { app } = setup({ firstSend: "reverted" });
    expect((await claim(app, await browserClaim())).status).toBe(422);
    const again = await claim(app, await browserClaim());
    expect(again.status).toBe(429);
    expect(await again.json()).toMatchObject({ error: "demo_rate_limited" });
  });

  it("keeps the slot once registered, even if allowing the agent fails", async () => {
    const { app } = setup({ enableFails: true });
    const first = await claim(app, await browserClaim());
    expect(first.status).toBe(502);
    expect(await first.json()).toMatchObject({ error: "issue_failed" });
    expect((await claim(app, await browserClaim())).status).toBe(429);
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
