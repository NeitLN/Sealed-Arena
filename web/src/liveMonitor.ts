import { useEffect, useState } from "react";
import { type Address, type Hex, TransactionReceiptNotFoundError } from "viem";
import { ARENA, GATEWAY_URL } from "./arena.config.js";
import { type AgentView, chainClient, readAgent } from "./owner.js";
import { poll } from "./poll.js";
import { RPC } from "./useArenaLive.js";

export type LiveAttempt = {
  ts: number;
  from: string;
  to: string;
  value: string;
  hash: string;
  result: "accepted" | "rejected";
  reason: string;
};
export type ReceiptState =
  | { kind: "included" | "reverted"; block: bigint; to: Address | null }
  | { kind: "pending" | "unknown" };
type Snapshot<T> = { data?: T; at?: number; failed: boolean };

/** A receipt, not an RPC send response, is the evidence for block inclusion. */
export async function receiptState(
  read: () => Promise<{ from: Address; to: Address | null; status: string; blockNumber: bigint }>,
): Promise<ReceiptState> {
  try {
    const r = await read();
    if (r.from.toLowerCase() !== ARENA.agent.toLowerCase()) return { kind: "unknown" };
    return {
      kind: r.status === "success" ? "included" : "reverted",
      block: r.blockNumber,
      to: r.to,
    };
  } catch (e) {
    return { kind: e instanceof TransactionReceiptNotFoundError ? "pending" : "unknown" };
  }
}

export function useLiveMonitor() {
  const [client] = useState(() => chainClient(RPC, { live: true }));
  const [chain, setChain] = useState<Snapshot<{ head: bigint; agent: AgentView }>>({
    failed: false,
  });
  const [gateway, setGateway] = useState<Snapshot<LiveAttempt[]>>({ failed: false });
  const [receipts, setReceipts] = useState<Record<string, ReceiptState>>({});
  useEffect(() => {
    let stopped = false;
    const stopChain = poll(async () => {
      try {
        const [head, agent] = await Promise.all([
          client.getBlockNumber(),
          readAgent(client, ARENA.agent),
        ]);
        if (!stopped) setChain({ data: { head, agent }, at: Date.now(), failed: false });
        return true;
      } catch {
        if (!stopped) setChain((s) => ({ ...s, failed: true }));
        return false;
      }
    }, 15_000);
    const stopGateway = poll(async () => {
      try {
        const res = await fetch(`${GATEWAY_URL}/attempts/recent?limit=8&from=${ARENA.agent}`, {
          signal: AbortSignal.timeout(8_000),
        });
        if (!res.ok) throw new Error("gateway unavailable");
        const rows = (await res.json()) as LiveAttempt[];
        if (
          !Array.isArray(rows) ||
          rows.some(
            (r) =>
              r.from?.toLowerCase() !== ARENA.agent.toLowerCase() ||
              !Number.isFinite(r.ts) ||
              typeof r.to !== "string" ||
              typeof r.reason !== "string" ||
              !["accepted", "rejected"].includes(r.result),
          )
        )
          throw new Error("invalid feed");
        if (!stopped) setGateway({ data: rows, at: Date.now(), failed: false });
        const results = await Promise.all(
          rows
            .filter((r) => r.result === "accepted" && /^0x[0-9a-fA-F]{64}$/.test(r.hash))
            .map(
              async (r) =>
                [
                  r.hash,
                  await receiptState(() => client.getTransactionReceipt({ hash: r.hash as Hex })),
                ] as const,
            ),
        );
        if (!stopped) setReceipts(Object.fromEntries(results));
        return true;
      } catch {
        if (!stopped) setGateway((s) => ({ ...s, failed: true }));
        return false;
      }
    }, 15_000);
    return () => {
      stopped = true;
      stopChain();
      stopGateway();
    };
  }, [client]);
  return { chain, gateway, receipts };
}
