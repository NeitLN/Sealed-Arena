import { readFileSync } from "node:fs";
import { decodeFunctionData, type Hex, type PublicClient } from "viem";
import { describe, expect, it } from "vitest";
import {
  agentPolicyAbi,
  domainV2,
  freezeChallenge,
  freezeChallengeV2,
  registerDigest,
  registerDigestV2,
  setMandateChallenge,
  setMandateV2Challenge,
  unfreezeChallenge,
  unfreezeChallengeV2,
} from "./agentPolicy.js";
import {
  AGENT_MAX_TIP,
  agentFees,
  agentPaymentGas,
  blockchainIdFromRpc,
  defaultDailyFeeCap,
  FUJI_BLOCKCHAIN_ID,
  FUJI_POLICY_IDS,
  type PolicyIds,
  readRuleVersion,
  registerDigestFor,
  setFrozenRequest,
  setMandateRequest,
} from "./policyCalls.js";

const agent = "0x19e7e376e7c213b7e7e7e46cc70a5dd086daff2a" as const;
const x = `0x${"11".repeat(32)}` as Hex;
const y = `0x${"22".repeat(32)}` as Hex;
const ids: PolicyIds = { chainId: 261126n, networkId: 12345, blockchainId: `0x${"ab".repeat(32)}` };
const domain = domainV2(ids.networkId, ids.blockchainId, ids.chainId);
const m = {
  payees: ["0x00000000000000000000000000000000000000a1"] as const,
  perTxCap: 10n ** 18n,
  dailyCap: 3n * 10n ** 18n,
  expiry: 1_800_000_000n,
};
const auth = "0xabcd" as Hex;
const decode = (data: Hex) => decodeFunctionData({ abi: agentPolicyAbi, data });

describe("policy calls by rule version", () => {
  it("register: v1 digest on the chain id, v2 on the domain", () => {
    expect(registerDigestFor(1, ids, agent, x, y)).toBe(registerDigest(ids.chainId, agent, x, y));
    expect(registerDigestFor(2, ids, agent, x, y)).toBe(registerDigestV2(domain, agent, x, y));
  });

  it("setMandate under v1, setMandateV2 under v2 (default fee cap: dailyCap / 20)", () => {
    const r1 = setMandateRequest(1, ids, agent, m, 4n);
    expect(r1.challenge).toBe(setMandateChallenge(ids.chainId, agent, m, 4n));
    expect(decode(r1.data(auth)).functionName).toBe("setMandate");

    const r2 = setMandateRequest(2, ids, agent, m, 4n);
    const m2 = { ...m, dailyFeeCap: defaultDailyFeeCap(m.dailyCap) };
    expect(m2.dailyFeeCap).toBe(15n * 10n ** 16n);
    expect(r2.challenge).toBe(setMandateV2Challenge(domain, agent, m2, 4n));
    const d = decode(r2.data(auth));
    expect(d.functionName).toBe("setMandateV2");
    expect((d.args?.[1] as { dailyFeeCap: bigint } | undefined)?.dailyFeeCap).toBe(m2.dailyFeeCap);

    const r3 = setMandateRequest(2, ids, agent, { ...m, dailyFeeCap: 7n }, 4n);
    expect(r3.challenge).toBe(setMandateV2Challenge(domain, agent, { ...m, dailyFeeCap: 7n }, 4n));
  });

  it("freeze: v1 on the owner nonce, v2 on the freeze epoch; unfreeze v2 on both", () => {
    const s = { ownerNonce: 5n, freezeEpoch: 2n };
    const f1 = setFrozenRequest(1, ids, agent, true, s);
    expect(f1.challenge).toBe(freezeChallenge(ids.chainId, agent, 5n));
    expect(decode(f1.data(auth)).args?.[1]).toBe(5n);

    const f2 = setFrozenRequest(2, ids, agent, true, s);
    expect(f2.challenge).toBe(freezeChallengeV2(domain, agent, 2n));
    expect(decode(f2.data(auth))).toMatchObject({ functionName: "freeze" });
    expect(decode(f2.data(auth)).args?.[1]).toBe(2n);

    const u1 = setFrozenRequest(1, ids, agent, false, s);
    expect(u1.challenge).toBe(unfreezeChallenge(ids.chainId, agent, 5n));
    const u2 = setFrozenRequest(2, ids, agent, false, s);
    expect(u2.challenge).toBe(unfreezeChallengeV2(domain, agent, 5n, 2n));
    expect(decode(u2.data(auth))).toMatchObject({ functionName: "unfreeze" });
    expect(decode(u2.data(auth)).args?.[1]).toBe(5n);
  });

  it("Fuji ids: the blockchain id decodes as in the shared vectors", () => {
    const v = JSON.parse(
      readFileSync(
        new URL("../../../chain/testvectors/agentpolicy-v2.json", import.meta.url),
        "utf8",
      ),
    );
    expect(v.cb58.id).toBe(FUJI_BLOCKCHAIN_ID);
    expect(FUJI_POLICY_IDS.blockchainId).toBe(v.cb58.hex);
    expect(FUJI_POLICY_IDS.networkId).toBe(5);
  });

  it("blockchain id from an RPC URL or path", () => {
    expect(blockchainIdFromRpc(`https://x.example/ext/bc/${FUJI_BLOCKCHAIN_ID}/rpc`)).toBe(
      FUJI_BLOCKCHAIN_ID,
    );
    expect(blockchainIdFromRpc(`/ext/bc/${FUJI_BLOCKCHAIN_ID}/rpc`)).toBe(FUJI_BLOCKCHAIN_ID);
    expect(blockchainIdFromRpc("https://x.example/ext/bc/C/rpc")).toBeUndefined();
  });
});

describe("readRuleVersion", () => {
  const client = (read: () => Promise<unknown>, block: () => Promise<bigint>) =>
    ({ readContract: read, getBlockNumber: block }) as unknown as PublicClient;
  const ok = async () => 10n;

  it("2 when ruleVersion() answers 2", async () => {
    expect(await readRuleVersion(client(async () => 2n, ok))).toBe(2);
  });
  it("1 when the call fails but the node answers (the function does not exist before v2)", async () => {
    expect(
      await readRuleVersion(
        client(async () => {
          throw new Error("invalid function selector");
        }, ok),
      ),
    ).toBe(1);
  });
  it("throws when the node does not answer", async () => {
    const down = async () => {
      throw new Error("fetch failed");
    };
    await expect(readRuleVersion(client(down, down))).rejects.toThrow("fetch failed");
  });
});

describe("agent payments under rule v2", () => {
  it("gas is the intrinsic gas of the data (the Go rule computes the same)", () => {
    expect(agentPaymentGas()).toBe(21_000n);
    // Same bytes as TestAgentRuleV2PaymentData: 3 non-zero, 29 zero.
    expect(
      agentPaymentGas("0x00ff00ff00000000000000000000000000000000000000000000000000000001"),
    ).toBe(21_000n + 16n * 3n + 4n * 29n);
  });
  it("the tip is capped at 1 gwei; the fee cap is kept", () => {
    expect(
      agentFees({ maxFeePerGas: 50n * AGENT_MAX_TIP, maxPriorityFeePerGas: 2n * AGENT_MAX_TIP }),
    ).toEqual({
      maxFeePerGas: 50n * AGENT_MAX_TIP,
      maxPriorityFeePerGas: AGENT_MAX_TIP,
    });
    expect(agentFees({ maxFeePerGas: 10n, maxPriorityFeePerGas: 3n })).toEqual({
      maxFeePerGas: 10n,
      maxPriorityFeePerGas: 3n,
    });
  });
});
