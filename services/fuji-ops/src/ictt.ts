// USDC (Fuji C-Chain) → native coin of the Sealed L1, with ICTT (docs: Builder Hub academy,
// native-token-bridge/01-erc20-to-native). Phases, each recorded in deployments/fuji.json:
//   pnpm --filter fuji-ops ictt contracts            TeleporterRegistry (L1), ERC20TokenHome (C), NativeTokenRemote (L1), NativeMinter permission
//   pnpm --filter fuji-ops ictt relayer-config       prints the ICM relayer config (keys read from .env; write it on the VM only)
//   pnpm --filter fuji-ops ictt register             NativeTokenRemote.registerWithHome (needs the relayer)
//   pnpm --filter fuji-ops ictt collateral           USDC collateral = genesis supply (initialReserveImbalance)
//   pnpm --filter fuji-ops ictt send <usdc> <to>     bridge USDC to an address on the L1
//   pnpm --filter fuji-ops ictt status
// L1 RPC: FUJI_L1_RPC (default: SSH tunnel http://127.0.0.1:19650). Keys from Sealed-Arena/.env (testnet only).
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { allowListAbi, PRECOMPILES } from "@sealed-arena/shared";
import {
  type Address,
  createPublicClient,
  createWalletClient,
  defineChain,
  erc20Abi,
  type Hex,
  http,
  parseUnits,
  zeroAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { avalancheFuji } from "viem/chains";
import { cb58ToHex } from "./ids.js";

const HERE = dirname(fileURLToPath(import.meta.url));
process.loadEnvFile(resolve(HERE, "../../../.env"));
const DEPLOYMENTS = resolve(HERE, "../deployments/fuji.json");

/** Fuji constants, each checked on chain on 17/11 (see the T12 hand-off). */
export const FUJI = {
  usdc: "0x5425890298aed601595a70AB815c96711a31Bc65" as Address,
  usdcDecimals: 6,
  cChainRegistry: "0xF86Cb19Ad8405AEFa7d09C778215D2Cb6eBfB228" as Address,
  teleporterMessenger: "0x253b2784c75e510dD0fF1da844684a1aC0aa5fcf" as Address,
  cChainID: "yH8D7ThNJkxmtkuv2jgBa4P1Rn3Qpr4pPr7QYNfcdoS6k6HWp",
  primarySubnetID: "11111111111111111111111111111111LpoYY",
};

type Artifact = { abi: readonly unknown[]; bytecode: Hex };
const art = (n: string) =>
  JSON.parse(readFileSync(resolve(HERE, `../vendor/${n}.json`), "utf8")) as Artifact;
const env = (k: string) => {
  const v = process.env[k];
  if (!v) throw new Error(`${k} is not set`);
  return v;
};

const d = JSON.parse(readFileSync(DEPLOYMENTS, "utf8")) as Record<string, unknown> & {
  subnetID: string;
  blockchainID: string;
  ictt?: Record<string, string>;
};
const save = () => writeFileSync(DEPLOYMENTS, `${JSON.stringify(d, null, 2)}\n`);
d.ictt ??= {};
const ictt = d.ictt;

const l1Rpc = process.env.FUJI_L1_RPC ?? `http://127.0.0.1:19650/ext/bc/${d.blockchainID}/rpc`;
const l1 = defineChain({
  id: 261126,
  name: "Sealed (Fuji)",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: [l1Rpc] } },
});
const cPub = createPublicClient({ chain: avalancheFuji, transport: http() });
const lPub = createPublicClient({ chain: l1, transport: http(l1Rpc) });
const cOwner = privateKeyToAccount(env("FUJI_DEPLOYER_PRIVATE_KEY") as Hex);
const lDeployer = privateKeyToAccount(env("FUJI_L1_DEPLOYER_PRIVATE_KEY") as Hex);
const lAdmin = privateKeyToAccount(env("FUJI_L1_ADMIN_PRIVATE_KEY") as Hex);
const cWallet = createWalletClient({ account: cOwner, chain: avalancheFuji, transport: http() });
const lWallet = (a: typeof lAdmin) =>
  createWalletClient({ account: a, chain: l1, transport: http(l1Rpc) });

async function deploy(on: "C" | "L1", name: string, args: unknown[]): Promise<Address> {
  const a = art(name);
  const w = on === "C" ? cWallet : lWallet(lDeployer);
  const pub = on === "C" ? cPub : lPub;
  const hash = await w.deployContract({
    abi: a.abi as never,
    bytecode: a.bytecode,
    args: args as never,
  });
  const r = await pub.waitForTransactionReceipt({ hash });
  if (r.status !== "success" || !r.contractAddress)
    throw new Error(`${name} deploy failed (${hash})`);
  console.log(`${name} on ${on}: ${r.contractAddress} (tx ${hash})`);
  return r.contractAddress;
}

async function call(
  on: "C" | "L1",
  who: "owner" | "deployer" | "admin",
  address: Address,
  abi: readonly unknown[],
  fn: string,
  args: unknown[],
) {
  const w = on === "C" ? cWallet : lWallet(who === "admin" ? lAdmin : lDeployer);
  const pub = on === "C" ? cPub : lPub;
  const hash = await w.writeContract({
    address,
    abi: abi as never,
    functionName: fn as never,
    args: args as never,
  });
  const r = await pub.waitForTransactionReceipt({ hash });
  if (r.status !== "success") throw new Error(`${fn} failed (${hash})`);
  console.log(`${fn} on ${on}: tx ${hash}`);
  return hash;
}

async function genesisSupply(): Promise<bigint> {
  const g = JSON.parse(
    readFileSync(resolve(HERE, "../../../chain/genesis/sealed-fuji.json"), "utf8"),
  ) as {
    alloc: Record<string, { balance: string }>;
  };
  return Object.values(g.alloc).reduce((s, a) => s + BigInt(a.balance), 0n);
}

async function contracts() {
  if (!ictt.l1Registry) {
    ictt.l1Registry = await deploy("L1", "TeleporterRegistry", [
      [{ version: 1n, protocolAddress: FUJI.teleporterMessenger }],
    ]);
    save();
  }
  if (!ictt.home) {
    ictt.home = await deploy("C", "ERC20TokenHome", [
      FUJI.cChainRegistry,
      cOwner.address,
      1n,
      FUJI.usdc,
      FUJI.usdcDecimals,
    ]);
    save();
  }
  if (!ictt.remote) {
    const imbalance = await genesisSupply();
    ictt.initialReserveImbalance = imbalance.toString();
    ictt.remote = await deploy("L1", "NativeTokenRemote", [
      {
        teleporterRegistryAddress: ictt.l1Registry,
        teleporterManager: lDeployer.address,
        minTeleporterVersion: 1n,
        tokenHomeBlockchainID: cb58ToHex(FUJI.cChainID),
        tokenHomeAddress: ictt.home,
        tokenHomeDecimals: FUJI.usdcDecimals,
      },
      "USDC",
      imbalance,
      0n,
    ]);
    save();
  }
  if (!ictt.minterEnabledTx) {
    ictt.minterEnabledTx = await call(
      "L1",
      "admin",
      PRECOMPILES.nativeMinter as Address,
      allowListAbi,
      "setEnabled",
      [ictt.remote],
    );
    save();
  }
}

function relayerConfig() {
  const l1Base = "http://127.0.0.1:9650";
  const cfg = {
    "log-level": "info",
    "info-api": { "base-url": "https://api.avax-test.network" },
    "p-chain-api": { "base-url": "https://api.avax-test.network" },
    "storage-location": "/data",
    "source-blockchains": [
      {
        "subnet-id": FUJI.primarySubnetID,
        "blockchain-id": FUJI.cChainID,
        "rpc-endpoint": { "base-url": "https://api.avax-test.network/ext/bc/C/rpc" },
        "ws-endpoint": { "base-url": "wss://api.avax-test.network/ext/bc/C/ws" },
        "message-contracts": {
          [FUJI.teleporterMessenger]: {
            "message-format": "teleporter",
            settings: { "reward-address": env("FUJI_ICM_RELAYER_ADDRESS") },
          },
        },
        "supported-destinations": [{ "blockchain-id": d.blockchainID }],
      },
      {
        "subnet-id": d.subnetID,
        "blockchain-id": d.blockchainID,
        "rpc-endpoint": { "base-url": `${l1Base}/ext/bc/${d.blockchainID}/rpc` },
        "ws-endpoint": { "base-url": `ws://127.0.0.1:9650/ext/bc/${d.blockchainID}/ws` },
        "message-contracts": {
          [FUJI.teleporterMessenger]: {
            "message-format": "teleporter",
            settings: { "reward-address": env("FUJI_ICM_RELAYER_ADDRESS") },
          },
        },
        "supported-destinations": [{ "blockchain-id": FUJI.cChainID }],
      },
    ],
    "destination-blockchains": [
      {
        "subnet-id": FUJI.primarySubnetID,
        "blockchain-id": FUJI.cChainID,
        "rpc-endpoint": { "base-url": "https://api.avax-test.network/ext/bc/C/rpc" },
        "account-private-key": env("FUJI_ICM_RELAYER_PRIVATE_KEY"),
      },
      {
        "subnet-id": d.subnetID,
        "blockchain-id": d.blockchainID,
        "rpc-endpoint": { "base-url": `${l1Base}/ext/bc/${d.blockchainID}/rpc` },
        "account-private-key": env("FUJI_ICM_RELAYER_PRIVATE_KEY"),
      },
    ],
  };
  process.stdout.write(`${JSON.stringify(cfg, null, 2)}\n`);
}

async function register() {
  if (!ictt.remote) throw new Error("run contracts first");
  ictt.registerTx = await call(
    "L1",
    "deployer",
    ictt.remote as Address,
    art("NativeTokenRemote").abi,
    "registerWithHome",
    [{ feeTokenAddress: zeroAddress, amount: 0n }],
  );
  save();
}

async function collateral() {
  if (!ictt.home || !ictt.remote) throw new Error("run contracts first");
  const amount =
    BigInt(ictt.initialReserveImbalance ?? "0") / 10n ** BigInt(18 - FUJI.usdcDecimals);
  await call("C", "owner", FUJI.usdc, erc20Abi, "approve", [ictt.home, amount]);
  ictt.collateralTx = await call(
    "C",
    "owner",
    ictt.home as Address,
    art("ERC20TokenHome").abi,
    "addCollateral",
    [cb58ToHex(d.blockchainID), ictt.remote, amount],
  );
  save();
}

async function send(usdc: string, to: Address) {
  if (!ictt.home || !ictt.remote) throw new Error("run contracts first");
  const amount = parseUnits(usdc, FUJI.usdcDecimals);
  await call("C", "owner", FUJI.usdc, erc20Abi, "approve", [ictt.home, amount]);
  await call("C", "owner", ictt.home as Address, art("ERC20TokenHome").abi, "send", [
    {
      destinationBlockchainID: cb58ToHex(d.blockchainID),
      destinationTokenTransferrerAddress: ictt.remote,
      recipient: to,
      primaryFeeTokenAddress: FUJI.usdc,
      primaryFee: 0n,
      secondaryFee: 0n,
      requiredGasLimit: 250_000n,
      multiHopFallback: zeroAddress,
    },
    amount,
  ]);
}

async function status() {
  const remote = ictt.remote as Address | undefined;
  const rows: Record<string, string> = {
    "project USDC (C)": `${Number(await cPub.readContract({ address: FUJI.usdc, abi: erc20Abi, functionName: "balanceOf", args: [cOwner.address] })) / 1e6}`,
    "L1 block": (await lPub.getBlockNumber()).toString(),
    "L1 admin coins": `${Number(await lPub.getBalance({ address: lAdmin.address })) / 1e18}`,
  };
  if (remote) {
    const abi = art("NativeTokenRemote").abi;
    const r = (fn: string) =>
      lPub.readContract({
        address: remote,
        abi: abi as never,
        functionName: fn as never,
      }) as Promise<unknown>;
    rows["remote isCollateralized"] = String(await r("getIsCollateralized"));
    rows["remote totalMinted"] = String(await r("getTotalMinted"));
    rows["remote totalNativeAssetSupply"] = String(await r("totalNativeAssetSupply"));
  }
  console.table(rows);
}

const [cmd, a1, a2] = process.argv.slice(2);
const run: Record<string, () => Promise<void> | void> = {
  contracts,
  "relayer-config": relayerConfig,
  register,
  collateral,
  send: () => send(a1 ?? "", a2 as Address),
  status,
};
const fn = cmd ? run[cmd] : undefined;
if (!fn) {
  console.error(`usage: ictt <${Object.keys(run).join("|")}>`);
  process.exit(2);
}
Promise.resolve(fn()).catch((e) => {
  console.error("ictt: FAIL:", e instanceof Error ? e.message.split("\n")[0] : e);
  process.exit(1);
});
