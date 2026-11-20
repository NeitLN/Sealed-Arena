// The open challenge in one answer: the agent's registration, mandate and spending (AgentPolicy),
// its balance, the ArenaRecorder record and the attempts the gateway logged. Every open /arena tab
// polls this instead of sending its own chain reads, and the gateway reuses one answer for a few
// seconds (GET /state), so the number of open tabs does not change the load on the node.
import {
  AGENT_POLICY_ADDRESS,
  agentPolicyAbi,
  arenaRecorderAbi,
  readRuleVersion,
} from "@sealed-arena/shared";
import type { Address, PublicClient } from "viem";
import type { AttemptStore } from "./store.js";

export type ArenaState = {
  at: number;
  agent: Address;
  ruleVersion: number;
  registered: boolean;
  frozen: boolean;
  mandate: { payees: readonly Address[]; perTxCap: string; dailyCap: string; expiry: string };
  spentToday: string;
  totalCharged: string;
  balance: string;
  /** Rule v2: whether the mandate has a daily fee cap, the cap, and the fees counted today. */
  feeCapSet: boolean;
  dailyFeeCap: string;
  feeSpentToday: string;
  recorder: { funded: string; required: string; score: string; breached: boolean };
  summary: unknown;
  recent: unknown;
};

export async function arenaState(
  client: PublicClient,
  store: AttemptStore,
  agent: Address,
  recorder: Address,
  now: () => number = Date.now,
): Promise<ArenaState> {
  const policy = (functionName: string) =>
    client.readContract({
      address: AGENT_POLICY_ADDRESS,
      abi: agentPolicyAbi,
      functionName,
      args: [agent],
    } as never) as Promise<unknown>;
  const rec = (functionName: string) =>
    client.readContract({
      address: recorder,
      abi: arenaRecorderAbi,
      functionName,
      args: [agent],
    } as never) as Promise<unknown>;
  // 1 before agent rule v2 is active; any other failure fails the snapshot (the last good one is served).
  const version = readRuleVersion(client);
  const [
    registered,
    mf,
    spend,
    balance,
    funded,
    required,
    score,
    breached,
    ruleVersion,
    summary,
    recent,
  ] = await Promise.all([
    policy("isAgent") as Promise<boolean>,
    policy("getMandate") as Promise<
      readonly [
        { payees: readonly Address[]; perTxCap: bigint; dailyCap: bigint; expiry: bigint },
        boolean,
      ]
    >,
    policy("getSpend") as Promise<readonly [bigint, bigint, bigint]>,
    client.getBalance({ address: agent }),
    rec("funded") as Promise<bigint>,
    rec("requiredBalance") as Promise<bigint>,
    rec("score") as Promise<bigint>,
    rec("breached") as Promise<boolean>,
    version,
    store.summary(agent),
    store.recent(15, agent),
  ]);
  const [m, frozen] = mf;
  // Rule v2: the daily fee cap and today's fees (these functions exist only under v2).
  let v2 = { feeCapSet: false, dailyFeeCap: "0", feeSpentToday: "0" };
  if (ruleVersion === 2) {
    const [m2, fee] = await Promise.all([
      policy("getMandateV2") as Promise<readonly [{ dailyFeeCap: bigint }, boolean, boolean]>,
      policy("getFeeSpend") as Promise<readonly [bigint, bigint]>,
    ]);
    v2 = {
      feeCapSet: m2[1],
      dailyFeeCap: m2[0].dailyFeeCap.toString(),
      feeSpentToday: fee[0].toString(),
    };
  }
  return {
    at: now(),
    agent,
    ruleVersion,
    registered,
    frozen,
    mandate: {
      payees: m.payees,
      perTxCap: m.perTxCap.toString(),
      dailyCap: m.dailyCap.toString(),
      expiry: m.expiry.toString(),
    },
    spentToday: spend[0].toString(),
    totalCharged: spend[2].toString(),
    balance: balance.toString(),
    ...v2,
    recorder: {
      funded: funded.toString(),
      required: required.toString(),
      score: score.toString(),
      breached,
    },
    summary,
    recent,
  };
}
