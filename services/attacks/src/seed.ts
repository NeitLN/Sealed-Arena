// scripts/localnet.sh seed: prepare the local test agent (safe to run again).
//   1. admin adds the agent to TxAllowList (it is never a deployer or minter);
//   2. admin funds the agent;
//   3. relayer registers the agent with the owner's test passkey;
//   4. relayer sets the sample mandate: two plain payees, perTxCap, dailyCap, 7-day expiry.
import { allowListAbi, LOCAL_PAYEES, PRECOMPILES } from "@sealed-arena/shared";
import { encodeFunctionData } from "viem";
import {
  accounts,
  coin,
  isTxAllowed,
  nodes,
  readPolicy,
  registerAgent,
  sendAndWait,
  setMandate,
} from "./localnet.js";

export const SAMPLE_MANDATE = {
  payees: LOCAL_PAYEES,
  perTxCap: coin(1),
  dailyCap: coin(3),
} as const;
/** Coins given to the test agent: SEALED_SEED_FUNDING (whole coins), 100 by default. */
export const SEED_FUNDING = coin(BigInt(process.env.SEALED_SEED_FUNDING ?? "100"));

export async function seed(): Promise<void> {
  const [n] = nodes();
  if (!n) throw new Error("no node");
  const agent = accounts.agent.address;

  if (!(await isTxAllowed(n, agent))) {
    await sendAndWait(n, accounts.admin, {
      to: PRECOMPILES.txAllowList,
      data: encodeFunctionData({ abi: allowListAbi, functionName: "setEnabled", args: [agent] }),
    });
    console.log(`seed: agent ${agent} added to TxAllowList`);
  }

  if ((await n.client.getBalance({ address: agent })) < SEED_FUNDING / 2n) {
    await sendAndWait(n, accounts.admin, { to: agent, value: SEED_FUNDING, gas: 21_000n });
    console.log(`seed: funded agent with ${SEED_FUNDING} wei`);
  }

  if (!(await readPolicy.isAgent(n, agent))) {
    await registerAgent(n, accounts.agent);
    console.log("seed: agent registered with the owner's test passkey");
  }

  const expiry = BigInt(Math.floor(Date.now() / 1000) + 7 * 86_400);
  await setMandate(n, agent, { ...SAMPLE_MANDATE, expiry });
  const [m] = await readPolicy.mandate(n, agent);
  console.log(
    `seed: mandate set: payees ${m.payees.join(", ")}, perTxCap ${m.perTxCap}, dailyCap ${m.dailyCap}, expiry ${m.expiry}`,
  );
}

if (process.argv[1]?.endsWith("seed.ts")) {
  seed().catch((err) => {
    console.error("seed: FAIL:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
