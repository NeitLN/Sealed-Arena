// Measurements on a running Sealed L1 (local or Fuji, same SEALED_* settings as the other scripts):
//   - the fee of an agent payment (gas used x effective gas price), with and without the 32-byte
//     x402 reference;
//   - the time from sending a payment to its receipt;
//   - freeze latency: from sending the owner's freeze to its receipt, and whether the agent's next
//     payment is refused right after.
// A fresh agent with a small mandate is used each run (funding MEASURE_FUNDING whole coins,
// default 0.3). Writes services/attacks/results/measure-<network>-<time>.json.
//   pnpm --filter attacks measure
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { agentFees, agentPaymentGas, LOCAL_PAYEES, paymentData } from "@sealed-arena/shared";
import { type Address, BaseError, formatEther, type Hex, parseEther } from "viem";
import type { PrivateKeyAccount } from "viem/accounts";
import { coin, freshAgent, type Node, nodes, ruleVersion, setFrozen, wallet } from "./localnet.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const first = nodes()[0];
if (!first) throw new Error("no node");
const n: Node = first;
const PAYEES = (process.env.MEASURE_PAYEES?.split(",") ?? LOCAL_PAYEES.slice(0, 1)) as Address[];
const payee = PAYEES[0] as Address;
const RUNS = Number(process.env.MEASURE_RUNS ?? 10);

type Payment = {
  ms: number;
  gasUsed: string;
  effectiveGasPrice: string;
  feeWei: string;
  withData: boolean;
};

async function pay(agent: PrivateKeyAccount, data?: Hex): Promise<Payment> {
  const fees = agentFees(await n.client.estimateFeesPerGas());
  const t0 = performance.now();
  const hash = await wallet(n, agent).sendTransaction({
    to: payee,
    value: 1n,
    gas: agentPaymentGas(data),
    ...fees,
    ...(data ? { data } : {}),
  });
  const r = await n.client.waitForTransactionReceipt({ hash, pollingInterval: 100 });
  const ms = performance.now() - t0;
  if (r.status !== "success") throw new Error(`payment ${hash} failed`);
  return {
    ms: Math.round(ms),
    gasUsed: r.gasUsed.toString(),
    effectiveGasPrice: r.effectiveGasPrice.toString(),
    feeWei: (r.gasUsed * r.effectiveGasPrice).toString(),
    withData: !!data,
  };
}

const stats = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const q = (p: number) => s[Math.min(s.length - 1, Math.floor(p * s.length))] ?? 0;
  return { n: s.length, min: s[0] ?? 0, median: q(0.5), p90: q(0.9), max: s[s.length - 1] ?? 0 };
};

async function main() {
  const version = await ruleVersion(n);
  const funding = parseEther(process.env.MEASURE_FUNDING ?? "0.3");
  const agent = await freshAgent(n, [payee], {
    funding,
    perTxCap: coin(1) / 10n,
    dailyCap: coin(1) / 5n,
  });
  console.log(`agent ${agent.address}, rule v${version}, ${RUNS} payments of each kind`);

  const plain: Payment[] = [];
  const withRef: Payment[] = [];
  for (let i = 0; i < RUNS; i++) {
    plain.push(await pay(agent));
    withRef.push(
      await pay(agent, paymentData("https://seller.example/item", `0x${"11".repeat(32)}`)),
    );
  }

  // Freeze latency: the owner's freeze (through the relayer key) until its receipt, then the next
  // payment from the agent.
  const t0 = performance.now();
  await setFrozen(n, agent.address, true);
  const freezeMs = Math.round(performance.now() - t0);
  let refusal = "";
  try {
    await pay(agent);
    refusal = "accepted (unexpected)";
  } catch (e) {
    const msg = e instanceof BaseError ? e.details || e.shortMessage : String(e);
    refusal = /agent: [a-z ]+/.exec(msg)?.[0] ?? msg;
  }
  await setFrozen(n, agent.address, false);

  const fee = (xs: Payment[]) => stats(xs.map((p) => Number(p.feeWei)));
  const out = {
    at: new Date().toISOString(),
    network: n.url.includes("19650")
      ? "Sealed L1 on Fuji (through an SSH tunnel to the validator)"
      : n.url,
    ruleVersion: version,
    agent: agent.address,
    payments: { plain, withRef },
    summary: {
      plainFeeWei: fee(plain),
      withRefFeeWei: fee(withRef),
      plainFee: formatEther(BigInt(fee(plain).median)),
      withRefFee: formatEther(BigInt(fee(withRef).median)),
      receiptMs: stats([...plain, ...withRef].map((p) => p.ms)),
      freezeReceiptMs: freezeMs,
      paymentAfterFreeze: refusal,
    },
  };
  const dir = resolve(HERE, "../results");
  mkdirSync(dir, { recursive: true });
  const name = `measure-${n.url.includes("19650") ? "fuji" : "local"}-${out.at.replace(/[:.]/g, "-")}.json`;
  writeFileSync(resolve(dir, name), `${JSON.stringify(out, null, 2)}\n`);
  console.log(JSON.stringify(out.summary, null, 2));
  console.log(`measure: wrote services/attacks/results/${name}`);
  if (refusal !== "agent: frozen") process.exit(1);
}

main().catch((err) => {
  console.error("measure: FAIL:", err instanceof Error ? err.message : err);
  process.exit(1);
});
