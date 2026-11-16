// ArenaRecorder on the local Sealed L1 (docs/ARCHITECTURE.md section 5).
// Deploys the recorder, makes a fresh agent funded only through the recorder, runs the
// leaked-key attack suite against that agent, then checks that a checkpoint finds no breach.
// Needs the compiled contract: bash scripts/forge.sh build. Test keys only.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { allowListAbi, arenaRecorderAbi, LOCAL_PAYEES, PRECOMPILES } from "@sealed-arena/shared";
import { type Address, encodeFunctionData, formatEther, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import {
  accounts,
  coin,
  type Node,
  nodes,
  readPolicy,
  registerAgent,
  rpcPath,
  sendAndWait,
  setMandate,
  wallet,
} from "./localnet.js";

const require = createRequire(import.meta.url);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const ARTIFACT = resolve(ROOT, "contracts/out/ArenaRecorder.sol/ArenaRecorder.json");
const FUNDING = coin(50);

/** Deploys ArenaRecorder with the deployer key; the deployer becomes its admin. */
export async function deployRecorder(n: Node): Promise<Address> {
  const artifact = JSON.parse(readFileSync(ARTIFACT, "utf8")) as {
    abi: unknown;
    bytecode: { object: Hex };
  };
  if (JSON.stringify(artifact.abi) !== JSON.stringify(arenaRecorderAbi)) {
    throw new Error("packages/shared/src/arenaRecorderAbi.ts differs from the compiled contract");
  }
  const hash = await wallet(n, accounts.deployer).deployContract({
    abi: arenaRecorderAbi,
    bytecode: artifact.bytecode.object,
    gas: 3_000_000n,
  });
  const receipt = await n.client.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success" || !receipt.contractAddress) throw new Error("deploy failed");
  return receipt.contractAddress;
}

async function main(): Promise<void> {
  const [n] = nodes();
  if (!n) throw new Error("no node");
  /** Reads one per-agent view of the recorder. */
  const read = async <T>(recorder: Address, functionName: string, agent: Address): Promise<T> =>
    (await n.client.readContract({
      address: recorder,
      abi: arenaRecorderAbi,
      functionName,
      args: [agent],
    } as never)) as T;

  const recorder = await deployRecorder(n);
  console.log(`arena: recorder deployed at ${recorder}`);

  // A fresh agent that holds nothing but what the recorder sends it.
  const agentKey = generatePrivateKey();
  const agent = privateKeyToAccount(agentKey);
  await sendAndWait(n, accounts.admin, {
    to: PRECOMPILES.txAllowList,
    data: encodeFunctionData({
      abi: allowListAbi,
      functionName: "setEnabled",
      args: [agent.address],
    }),
  });
  await registerAgent(n, agent);
  const expiry = BigInt(Math.floor(Date.now() / 1000) + 7 * 86_400);
  await setMandate(n, agent.address, {
    payees: LOCAL_PAYEES,
    perTxCap: coin(1),
    dailyCap: coin(3),
    expiry,
  });
  const call = (functionName: "enroll" | "checkpoint", value?: bigint) =>
    sendAndWait(n, accounts.deployer, {
      to: recorder,
      data: encodeFunctionData({ abi: arenaRecorderAbi, functionName, args: [agent.address] }),
      ...(value ? { value } : {}),
    });
  await call("enroll");
  await sendAndWait(n, accounts.deployer, {
    to: recorder,
    value: FUNDING,
    data: encodeFunctionData({
      abi: arenaRecorderAbi,
      functionName: "fund",
      args: [agent.address],
    }),
  });
  const funded = await read<bigint>(recorder, "funded", agent.address);
  const balance0 = await n.client.getBalance({ address: agent.address });
  console.log(
    `arena: agent ${agent.address} enrolled, funded ${formatEther(funded)}, balance ${formatEther(balance0)}`,
  );
  if (funded !== FUNDING || balance0 !== FUNDING)
    throw new Error("funding through the recorder did not land");

  // The leaked-key suite, run against this agent.
  console.log("arena: running the leaked-key suite against the enrolled agent");
  execFileSync(process.execPath, [require.resolve("tsx/cli"), "src/leaked-key.ts"], {
    cwd: resolve(ROOT, "services/attacks"),
    stdio: ["ignore", "inherit", "inherit"],
    env: {
      ...process.env,
      SEALED_AGENT_KEY: agentKey,
      SEALED_RPC_PATH: rpcPath().replace(/^\//, ""),
    },
  });

  await call("checkpoint");
  const [breached, score, required, charged] = await Promise.all([
    read<boolean>(recorder, "breached", agent.address),
    read<bigint>(recorder, "score", agent.address),
    read<bigint>(recorder, "requiredBalance", agent.address),
    readPolicy.spend(n, agent.address).then((s) => s[2]),
  ]);
  const balance = await n.client.getBalance({ address: agent.address });
  console.log(
    `arena: after the attacks balance ${formatEther(balance)} >= required ${formatEther(required)} ` +
      `(funded ${formatEther(funded)} - charged ${formatEther(charged)}), breached ${breached}, score ${score}`,
  );
  const ok = !breached && balance >= required && score > 0n && charged > 0n;
  console.log(`arena: ${ok ? "PASS" : "FAIL"}`);
  if (!ok) process.exit(1);
}

if (process.argv[1]?.endsWith("arena.ts")) {
  main().catch((err) => {
    console.error("arena: FAIL:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
