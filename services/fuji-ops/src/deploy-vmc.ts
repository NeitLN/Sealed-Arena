// Deploys the PoA ValidatorManager for the Sealed L1 on the Fuji C-Chain and initializes it at once
// (initialize() can be called by anyone until it has been called, so it runs in the same session).
//   pnpm --filter fuji-ops deploy-vmc <subnetID in CB58>
// Key: FUJI_DEPLOYER_PRIVATE_KEY from Sealed-Arena/.env (testnet only). Writes deployments/fuji.json.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, createWalletClient, type Hex, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { avalancheFuji } from "viem/chains";
import { cb58ToHex, linkLibrary } from "./ids.js";

const HERE = dirname(fileURLToPath(import.meta.url));
process.loadEnvFile(resolve(HERE, "../../../.env"));

type Artifact = {
  abi: readonly unknown[];
  bytecode: Hex;
  linkReferences: Record<string, Record<string, Array<{ start: number; length: number }>>>;
};
const load = (n: string) =>
  JSON.parse(readFileSync(resolve(HERE, `../vendor/${n}.json`), "utf8")) as Artifact;

async function main() {
  const subnetCb58 = process.argv[2];
  if (!subnetCb58) throw new Error("usage: deploy-vmc <subnetID>");
  const subnetID = cb58ToHex(subnetCb58);
  const key = process.env.FUJI_DEPLOYER_PRIVATE_KEY as Hex | undefined;
  if (!key) throw new Error("FUJI_DEPLOYER_PRIVATE_KEY is not set");
  const account = privateKeyToAccount(key);
  const pub = createPublicClient({ chain: avalancheFuji, transport: http() });
  const wallet = createWalletClient({ account, chain: avalancheFuji, transport: http() });
  const before = await pub.getBalance({ address: account.address });

  const deploy = async (
    name: string,
    abi: readonly unknown[],
    bytecode: Hex,
    args: unknown[] = [],
  ) => {
    const hash = await wallet.deployContract({ abi: abi as never, bytecode, args: args as never });
    const r = await pub.waitForTransactionReceipt({ hash });
    if (r.status !== "success" || !r.contractAddress)
      throw new Error(`${name} deploy failed (${hash})`);
    console.log(`${name}: ${r.contractAddress} (tx ${hash})`);
    return r.contractAddress;
  };

  const messages = load("ValidatorMessages");
  const manager = load("ValidatorManager");
  const lib = await deploy("ValidatorMessages", messages.abi, messages.bytecode);
  // ICMInitializable.Allowed = 0 (icm-services contracts/utilities/ICMInitializable.sol)
  const vmc = await deploy(
    "ValidatorManager",
    manager.abi,
    linkLibrary(manager.bytecode, manager.linkReferences, lib),
    [0],
  );

  const settings = {
    admin: account.address,
    subnetID,
    churnPeriodSeconds: 0n,
    maximumChurnPercentage: 20,
  };
  const initHash = await wallet.writeContract({
    address: vmc,
    abi: manager.abi as never,
    functionName: "initialize" as never,
    args: [settings] as never,
  });
  const ir = await pub.waitForTransactionReceipt({ hash: initHash });
  if (ir.status !== "success") throw new Error(`initialize failed (${initHash})`);
  console.log(`initialize: admin ${account.address}, subnetID ${subnetID} (tx ${initHash})`);

  const spent = before - (await pub.getBalance({ address: account.address }));
  const out = resolve(HERE, "../deployments/fuji.json");
  mkdirSync(dirname(out), { recursive: true });
  let prev: Record<string, unknown> = {};
  try {
    prev = JSON.parse(readFileSync(out, "utf8"));
  } catch {
    // first write
  }
  writeFileSync(
    out,
    `${JSON.stringify({ ...prev, subnetID: subnetCb58, subnetIDHex: subnetID, validatorMessages: lib, validatorManager: vmc, vmcAdmin: account.address, vmcInitTx: initHash }, null, 2)}\n`,
  );
  console.log(`spent ${Number(spent) / 1e18} AVAX on C-Chain; wrote ${out}`);
}

main().catch((e) => {
  console.error("deploy-vmc: FAIL:", e instanceof Error ? e.message : e);
  process.exit(1);
});
