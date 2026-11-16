// Builds chain/genesis/sealed-fuji.json from sealed-local.json for the Sealed L1 on Fuji (T12).
// Reads only role ADDRESSES (never keys) from the environment:
//   FUJI_L1_ADMIN_ADDRESS, FUJI_L1_DEPLOYER_ADDRESS, FUJI_RELAYER_ADDRESS, FUJI_ICM_RELAYER_ADDRESS
// Usage: node chain/genesis/make-fuji.mjs   (loads Sealed-Arena/.env if present)
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
try {
  process.loadEnvFile(resolve(HERE, "../../.env"));
} catch {
  // addresses may come from the environment directly
}

/** TeleporterMessenger (ICM) predeployed at its canonical address, as Builder Hub does. */
export const ICM_MESSENGER = "0x253b2784c75e510dD0fF1da844684a1aC0aa5fcf";
const TELEPORTER_SHA256 = "9ea0787db2333d783a35047d97beafd7541f51ff53484eb917ec40ec99298e25";
/**
 * Warp may not activate before Durango. The local network has every upgrade from genesis, Fuji
 * and Mainnet do not: Durango is 2024-02-13 16:00 UTC on Fuji and 2024-03-06 16:00 UTC on
 * Mainnet (avalanchego upgrade/upgrade.go). Use the later one so the genesis is valid on both.
 */
export const WARP_TIMESTAMP = 1709740800;
const FUJI_DURANGO = 1707840000;
const coin = (n) => `0x${(BigInt(Math.round(n * 1000)) * 10n ** 15n).toString(16)}`;

export function makeFujiGenesis(local, roles, teleporterCode) {
  const sha = createHash("sha256").update(teleporterCode).digest("hex");
  if (sha !== TELEPORTER_SHA256)
    throw new Error(`TeleporterMessenger bytecode sha256 ${sha} is not the pinned one`);
  for (const [k, v] of Object.entries(roles)) {
    if (!/^0x[0-9a-fA-F]{40}$/.test(v ?? "")) throw new Error(`${k} is not an address`);
  }
  const g = structuredClone(local);
  const c = g.config;
  c.txAllowListConfig = {
    blockTimestamp: 0,
    adminAddresses: [roles.admin],
    enabledAddresses: [roles.deployer, roles.relayer, roles.icmRelayer],
  };
  c.contractDeployerAllowListConfig = {
    blockTimestamp: 0,
    adminAddresses: [roles.admin],
    enabledAddresses: [roles.deployer],
  };
  c.contractNativeMinterConfig = { blockTimestamp: 0, adminAddresses: [roles.admin] };
  // The L1's validators do not validate the Primary Network, so messages from the C-Chain must be
  // signed by Primary Network validators (same as Builder Hub's genesis).
  c.warpConfig = {
    ...c.warpConfig,
    blockTimestamp: WARP_TIMESTAMP,
    requirePrimaryNetworkSigners: true,
  };
  if (c.warpConfig.blockTimestamp < FUJI_DURANGO)
    throw new Error("warp would activate before Durango");
  // Small allocation: every genesis coin is unbacked and must be collateralised 1:1 in USDC
  // before the ICTT bridge mints (NativeTokenRemote initialReserveImbalance).
  g.alloc = {
    [roles.admin.slice(2)]: { balance: coin(2) },
    [roles.deployer.slice(2)]: { balance: coin(1) },
    [roles.relayer.slice(2)]: { balance: coin(0.5) },
    [roles.icmRelayer.slice(2)]: { balance: coin(0.5) },
    [ICM_MESSENGER.slice(2).toLowerCase()]: {
      balance: "0x0",
      code: teleporterCode,
      nonce: "0x1",
      storage: {
        "0x0000000000000000000000000000000000000000000000000000000000000000":
          "0x0000000000000000000000000000000000000000000000000000000000000001",
        "0x0000000000000000000000000000000000000000000000000000000000000001":
          "0x0000000000000000000000000000000000000000000000000000000000000001",
      },
    },
  };
  return g;
}

/** Native coins created in genesis (they need the same amount of USDC as bridge collateral). */
export function genesisSupply(g) {
  return Object.values(g.alloc).reduce((s, a) => s + BigInt(a.balance), 0n);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const local = JSON.parse(readFileSync(resolve(HERE, "sealed-local.json"), "utf8"));
  const code = readFileSync(
    resolve(HERE, "vendor/TeleporterMessenger.deployed.hex"),
    "utf8",
  ).trim();
  const g = makeFujiGenesis(
    local,
    {
      admin: process.env.FUJI_L1_ADMIN_ADDRESS,
      deployer: process.env.FUJI_L1_DEPLOYER_ADDRESS,
      relayer: process.env.FUJI_RELAYER_ADDRESS,
      icmRelayer: process.env.FUJI_ICM_RELAYER_ADDRESS,
    },
    code,
  );
  const out = resolve(HERE, "sealed-fuji.json");
  writeFileSync(out, `${JSON.stringify(g, null, 2)}\n`);
  const bytes = Buffer.byteLength(JSON.stringify(g));
  console.log(`wrote ${out}: ${bytes} bytes, genesis supply ${genesisSupply(g)} wei`);
}
