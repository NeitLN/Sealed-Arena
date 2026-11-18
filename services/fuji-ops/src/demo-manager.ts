// The demo manager for the owner console on Fuji: the key the relayer uses to give demo agents
// their right to send (POST /demo/claim) and their coins. It holds the TxAllowList manager role,
// not the admin role: it can allow and remove senders, not change who manages the list.
//   pnpm --filter fuji-ops demo-manager grant         create the key in .env if missing (never printed),
//                                                      give it the manager role
//   pnpm --filter fuji-ops demo-manager fund <coins>  send it coins from the admin (each demo agent gets 0.05)
//   pnpm --filter fuji-ops demo-manager status        its role and balance
//   pnpm --filter fuji-ops demo-manager audit         every address the manager allowed must be a registered agent
//   pnpm --filter fuji-ops demo-manager revoke        the admin removes the manager role (the relayer then answers 503)
// The relayer on the VM reads the same key as RELAYER_DEMO_MANAGER_KEY.
// Needs the L1 RPC (FUJI_L1_RPC or the SSH tunnel) and the admin key in Sealed-Arena/.env.
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AGENT_POLICY_ADDRESS,
  agentPolicyAbi,
  allowListAbi,
  PRECOMPILES,
} from "@sealed-arena/shared";
import {
  type Address,
  createPublicClient,
  createWalletClient,
  defineChain,
  type Hex,
  http,
  parseEther,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const HERE = dirname(fileURLToPath(import.meta.url));
/** Sealed-Arena/.env, or SEALED_ENV_FILE (e.g. from a second checkout). */
const ENV = process.env.SEALED_ENV_FILE ?? resolve(HERE, "../../../.env");
process.loadEnvFile(ENV);
const DEPLOYMENTS = resolve(HERE, "../deployments/fuji.json");
const d = JSON.parse(readFileSync(DEPLOYMENTS, "utf8")) as { blockchainID: string } & Record<
  string,
  unknown
>;
const rpc = process.env.FUJI_L1_RPC ?? `http://127.0.0.1:19650/ext/bc/${d.blockchainID}/rpc`;
const chain = defineChain({
  id: 261126,
  name: "Sealed (Fuji)",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: [rpc] } },
});
const pub = createPublicClient({ chain, transport: http(rpc) });
const adminKey = process.env.FUJI_L1_ADMIN_PRIVATE_KEY as Hex | undefined;
if (!adminKey) throw new Error("FUJI_L1_ADMIN_PRIVATE_KEY is not set");
const admin = createWalletClient({
  account: privateKeyToAccount(adminKey),
  chain,
  transport: http(rpc),
});
const LIST = PRECOMPILES.txAllowList as Address;
const ROLE = ["none", "enabled", "admin", "manager"];

function managerAddress(create: boolean): Address {
  let key = process.env.FUJI_DEMO_MANAGER_PRIVATE_KEY as Hex | undefined;
  if (!key) {
    if (!create) throw new Error("FUJI_DEMO_MANAGER_PRIVATE_KEY is not set: run grant first");
    key = generatePrivateKey();
    process.env.FUJI_DEMO_MANAGER_PRIVATE_KEY = key;
    appendFileSync(
      ENV,
      `\n# Demo manager (TxAllowList manager role), see demo-manager.ts\nFUJI_DEMO_MANAGER_PRIVATE_KEY=${key}\n`,
    );
  }
  return privateKeyToAccount(key).address;
}

const record = (k: string, v: string) => {
  const m = (d.demoManager ?? {}) as Record<string, string>;
  m[k] = v;
  d.demoManager = m;
  writeFileSync(DEPLOYMENTS, `${JSON.stringify(d, null, 2)}\n`);
};

async function grant() {
  const manager = managerAddress(true);
  record("address", manager);
  const role = await pub.readContract({
    address: LIST,
    abi: allowListAbi,
    functionName: "readAllowList",
    args: [manager],
  });
  if (role !== 3n) {
    const hash = await admin.writeContract({
      address: LIST,
      abi: allowListAbi,
      functionName: "setManager",
      args: [manager],
    });
    await pub.waitForTransactionReceipt({ hash });
    record("managerTx", hash);
  }
  await status();
}

async function fund(coins: string) {
  const manager = managerAddress(false);
  const hash = await admin.sendTransaction({ to: manager, value: parseEther(coins) });
  await pub.waitForTransactionReceipt({ hash });
  record("lastFundTx", hash);
  await status();
}

async function status() {
  const manager = managerAddress(false);
  const role = await pub.readContract({
    address: LIST,
    abi: allowListAbi,
    functionName: "readAllowList",
    args: [manager],
  });
  const balance = await pub.getBalance({ address: manager });
  console.log(
    `demo manager ${manager}: role ${ROLE[Number(role)] ?? role}, ${Number(balance) / 1e18} coins`,
  );
}

/** The manager's address from deployments/fuji.json (its key is not needed to audit or revoke it). */
function recordedManager(): Address {
  const m = (d.demoManager as { address?: Address } | undefined)?.address;
  if (!m) throw new Error("no demoManager in deployments/fuji.json");
  return m;
}

/**
 * The relayer registers a demo agent before it allows it to send, so every address the manager key
 * allowed must be a registered agent. One that is not was allowed by someone holding the key.
 */
async function audit() {
  const manager = recordedManager();
  const roleSet = allowListAbi.find((x) => x.type === "event" && x.name === "RoleSet");
  const logs = (await pub.getLogs({
    address: LIST,
    event: roleSet as never,
    args: { sender: manager } as never,
    fromBlock: 0n,
    toBlock: "latest",
  })) as unknown as Array<{ args: { role: bigint; account: Address }; blockNumber: bigint }>;
  let bad = 0;
  for (const l of logs) {
    const { role, account } = l.args;
    if (role !== 1n) {
      console.log(`${account}: role set to ${ROLE[Number(role)] ?? role} by the manager`);
      continue;
    }
    const registered = (await pub.readContract({
      address: AGENT_POLICY_ADDRESS,
      abi: agentPolicyAbi,
      functionName: "isAgent",
      args: [account],
    } as never)) as boolean;
    if (!registered) bad++;
    console.log(
      `${registered ? "PASS" : "FAIL"}  ${account} allowed in block ${l.blockNumber}, ${registered ? "registered agent" : "NOT a registered agent"}`,
    );
  }
  console.log(
    `audit: ${logs.length} role changes by ${manager}; ${bad} allowed address(es) not registered`,
  );
  if (bad) process.exitCode = 1;
}

async function revoke() {
  const manager = recordedManager();
  const hash = await admin.writeContract({
    address: LIST,
    abi: allowListAbi,
    functionName: "setNone",
    args: [manager],
  });
  await pub.waitForTransactionReceipt({ hash });
  record("revokeTx", hash);
  const role = await pub.readContract({
    address: LIST,
    abi: allowListAbi,
    functionName: "readAllowList",
    args: [manager],
  });
  console.log(`demo manager ${manager}: role ${ROLE[Number(role)] ?? role} (revoke tx ${hash})`);
}

const [cmd, arg] = process.argv.slice(2);
const run =
  cmd === "grant"
    ? grant()
    : cmd === "fund" && arg
      ? fund(arg)
      : cmd === "status"
        ? status()
        : cmd === "audit"
          ? audit()
          : cmd === "revoke"
            ? revoke()
            : undefined;
if (!run) {
  console.error("usage: demo-manager <grant | fund <coins> | status | audit | revoke>");
  process.exit(2);
}
run.catch((e) => {
  console.error("demo-manager: FAIL:", e instanceof Error ? e.message.split("\n")[0] : e);
  process.exit(1);
});
