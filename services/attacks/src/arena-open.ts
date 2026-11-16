// Opens the red-team challenge on a network (the Sealed L1 on Fuji): the challenge agent may send,
// is registered under a SECRET owner P-256 key (SEALED_OWNER_P256_KEY), gets a small mandate to two
// team-held payees, and is enrolled and funded through the ArenaRecorder. Safe to run again.
// Env: SEALED_NODE_URLS, SEALED_RPC_PATH, SEALED_ADMIN_KEY, SEALED_RELAYER_KEY, SEALED_DEPLOYER_KEY
// (recorder admin), SEALED_AGENT_KEY (challenge agent, public on purpose), SEALED_OWNER_P256_KEY,
// ARENA_RECORDER, ARENA_PAYEES (comma), ARENA_FUNDING (coins), ARENA_EXPIRY (unix seconds).
import { allowListAbi, arenaRecorderAbi, PRECOMPILES } from "@sealed-arena/shared";
import { type Address, encodeFunctionData, formatEther, parseEther } from "viem";
import {
  accounts,
  isTxAllowed,
  nodes,
  readPolicy,
  registerAgent,
  sendAndWait,
  setMandate,
} from "./localnet.js";

const need = (k: string) => {
  const v = process.env[k];
  if (!v) throw new Error(`${k} is not set`);
  return v;
};
if (!process.env.SEALED_OWNER_P256_KEY) {
  throw new Error(
    "SEALED_OWNER_P256_KEY must be set: the public test owner key would let anyone change the mandate",
  );
}

async function main() {
  const n = nodes()[0];
  if (!n) throw new Error("no node");
  const agent = accounts.agent;
  const recorder = need("ARENA_RECORDER") as Address;
  const payees = need("ARENA_PAYEES")
    .split(",")
    .map((s) => s.trim()) as Address[];
  const funding = parseEther(process.env.ARENA_FUNDING ?? "5");
  const expiry = BigInt(need("ARENA_EXPIRY"));

  if (!(await isTxAllowed(n, agent.address))) {
    await sendAndWait(n, accounts.admin, {
      to: PRECOMPILES.txAllowList,
      data: encodeFunctionData({
        abi: allowListAbi,
        functionName: "setEnabled",
        args: [agent.address],
      }),
    });
    console.log("arena: agent allowed to send");
  }
  if (!(await readPolicy.isAgent(n, agent.address))) {
    await registerAgent(n, agent);
    console.log("arena: agent registered under the secret owner key");
  }
  const mandate = { payees, perTxCap: parseEther("0.5"), dailyCap: parseEther("1"), expiry };
  const [current] = await readPolicy.mandate(n, agent.address);
  if (
    current.payees.join() !== payees.join() ||
    current.perTxCap !== mandate.perTxCap ||
    current.dailyCap !== mandate.dailyCap ||
    current.expiry !== expiry
  ) {
    await setMandate(n, agent.address, mandate);
    console.log("arena: mandate set");
  }
  const read = (fn: string) =>
    n.client.readContract({
      address: recorder,
      abi: arenaRecorderAbi,
      functionName: fn,
      args: [agent.address],
    } as never) as Promise<unknown>;
  if (!(await read("enrolled"))) {
    await sendAndWait(n, accounts.deployer, {
      to: recorder,
      data: encodeFunctionData({
        abi: arenaRecorderAbi,
        functionName: "enroll",
        args: [agent.address],
      }),
    });
    console.log("arena: enrolled in the ArenaRecorder");
  }
  if (((await read("funded")) as bigint) < funding) {
    await sendAndWait(n, accounts.admin, {
      to: recorder,
      value: funding,
      data: encodeFunctionData({
        abi: arenaRecorderAbi,
        functionName: "fund",
        args: [agent.address],
      }),
    });
    console.log(`arena: funded ${formatEther(funding)} through the recorder`);
  }
  const [m, frozen] = await readPolicy.mandate(n, agent.address);
  console.log(
    JSON.stringify({
      agent: agent.address,
      balance: formatEther(await n.client.getBalance({ address: agent.address })),
      funded: formatEther((await read("funded")) as bigint),
      breached: await read("breached"),
      payees: m.payees,
      perTxCap: formatEther(m.perTxCap),
      dailyCap: formatEther(m.dailyCap),
      expiry: m.expiry.toString(),
      frozen,
    }),
  );
}

main().catch((e) => {
  console.error("arena-open: FAIL:", e instanceof Error ? e.message : e);
  process.exit(1);
});
