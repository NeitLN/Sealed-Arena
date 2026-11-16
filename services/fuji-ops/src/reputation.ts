// Survival records over ICM to ERC-8004 on Fuji (T13). Each phase is recorded in deployments/fuji.json.
//   pnpm --filter fuji-ops reputation deploy       TeleporterPublisher (L1) → ArenaRecorder.setPublisher;
//                                                  ERC-8004 identity for the challenge agent (project wallet);
//                                                  ReputationReceiver (Fuji C-Chain) + agentId; publisher.setReceiver
//   pnpm --filter fuji-ops reputation publish      ArenaRecorder.publish(agent) on the L1
//   pnpm --filter fuji-ops reputation read         feedback written by the receiver, read from the registry
// Needs: bash scripts/forge.sh build; L1 RPC (FUJI_L1_RPC or the SSH tunnel); keys in Sealed-Arena/.env.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { arenaRecorderAbi } from "@sealed-arena/shared";
import {
  type Address,
  createPublicClient,
  createWalletClient,
  defineChain,
  type Hex,
  http,
  parseEventLogs,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { avalancheFuji } from "viem/chains";
import { cb58ToHex } from "./ids.js";

const HERE = dirname(fileURLToPath(import.meta.url));
process.loadEnvFile(resolve(HERE, "../../../.env"));
const DEPLOYMENTS = resolve(HERE, "../deployments/fuji.json");

/** Official ERC-8004 registries on Avalanche Testnet (erc-8004-contracts README), checked on chain. */
export const ERC8004 = {
  identity: "0x8004A818BFB912233c491871b3d84c89A494BD9e" as Address,
  reputation: "0x8004B663056A597Dffe9eCcC1965A193B7388713" as Address,
};
const MESSENGER = "0x253b2784c75e510dD0fF1da844684a1aC0aa5fcf" as Address;
const C_CHAIN_ID = "yH8D7ThNJkxmtkuv2jgBa4P1Rn3Qpr4pPr7QYNfcdoS6k6HWp";

const env = (k: string) => {
  const v = process.env[k];
  if (!v) throw new Error(`${k} is not set`);
  return v;
};
type Artifact = { abi: readonly unknown[]; bytecode: { object: Hex } | Hex };
const forge = (file: string, name: string) =>
  JSON.parse(
    readFileSync(resolve(HERE, `../../../contracts/out/${file}/${name}.json`), "utf8"),
  ) as Artifact;
const vendor = (n: string) =>
  JSON.parse(readFileSync(resolve(HERE, `../vendor/${n}.json`), "utf8")) as {
    abi: readonly unknown[];
  };
const code = (a: Artifact): Hex =>
  typeof a.bytecode === "string" ? a.bytecode : a.bytecode.object;

const d = JSON.parse(readFileSync(DEPLOYMENTS, "utf8")) as Record<string, unknown> & {
  blockchainID: string;
  arenaRecorder: { address: Address };
  reputation?: Record<string, string>;
};
d.reputation ??= {};
const rep = d.reputation;
const save = () => writeFileSync(DEPLOYMENTS, `${JSON.stringify(d, null, 2)}\n`);

const l1Rpc = process.env.FUJI_L1_RPC ?? `http://127.0.0.1:19650/ext/bc/${d.blockchainID}/rpc`;
const l1 = defineChain({
  id: 261126,
  name: "Sealed (Fuji)",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: [l1Rpc] } },
});
const lPub = createPublicClient({ chain: l1, transport: http(l1Rpc) });
const cPub = createPublicClient({ chain: avalancheFuji, transport: http() });
const lDeployer = privateKeyToAccount(env("FUJI_L1_DEPLOYER_PRIVATE_KEY") as Hex);
const project = privateKeyToAccount(env("FUJI_DEPLOYER_PRIVATE_KEY") as Hex);
const lWallet = createWalletClient({ account: lDeployer, chain: l1, transport: http(l1Rpc) });
const cWallet = createWalletClient({ account: project, chain: avalancheFuji, transport: http() });
const agent = env("FUJI_ARENA_AGENT_ADDRESS") as Address;

async function wait(on: "L1" | "C", hash: Hex, what: string) {
  const r = await (on === "L1" ? lPub : cPub).waitForTransactionReceipt({ hash });
  if (r.status !== "success") throw new Error(`${what} failed (${hash})`);
  console.log(`${what} on ${on}: tx ${hash}`);
  return r;
}

async function deploy() {
  if (!rep.publisher) {
    const a = forge("TeleporterPublisher.sol", "TeleporterPublisher");
    const hash = await lWallet.deployContract({
      abi: a.abi as never,
      bytecode: code(a),
      args: [MESSENGER, d.arenaRecorder.address, cb58ToHex(C_CHAIN_ID)] as never,
    });
    rep.publisher = (await wait("L1", hash, "deploy TeleporterPublisher"))
      .contractAddress as string;
    save();
  }
  if (!rep.setPublisherTx) {
    const hash = await lWallet.writeContract({
      address: d.arenaRecorder.address,
      abi: arenaRecorderAbi,
      functionName: "setPublisher",
      args: [rep.publisher as Address],
    });
    rep.setPublisherTx = (await wait("L1", hash, "ArenaRecorder.setPublisher")).transactionHash;
    save();
  }
  if (!rep.agentId) {
    const identity = vendor("ERC8004IdentityRegistry");
    const hash = await cWallet.writeContract({
      address: ERC8004.identity,
      abi: identity.abi as never,
      functionName: "register" as never,
      args: ["https://sealed-arena.vercel.app/arena"] as never,
    });
    const r = await wait("C", hash, "ERC-8004 register (identity of the challenge agent)");
    const [ev] = parseEventLogs({
      abi: identity.abi as never,
      logs: r.logs,
      eventName: "Registered" as never,
    }) as unknown as Array<{
      args: { agentId: bigint };
    }>;
    if (!ev) throw new Error("no Registered event");
    rep.agentId = ev.args.agentId.toString();
    rep.identityTx = hash;
    save();
  }
  if (!rep.receiver) {
    const a = forge("ReputationReceiver.sol", "ReputationReceiver");
    const hash = await cWallet.deployContract({
      abi: a.abi as never,
      bytecode: code(a),
      args: [MESSENGER, cb58ToHex(d.blockchainID), rep.publisher, ERC8004.reputation] as never,
    });
    rep.receiver = (await wait("C", hash, "deploy ReputationReceiver")).contractAddress as string;
    save();
  }
  if (!rep.mapTx) {
    const a = forge("ReputationReceiver.sol", "ReputationReceiver");
    const hash = await cWallet.writeContract({
      address: rep.receiver as Address,
      abi: a.abi as never,
      functionName: "setAgentId" as never,
      args: [agent, BigInt(rep.agentId)] as never,
    });
    rep.mapTx = (await wait("C", hash, "ReputationReceiver.setAgentId")).transactionHash;
    save();
  }
  if (!rep.setReceiverTx) {
    const a = forge("TeleporterPublisher.sol", "TeleporterPublisher");
    const hash = await lWallet.writeContract({
      address: rep.publisher as Address,
      abi: a.abi as never,
      functionName: "setReceiver" as never,
      args: [rep.receiver] as never,
    });
    rep.setReceiverTx = (await wait("L1", hash, "TeleporterPublisher.setReceiver")).transactionHash;
    save();
  }
  console.log(JSON.stringify(rep, null, 2));
}

async function publish() {
  const gas = 600_000n;
  const hash = await lWallet.writeContract({
    address: d.arenaRecorder.address,
    abi: arenaRecorderAbi,
    functionName: "publish",
    args: [agent],
    gas,
  });
  await wait("L1", hash, "ArenaRecorder.publish");
  rep.lastPublishTx = hash;
  save();
}

async function read() {
  const abi = vendor("ERC8004ReputationRegistry").abi;
  const r = (fn: string, args: unknown[]) =>
    cPub.readContract({
      address: ERC8004.reputation,
      abi: abi as never,
      functionName: fn as never,
      args: args as never,
    }) as Promise<unknown>;
  const id = BigInt(rep.agentId ?? "0");
  const last = (await r("getLastIndex", [id, rep.receiver])) as bigint;
  console.log(`agentId ${id}, feedback from the receiver: ${last}`);
  if (last > 0n) {
    const [value, decimals, tag1, tag2, revoked] = (await r("readFeedback", [
      id,
      rep.receiver,
      last,
    ])) as [bigint, number, string, string, boolean];
    console.log(
      JSON.stringify({
        index: last.toString(),
        value: value.toString(),
        decimals,
        tag1,
        tag2,
        revoked,
      }),
    );
  }
}

const cmd = process.argv[2];
const run: Record<string, () => Promise<void>> = { deploy, publish, read };
const fn = cmd ? run[cmd] : undefined;
if (!fn) {
  console.error(`usage: reputation <${Object.keys(run).join("|")}>`);
  process.exit(2);
}
fn().catch((e) => {
  console.error("reputation: FAIL:", e instanceof Error ? e.message.split("\n")[0] : e);
  process.exit(1);
});
