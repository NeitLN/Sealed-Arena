// Attack suite, wallet tier (T15): runs every case of cases.ts against one group and writes the raw
// results to suite/results/. The report is built from those files only.
//   pnpm --filter attacks suite wallet S        local Sealed L1 (scripts/localnet.sh up)
//   pnpm --filter attacks suite wallet P|O      Fuji C-Chain; needs `compare setup` (O, sink) and keys in .env
//   pnpm --filter attacks suite leaked-key      S: the 25 leaked-key cases of T06, kept for class 9
//   pnpm --filter attacks suite agent 5 [cls..] agent tier: live model, 5 runs per page (local network)
//   pnpm --filter attacks suite report          docs/EVALUATION.md from the newest results
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  type Address,
  createPublicClient,
  createWalletClient,
  encodeAbiParameters,
  erc20Abi,
  formatEther,
  formatUnits,
  type Hex,
  http,
  parseEther,
  parseUnits,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { avalancheFuji } from "viem/chains";
import {
  BENIGN,
  CASES,
  type Case,
  classify,
  FUNDING,
  MANDATE,
  type Paid,
  type Step,
  type Target,
} from "./cases.js";
import {
  type AgentClass,
  type AgentRun,
  annotate,
  type BenignRecord,
  type CaseRecord,
  type Group,
  type RunFile,
  render,
  type WalletRun,
} from "./report.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../..");
const RESULTS = resolve(HERE, "results");
try {
  process.loadEnvFile(resolve(ROOT, ".env"));
} catch {
  // no .env: the local group S and the report need none
}

/** One payment attempt as the group's wallet handled it. */
type Attempt = { paid?: Paid; tx?: Hex; note?: string };

interface Wallet {
  group: Group;
  network: string;
  /** A fresh wallet state holding FUNDING, with a fresh daily budget. */
  prepare(): Promise<void>;
  pay(step: Step): Promise<Attempt>;
}

async function runCase(w: Wallet, c: Case): Promise<CaseRecord> {
  await w.prepare();
  const paid: Paid[] = [];
  const txs: string[] = [];
  const notes = new Set<string>();
  for (const step of c.steps) {
    const a = await w.pay(step);
    if (a.paid) paid.push(a.paid);
    if (a.tx) txs.push(a.tx);
    if (a.note) notes.add(a.note);
  }
  const r = classify(paid);
  const rec: CaseRecord = {
    cls: c.cls,
    id: c.id,
    title: c.title,
    outcome: r.outcome,
    t0: round(r.t0),
    t1: round(r.t1),
    txs,
  };
  if (notes.size) rec.note = [...notes].join("; ");
  console.log(`${c.id} ${r.outcome} t0=${rec.t0} t1=${rec.t1} ${rec.note ?? ""}`);
  return rec;
}

async function runBenign(w: Wallet, c: Case): Promise<BenignRecord> {
  await w.prepare();
  const step = c.steps[0];
  if (!step) throw new Error("benign case without a step");
  const a = await w.pay(step);
  const rec: BenignRecord = { id: c.id, completed: !!a.paid, txs: a.tx ? [a.tx] : [] };
  if (a.note) rec.note = a.note;
  console.log(`benign ${c.id} ${rec.completed ? "completed" : "BLOCKED"} ${a.note ?? ""}`);
  return rec;
}

const round = (x: number) => Math.round(x * 1e6) / 1e6;
const reason = (e: unknown) =>
  /agent: [a-z ]+/.exec(e instanceof Error ? e.message : String(e))?.[0] ??
  (e instanceof Error
    ? ((e as { shortMessage?: string }).shortMessage ?? e.message.split("\n")[0])
    : String(e));

// ---- S: the Sealed L1 on the local network ----------------------------------------------------

async function sealedWallet(): Promise<Wallet> {
  const sealed = await import("../src/localnet.js");
  const { LOCAL_PAYEES } = await import("@sealed-arena/shared");
  const [n] = sealed.nodes();
  if (!n) throw new Error("no local node");
  const to: Record<Target, Address> = {
    sellerA: LOCAL_PAYEES[0] as Address,
    sellerB: LOCAL_PAYEES[1] as Address,
    attacker: "0x000000000000000000000000000000000000bad1",
    lookalike: "0x000000000000000000000000000000000000bad2",
    // Any address outside the mandate is refused before code is looked at; this one is a precompile.
    contract: "0x0200000000000000000000000000000000000002",
  };
  let agent = privateKeyToAccount(generatePrivateKey());
  const chainId = await n.client.getChainId();
  return {
    group: "S",
    network: "local Sealed L1 (3 nodes, scripts/localnet.sh)",
    async prepare() {
      agent = await sealed.freshAgent(n, [to.sellerA, to.sellerB], {
        funding: parseEther(String(FUNDING)),
        perTxCap: parseEther(String(MANDATE.perTx)),
        dailyCap: parseEther(String(MANDATE.daily)),
      });
    },
    async pay(step) {
      const fees = await n.client.estimateFeesPerGas();
      const gas = 21_000n;
      // highFee: a fee of 0.05 on its own, paid in the same coin as the payments.
      const maxFee = step.via === "highFee" ? parseEther("0.05") / gas : fees.maxFeePerGas;
      const tip = step.via === "highFee" ? maxFee : fees.maxPriorityFeePerGas;
      const balance = await n.client.getBalance({ address: agent.address });
      const value = step.amount === "all" ? balance - gas * maxFee : parseEther(step.amount);
      const note =
        step.via === "approve"
          ? "no token approval on a native coin: sent as a transfer"
          : undefined;
      if (value <= 0n) return { note: "nothing left to send" };
      const nonce = await n.client.getTransactionCount({
        address: agent.address,
        blockTag: "pending",
      });
      const raw = await agent.signTransaction({
        type: "eip1559",
        chainId,
        nonce,
        to: to[step.to],
        value,
        gas,
        maxFeePerGas: maxFee,
        maxPriorityFeePerGas: tip,
      });
      try {
        const hash = await n.client.sendRawTransaction({ serializedTransaction: raw });
        // The pool can accept a payment the block builder then skips (docs/ARCHITECTURE.md): give up
        // waiting after a while and count it as not paid.
        const r = await n.client
          .waitForTransactionReceipt({ hash, timeout: 30_000 })
          .catch(() => undefined);
        if (!r) return { tx: hash, note: "accepted by the pool, not in a block after 30 s" };
        if (r.status !== "success") return { tx: hash, note: "reverted" };
        const fee = Number(formatEther(r.gasUsed * r.effectiveGasPrice));
        const paid: Paid = { to: step.to, amount: Number(formatEther(value)) };
        if (step.via === "highFee") paid.fee = fee;
        return note ? { paid, tx: hash, note } : { paid, tx: hash };
      } catch (e) {
        const why = reason(e);
        return { note: note ? `${note}; refused: ${why}` : `refused: ${why}` };
      }
    },
  };
}

// ---- P and O: the Fuji C-Chain -------------------------------------------------------------------

const USDC: Address = "0x5425890298aed601595a70AB815c96711a31Bc65";
const env = (k: string) => {
  const v = process.env[k];
  if (!v) throw new Error(`${k} is not set`);
  return v as Hex;
};

function fuji() {
  const c = createPublicClient({ chain: avalancheFuji, transport: http() });
  const wallet = (pk: Hex) =>
    createWalletClient({
      account: privateKeyToAccount(pk),
      chain: avalancheFuji,
      transport: http(),
    });
  const project = wallet(env("FUJI_DEPLOYER_PRIVATE_KEY"));
  const balance = (who: Address) =>
    c.readContract({ address: USDC, abi: erc20Abi, functionName: "balanceOf", args: [who] });
  const send = async (
    w: ReturnType<typeof wallet>,
    fn: "transfer" | "approve",
    args: [Address, bigint],
  ) => {
    const hash = await w.writeContract({ address: USDC, abi: erc20Abi, functionName: fn, args });
    const r = await c.waitForTransactionReceipt({ hash });
    if (r.status !== "success") throw new Error(`${fn} reverted (${hash})`);
    return hash;
  };
  const gasFor = async (who: Address) => {
    if ((await c.getBalance({ address: who })) < parseEther("0.003")) {
      const hash = await project.sendTransaction({ to: who, value: parseEther("0.005") });
      await c.waitForTransactionReceipt({ hash });
    }
  };
  const deployments = JSON.parse(
    readFileSync(resolve(ROOT, "services/fuji-ops/deployments/fuji.json"), "utf8"),
  ) as { compare?: { suiteO?: Address; sink?: Address } };
  // O with the reference caps (not the T14 one, whose caps are 0.5 / 1).
  const capWallet = deployments.compare?.suiteO;
  const sink = deployments.compare?.sink;
  if (!capWallet || !sink)
    throw new Error("run `pnpm --filter attacks compare setup` first (O and sink)");
  const to: Record<Target, Address> = {
    sellerA: env("FUJI_ARENA_PAYEE_1_ADDRESS"),
    sellerB: env("FUJI_ARENA_PAYEE_2_ADDRESS"),
    attacker: env("FUJI_COMPARE_ATTACKER_ADDRESS"),
    lookalike: env("FUJI_SUITE_LOOKALIKE_ADDRESS"),
    // A team-owned contract wallet, so test USDC sent to "a contract" can be withdrawn.
    contract: sink,
  };
  const spenders: Partial<Record<Target, Hex>> = {
    attacker: env("FUJI_COMPARE_ATTACKER_PRIVATE_KEY"),
    lookalike: env("FUJI_SUITE_LOOKALIKE_PRIVATE_KEY"),
  };
  return { c, wallet, project, balance, send, gasFor, capWallet, to, spenders };
}

const units = (amount: string | "all", all: bigint) =>
  amount === "all" ? all : parseUnits(amount, 6);
const usdcNum = (x: bigint) => Number(formatUnits(x, 6));
const FUND = parseUnits(String(FUNDING), 6);

async function plainWallet(): Promise<Wallet> {
  const f = fuji();
  const p = f.wallet(env("FUJI_COMPARE_P_PRIVATE_KEY"));
  const pAddr = p.account.address;
  return {
    group: "P",
    network: "Fuji C-Chain (Circle test USDC)",
    async prepare() {
      await f.gasFor(pAddr);
      const b = await f.balance(pAddr);
      if (b < FUND) await f.send(f.project, "transfer", [pAddr, FUND - b]);
      if (b > FUND) await f.send(p, "transfer", [f.project.account.address, b - FUND]);
    },
    async pay(step) {
      const amount = units(step.amount, await f.balance(pAddr));
      if (amount === 0n) return { note: "nothing left to send" };
      try {
        if (step.via === "approve") {
          const spenderKey = f.spenders[step.to];
          if (!spenderKey) throw new Error(`no key for ${step.to}`);
          await f.send(p, "approve", [f.to[step.to], amount]);
          const spender = f.wallet(spenderKey);
          await f.gasFor(spender.account.address);
          const hash = await spender.writeContract({
            address: USDC,
            abi: erc20Abi,
            functionName: "transferFrom",
            args: [pAddr, f.to[step.to], amount],
          });
          await f.c.waitForTransactionReceipt({ hash });
          return {
            paid: { to: step.to, amount: usdcNum(amount) },
            tx: hash,
            note: "approved, then pulled",
          };
        }
        const hash = await f.send(p, "transfer", [f.to[step.to], amount]);
        const note =
          step.via === "highFee" ? "fee is paid in AVAX, not from the USDC balance" : undefined;
        const paid = { to: step.to, amount: usdcNum(amount) };
        return note ? { paid, tx: hash, note } : { paid, tx: hash };
      } catch (e) {
        return { note: `refused: ${reason(e)}` };
      }
    },
  };
}

const TRANSFER_TYPES = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;
const settleAbi = [
  {
    name: "transferWithAuthorization",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
      { name: "signature", type: "bytes" },
    ],
    outputs: [],
  },
] as const;
const capWalletAbi = [
  { name: "startDay", type: "function", stateMutability: "nonpayable", inputs: [], outputs: [] },
  {
    name: "withdraw",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

async function capWallet(): Promise<Wallet> {
  const f = fuji();
  const o = f.capWallet;
  const agent = privateKeyToAccount(env("FUJI_COMPARE_O_AGENT_PRIVATE_KEY"));
  const domain = { name: "USDC", version: "2", chainId: avalancheFuji.id, verifyingContract: USDC };
  domain.name = (await f.c.readContract({
    address: USDC,
    abi: [
      {
        name: "name",
        type: "function",
        stateMutability: "view",
        inputs: [],
        outputs: [{ type: "string" }],
      },
    ],
    functionName: "name",
  })) as string;
  /** Owner actions on O: withdraw the extra above FUNDING, or start a new daily budget. */
  const owner = async (args?: [Address, bigint]) => {
    const hash = await f.project.writeContract(
      args
        ? { address: o, abi: capWalletAbi, functionName: "withdraw", args }
        : { address: o, abi: capWalletAbi, functionName: "startDay" },
    );
    await f.c.waitForTransactionReceipt({ hash });
  };
  return {
    group: "O",
    network: "Fuji C-Chain (Circle test USDC, CapWalletO)",
    async prepare() {
      const b = await f.balance(o);
      if (b < FUND) await f.send(f.project, "transfer", [o, FUND - b]);
      if (b > FUND) await owner([f.project.account.address, b - FUND]);
      await owner();
    },
    async pay(step) {
      const value = units(step.amount, await f.balance(o));
      if (value === 0n) return { note: "nothing left to send" };
      const m = {
        from: o,
        to: f.to[step.to],
        value,
        validAfter: 0n,
        validBefore: BigInt(Math.floor(Date.now() / 1000) + 3600),
        nonce: generatePrivateKey(),
      };
      const sig = await agent.signTypedData({
        domain,
        primaryType: "TransferWithAuthorization",
        types: TRANSFER_TYPES,
        message: m,
      });
      const wrapped = encodeAbiParameters(
        [
          { type: "address" },
          { type: "uint256" },
          { type: "uint256" },
          { type: "uint256" },
          { type: "bytes32" },
          { type: "bytes" },
        ],
        [m.to, m.value, m.validAfter, m.validBefore, m.nonce, sig],
      );
      const args = [m.from, m.to, m.value, m.validAfter, m.validBefore, m.nonce, wrapped] as const;
      const notes: string[] = [];
      if (step.via === "approve") notes.push("no approval path in O: signed as an authorization");
      if (step.via === "highFee") notes.push("fee is paid by the facilitator in AVAX");
      try {
        // The facilitator's checks: simulate first, settle only if the token accepts it.
        await f.c.simulateContract({
          account: f.project.account,
          address: USDC,
          abi: settleAbi,
          functionName: "transferWithAuthorization",
          args,
        });
      } catch (e) {
        notes.push(`refused: ${reason(e)}`);
        return { note: notes.join("; ") };
      }
      const hash = await f.project.writeContract({
        address: USDC,
        abi: settleAbi,
        functionName: "transferWithAuthorization",
        args,
      });
      const r = await f.c.waitForTransactionReceipt({ hash });
      if (r.status !== "success") return { tx: hash, note: [...notes, "reverted"].join("; ") };
      const paid = { to: step.to, amount: usdcNum(value) };
      return notes.length ? { paid, tx: hash, note: notes.join("; ") } : { paid, tx: hash };
    },
  };
}

// ---- class 9 for S: the leaked-key suite of T06 ------------------------------------------------

type LeakedKeyFile = {
  results: Array<{
    name: string;
    expected: "blocked" | "succeeded";
    result: "blocked" | "succeeded";
    reason: string;
  }>;
  ok: boolean;
};

/** The T06 attack cases (not the positive control) as class 9 records for S. */
function leakedKeyRecords(): CaseRecord[] {
  const file = resolve(RESULTS, "leaked-key.json");
  if (!existsSync(file)) return [];
  const lk = JSON.parse(readFileSync(file, "utf8")) as LeakedKeyFile;
  return lk.results
    .filter((r) => r.expected === "blocked")
    .map((r, i) => ({
      cls: 9,
      id: `9.L${i + 1}`,
      title: `leaked-key suite: ${r.name}`,
      outcome: r.result === "succeeded" ? "T0" : "blocked",
      t0: 0,
      t1: 0,
      txs: [],
      note: r.reason,
    }));
}

// ---- commands -------------------------------------------------------------------------------------

async function wallet(group: string) {
  const w =
    group === "S"
      ? await sealedWallet()
      : group === "P"
        ? await plainWallet()
        : group === "O"
          ? await capWallet()
          : undefined;
  if (!w) throw new Error("usage: suite wallet <P|O|S>");
  const at = new Date().toISOString();
  const cases: CaseRecord[] = [];
  for (const c of CASES) cases.push(await runCase(w, c));
  if (w.group === "S") cases.push(...leakedKeyRecords());
  const benign: BenignRecord[] = [];
  for (const b of BENIGN) benign.push(await runBenign(w, b));
  const run: WalletRun = {
    version: 1,
    kind: "wallet",
    at,
    group: w.group,
    network: w.network,
    cases,
    benign,
  };
  mkdirSync(RESULTS, { recursive: true });
  const file = resolve(RESULTS, `wallet-${w.group}-${at.replace(/[:.]/g, "-")}.json`);
  writeFileSync(file, `${JSON.stringify(run, null, 2)}\n`);
  console.log(`results: ${file}`);
}

function leakedKey() {
  mkdirSync(RESULTS, { recursive: true });
  execSync("pnpm --filter attacks run --silent leaked-key", {
    stdio: "inherit",
    env: { ...process.env, LEAKED_KEY_JSON: resolve(RESULTS, "leaked-key.json") },
  });
}

/** Pages of the agent tier: classes whose payment the model decides on (3 to 5 are paid by the x402 client). */
const AGENT_PAGES: Array<[number, string]> = [
  [1, "injection"],
  [2, "injection-strong"],
  [6, "drain"],
  [7, "poisoned-memory"],
];

/** Live runs of the buying agent (services/agent) on the local network; needs the LLM key in .env. */
function agentTier(runs: number, only: number[]) {
  const at = new Date().toISOString();
  const model = process.env.LLM_MODEL || "claude-sonnet-5-5";
  const classes: AgentClass[] = [];
  for (const [cls, scenario] of AGENT_PAGES) {
    if (only.length && !only.includes(cls)) continue;
    let out: string;
    try {
      out = execSync(`pnpm --filter agent run --silent scenario ${scenario} --runs ${runs}`, {
        encoding: "utf8",
        env: { ...process.env, ANTHROPIC_WORKSPACE_ID: "" },
        maxBuffer: 64 * 1024 * 1024,
      });
    } catch (e) {
      // A failed on-chain check exits non-zero; keep the counts and say so.
      out = String((e as { stdout?: string }).stdout ?? "");
      console.log(`!! ${scenario}: a check in the scenario failed (see its output)`);
    }
    const m = /called send_payment\): (\d+)\/(\d+) runs/.exec(out);
    if (!m) throw new Error(`no result line for ${scenario}`);
    // Windows paths use backslashes: accept either separator.
    const transcripts = [...out.matchAll(/transcript: .*[\\/](transcripts[\\/][^\s]+\.json)/g)].map(
      (x) => `services/agent/${(x[1] ?? "").replaceAll("\\", "/")}`,
    );
    const row: AgentClass = {
      cls,
      scenario,
      runs: Number(m[2]),
      followed: Number(m[1]),
      transcripts,
    };
    // Facts from the transcripts (e.g. whether the class 7 note was read) are added by the report.
    classes.push(row);
    console.log(`class ${cls} ${scenario}: followed ${m[1]}/${m[2]}`);
  }
  const run: AgentRun = {
    version: 1,
    kind: "agent",
    at,
    model,
    network: "local Sealed L1 (3 nodes, scripts/localnet.sh)",
    classes,
  };
  mkdirSync(RESULTS, { recursive: true });
  const file = resolve(RESULTS, `agent-${at.replace(/[:.]/g, "-")}.json`);
  writeFileSync(
    file,
    `${JSON.stringify(run, null, 2)}
`,
  );
  console.log(`results: ${file}`);
}

/** Tool calls of a transcript, path relative to the repository root. */
const readCalls = (path: string) =>
  (
    JSON.parse(readFileSync(resolve(ROOT, path), "utf8")) as {
      calls: Array<{ name: string; input: { key?: string } }>;
    }
  ).calls;

function report() {
  const files: RunFile[] = existsSync(RESULTS)
    ? readdirSync(RESULTS)
        .filter((f) => /^(wallet|agent)-.*\.json$/.test(f))
        .sort()
        .map((f) => JSON.parse(readFileSync(resolve(RESULTS, f), "utf8")) as RunFile)
    : [];
  const out = resolve(ROOT, "docs/EVALUATION.md");
  writeFileSync(out, render(annotate(files, readCalls)));
  console.log(`report: ${out} (${files.length} result files)`);
}

const [cmd, arg] = process.argv.slice(2);
const main = async () => {
  if (cmd === "wallet") return wallet(arg ?? "");
  if (cmd === "leaked-key") return leakedKey();
  if (cmd === "report") return report();
  if (cmd === "agent") return agentTier(Number(arg ?? "5"), process.argv.slice(4).map(Number));
  console.error("usage: suite <wallet P|O|S | leaked-key | agent [runs] | report>");
  process.exit(2);
};
main().catch((e) => {
  console.error("suite: FAIL:", e instanceof Error ? e.message.split("\n")[0] : e);
  process.exit(1);
});
