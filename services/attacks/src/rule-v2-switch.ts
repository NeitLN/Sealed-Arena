// The switch to agent rule v2 on a running local network, with real nodes and clients.
//   SEALED_RULE_V2_AT=+90 bash scripts/localnet.sh up && pnpm --filter attacks rule-v2-switch
// Before the switch: an agent is registered and given a mandate with v1 proofs, and pays with a
// 5 gwei tip. After it (blocks are produced until ruleVersion() answers 2):
//   1. the same 5 gwei tip is refused; a payment within the v2 limits from the v1 mandate goes in;
//   2. the owner sets the mandate again (setMandateV2, through the same client code): fee cap set;
//   3. a new agent registers with a v2 proof;
//   4. freeze and unfreeze with v2 proofs;
//   5. a payment with the 32-byte x402 reference and exactly its intrinsic gas goes in; one more
//      gas unit is refused.
// Local test keys only.
import {
  AGENT_POLICY_ADDRESS,
  agentFees,
  agentPaymentGas,
  agentPolicyAbi,
  LOCAL_PAYEES,
  paymentData,
} from "@sealed-arena/shared";
import { type Address, BaseError, type Hex } from "viem";
import type { PrivateKeyAccount } from "viem/accounts";
import {
  accounts,
  coin,
  freshAgent,
  type Node,
  nodes,
  readPolicy,
  ruleVersion,
  sendAndWait,
  setFrozen,
  setMandate,
  wallet,
} from "./localnet.js";

const first = nodes()[0];
if (!first) throw new Error("no node");
const n: Node = first;
const payee = LOCAL_PAYEES[0] as Address;
const GWEI = 1_000_000_000n;

let failures = 0;
const check = (ok: boolean, what: string) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${what}`);
  if (!ok) failures++;
};

/** Sends a payment from the agent; resolves to "included", "failed" or the node's agent error. */
async function pay(
  node: Node,
  agent: PrivateKeyAccount,
  o: { tip?: bigint; gas?: bigint; data?: Hex } = {},
): Promise<string> {
  const fees = await node.client.estimateFeesPerGas();
  const f = agentFees(fees);
  try {
    const hash = await wallet(node, agent).sendTransaction({
      to: payee,
      value: coin(1) / 1000n,
      gas: o.gas ?? agentPaymentGas(o.data),
      maxFeePerGas: f.maxFeePerGas + (o.tip ?? 0n),
      maxPriorityFeePerGas: o.tip ?? f.maxPriorityFeePerGas,
      ...(o.data ? { data: o.data } : {}),
    });
    const r = await node.client.waitForTransactionReceipt({ hash });
    return r.status === "success" ? "included" : "failed";
  } catch (e) {
    const msg = e instanceof BaseError ? e.details || e.shortMessage : String(e);
    return /agent: [a-z -]+/.exec(msg)?.[0] ?? msg;
  }
}

async function main() {
  check((await ruleVersion(n)) === 1, "before the switch: ruleVersion() is not there (v1)");
  const a = await freshAgent(n, [payee], { dailyCap: coin(3) });
  check(
    (await pay(n, a, { tip: 5n * GWEI })) === "included",
    "v1: a payment with a 5 gwei tip goes in",
  );

  // Blocks are built only when there are transactions: keep sending until the switch.
  const deadline = Date.now() + 240_000;
  while ((await ruleVersion(n)) !== 2) {
    if (Date.now() > deadline) throw new Error("rule v2 did not activate within 240 s");
    await sendAndWait(n, accounts.admin, { to: accounts.admin.address, value: 0n, gas: 21_000n });
    await new Promise((r) => setTimeout(r, 3000));
  }
  console.log("rule v2 active");

  check(
    (await pay(n, a, { tip: 5n * GWEI })) === "agent: tip too high",
    "v2: the same 5 gwei tip is refused",
  );
  check((await pay(n, a)) === "included", "v2: the v1 mandate still pays within the v2 limits");

  const v2m = await n.client.readContract({
    address: AGENT_POLICY_ADDRESS,
    abi: agentPolicyAbi,
    functionName: "getMandateV2",
    args: [a.address],
  });
  check(v2m[1] === false, "v2: the v1 mandate has no fee cap");

  const expiry = BigInt(Math.floor(Date.now() / 1000) + 86_400);
  await setMandate(n, a.address, {
    payees: [payee],
    perTxCap: coin(1),
    dailyCap: coin(3),
    dailyFeeCap: coin(1) / 10n,
    expiry,
  });
  const after = await n.client.readContract({
    address: AGENT_POLICY_ADDRESS,
    abi: agentPolicyAbi,
    functionName: "getMandateV2",
    args: [a.address],
  });
  check(
    after[1] === true && after[0].dailyFeeCap === coin(1) / 10n,
    "v2: setMandateV2 sets the fee cap",
  );

  const b = await freshAgent(n, [payee]);
  check(await readPolicy.isAgent(n, b.address), "v2: a new agent registers with a v2 proof");
  check((await pay(n, b)) === "included", "v2: the new agent pays");

  await setFrozen(n, a.address, true);
  check((await pay(n, a)) === "agent: frozen", "v2: frozen with a v2 freeze proof");
  await setFrozen(n, a.address, false);
  check((await pay(n, a)) === "included", "v2: unfrozen with a v2 unfreeze proof");

  const ref = paymentData("http://seller.local/item", `0x${"11".repeat(32)}`);
  check(
    (await pay(n, a, { data: ref })) === "included",
    "v2: x402 reference with its intrinsic gas goes in",
  );
  check(
    (await pay(n, a, { data: ref, gas: agentPaymentGas(ref) + 1n })).startsWith("agent: gas limit"),
    "v2: one more gas unit is refused",
  );

  console.log(failures === 0 ? "rule-v2-switch: PASS" : `rule-v2-switch: FAIL (${failures})`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("rule-v2-switch: FAIL:", err instanceof Error ? err.message : err);
  process.exit(1);
});
