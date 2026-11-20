// Agent canary on the Sealed L1 on Fuji (docs/VERIFY.md, RUNBOOK §8).
//   pnpm --filter fuji-ops canary setup   once: key in .env, TxAllowList, 0.2 coin, register, mandate
//   pnpm --filter fuji-ops canary         each run: (a) a payment to a stranger is refused,
//                                         (b) 1 wei to the canary's payee lands in a block,
//                                         (c) balance >= funded - totalCharged
// A dedicated agent with a tiny mandate: one payee held by the project, small caps. Prints PASS / FAIL
// lines and exits non-zero on any FAIL. Talks to the operator's node through the SSH tunnel
// (127.0.0.1:19650) unless CANARY_NODE_URL is set (for example a verifier node, docs/VERIFY.md).
// Keys live only in .env (SEALED_ENV_FILE, default the repo's .env); nothing secret is printed.
import { appendFileSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { agentFees, agentPaymentGas } from "@sealed-arena/shared";
import { type Address, formatEther, type Hex, parseEther } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { errorText, invariantHolds } from "./checks.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ENV = process.env.SEALED_ENV_FILE ?? resolve(HERE, "../../../.env");
process.loadEnvFile(ENV);
const d = JSON.parse(readFileSync(resolve(HERE, "../deployments/fuji.json"), "utf8")) as {
  blockchainID: string;
};

const FUNDING = parseEther("0.2");
/** Tiny caps: a 1-wei payment costs about 21000 × 2 gwei in fees, far below every cap. */
const MANDATE = {
  perTxCap: parseEther("0.001"),
  dailyCap: parseEther("0.01"),
  dailyFeeCap: parseEther("0.005"),
  expiry: BigInt(Date.parse("2027-03-01T00:00:00Z") / 1000),
};
const REFUSAL = "agent: payee not allowed";

const need = (name: string): string => {
  const v = process.env[name];
  if (!v) throw new Error(`${name} missing in ${ENV}`);
  return v;
};

// The helpers of services/attacks read their settings when loaded: point them at the Fuji L1.
Object.assign(process.env, {
  SEALED_NODE_URLS: process.env.CANARY_NODE_URL ?? "http://127.0.0.1:19650",
  SEALED_RPC_PATH: `ext/bc/${d.blockchainID}/rpc`,
});
const mode = process.argv[2] ?? "run";
if (mode === "setup") {
  Object.assign(process.env, {
    SEALED_ADMIN_KEY: need("FUJI_L1_ADMIN_PRIVATE_KEY"),
    SEALED_RELAYER_KEY: need("FUJI_RELAYER_PRIVATE_KEY"),
    SEALED_OWNER_P256_KEY: need("FUJI_SUITE_OWNER_P256_KEY"),
  });
}
const sealed = await import("attacks/localnet");
const n = sealed.nodes()[0] as NonNullable<ReturnType<typeof sealed.nodes>[number]>;

let failed = false;
const report = (status: "PASS" | "FAIL" | "N/A", name: string, detail: string) => {
  if (status === "FAIL") failed = true;
  console.log(`${status.padEnd(4)}  ${name.padEnd(12)} ${detail}`);
};

/** Appends `NAME=value` lines to .env (never printed). */
function saveToEnv(entries: Record<string, string>) {
  const cur = readFileSync(ENV, "utf8");
  const lines = Object.entries(entries).map(([k, v]) => `${k}=${v}`);
  appendFileSync(
    ENV,
    `${cur.endsWith("\n") ? "" : "\n"}# agent canary (fuji-ops canary)\n${lines.join("\n")}\n`,
  );
  for (const [k, v] of Object.entries(entries)) process.env[k] = v;
}

async function setup() {
  if (!process.env.FUJI_CANARY_PRIVATE_KEY) {
    // Keys go to .env before anything is sent, so a failed run never strands coins.
    const key = generatePrivateKey();
    const payeeKey = generatePrivateKey();
    saveToEnv({
      FUJI_CANARY_PRIVATE_KEY: key,
      FUJI_CANARY_ADDRESS: privateKeyToAccount(key).address,
      FUJI_CANARY_PAYEE_PRIVATE_KEY: payeeKey,
      FUJI_CANARY_PAYEE_ADDRESS: privateKeyToAccount(payeeKey).address,
      // In coins, not wei: scripts/submission-check.sh treats long .env values as secrets.
      FUJI_CANARY_FUNDED: formatEther(FUNDING),
    });
    console.log(`new canary keys appended to ${ENV}`);
  }
  const agent = privateKeyToAccount(need("FUJI_CANARY_PRIVATE_KEY") as Hex);
  const payee = need("FUJI_CANARY_PAYEE_ADDRESS") as Address;
  console.log(`canary ${agent.address}, payee ${payee}`);

  if (!(await sealed.isTxAllowed(n, agent.address))) {
    const { PRECOMPILES, allowListAbi } = await import("@sealed-arena/shared");
    const { encodeFunctionData } = await import("viem");
    const tx = await sealed.sendAndWait(n, sealed.accounts.admin, {
      to: PRECOMPILES.txAllowList,
      data: encodeFunctionData({
        abi: allowListAbi,
        functionName: "setEnabled",
        args: [agent.address],
      }),
    });
    console.log(`allowed on TxAllowList: ${tx}`);
  }
  const isAgent = await sealed.readPolicy.isAgent(n, agent.address);
  if (!isAgent && (await n.client.getBalance({ address: agent.address })) === 0n) {
    // Funded before registration, so totalCharged starts at 0 and funded is exactly FUNDING.
    const tx = await sealed.sendAndWait(n, sealed.accounts.admin, {
      to: agent.address,
      value: FUNDING,
      gas: 21_000n,
    });
    console.log(`funded ${formatEther(FUNDING)} from the L1 admin: ${tx}`);
  }
  if (!isAgent) {
    await sealed.registerAgent(n, agent);
    console.log("registered with the suite owner key");
  }
  const tx = await sealed.setMandate(n, agent.address, { payees: [payee], ...MANDATE });
  console.log(
    `mandate: payee ${payee}, perTx ${formatEther(MANDATE.perTxCap)}, daily ${formatEther(MANDATE.dailyCap)}, dailyFee ${formatEther(MANDATE.dailyFeeCap)}, expiry ${new Date(Number(MANDATE.expiry) * 1000).toISOString()}: ${tx}`,
  );
}

async function run() {
  const agent = privateKeyToAccount(need("FUJI_CANARY_PRIVATE_KEY") as Hex);
  const payee = need("FUJI_CANARY_PAYEE_ADDRESS") as Address;
  const funded = parseEther(need("FUJI_CANARY_FUNDED"));
  const w = sealed.wallet(n, agent);
  const fees = agentFees(await n.client.estimateFeesPerGas());
  const send = async (to: Address) => {
    const nonce = await n.client.getTransactionCount({
      address: agent.address,
      blockTag: "pending",
    });
    return w.sendTransaction({ to, value: 1n, gas: agentPaymentGas(), nonce, ...fees });
  };
  console.log(`canary ${agent.address} via ${n.url}`);

  // (a) a stranger, new each run, so it can never be in the mandate
  const stranger = privateKeyToAccount(generatePrivateKey()).address;
  try {
    const hash = await send(stranger);
    report("FAIL", "stranger", `payment to ${stranger} was accepted: ${hash}`);
  } catch (e) {
    const text = errorText(e);
    report(
      text.includes(REFUSAL) ? "PASS" : "FAIL",
      "stranger",
      text.includes(REFUSAL)
        ? `payment to ${stranger} refused: "${REFUSAL}"`
        : `refused, but not with "${REFUSAL}": ${text.slice(0, 300)}`,
    );
  }

  // (b) 1 wei to the payee lands in a block
  try {
    const hash = await send(payee);
    const r = await n.client.waitForTransactionReceipt({ hash, timeout: 60_000 });
    report(
      r.status === "success" ? "PASS" : "FAIL",
      "payee",
      `1 wei to ${payee}: block ${r.blockNumber}, status ${r.status}, ${hash}`,
    );
  } catch (e) {
    report("FAIL", "payee", `1 wei to ${payee}: ${errorText(e).slice(0, 300)}`);
  }

  // (c) the challenge invariant for this agent
  const [balance, spend] = await Promise.all([
    n.client.getBalance({ address: agent.address }),
    sealed.readPolicy.spend(n, agent.address),
  ]);
  const totalCharged = spend[2];
  report(
    invariantHolds(balance, funded, totalCharged) ? "PASS" : "FAIL",
    "invariant",
    `balance ${formatEther(balance)} >= funded ${formatEther(funded)} - totalCharged ${formatEther(totalCharged)}`,
  );
  console.log(`at ${new Date().toISOString()}`);
}

try {
  if (mode === "setup") await setup();
  else if (mode === "run") await run();
  else throw new Error("usage: canary [run|setup]");
} catch (e) {
  report("FAIL", mode, errorText(e).split("\n")[0] ?? "error");
}
process.exit(failed ? 1 : 0);
