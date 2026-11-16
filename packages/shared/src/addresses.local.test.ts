import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";
import { LOCAL_AGENT, LOCAL_ROLES, PRECOMPILES } from "./addresses.local.js";
import { AGENT_POLICY_ADDRESS } from "./agentPolicy.js";
import { allowListAbi } from "./allowListAbi.js";
import { nativeMinterAbi } from "./nativeMinterAbi.js";

const repoFile = (p: string) => fileURLToPath(new URL(`../../../${p}`, import.meta.url));
const genesis = JSON.parse(readFileSync(repoFile("chain/genesis/sealed-local.json"), "utf8"));
const lower = (xs: string[]) => xs.map((x) => x.toLowerCase());

describe("local roles", () => {
  it("each private key controls its address", () => {
    for (const role of [...Object.values(LOCAL_ROLES), LOCAL_AGENT]) {
      expect(privateKeyToAccount(role.privateKey).address).toBe(role.address);
    }
  });

  it("match the allow-lists in the local genesis", () => {
    const {
      txAllowListConfig: tx,
      contractDeployerAllowListConfig: dep,
      contractNativeMinterConfig: mint,
    } = genesis.config;
    expect(lower(tx.adminAddresses)).toEqual(lower([LOCAL_ROLES.admin.address]));
    expect(lower(tx.enabledAddresses).sort()).toEqual(
      lower([
        LOCAL_ROLES.deployer.address,
        LOCAL_ROLES.relayer.address,
        LOCAL_ROLES.facilitator.address,
        LOCAL_ROLES.icmRelayer.address,
      ]).sort(),
    );
    expect(lower(dep.adminAddresses)).toEqual(lower([LOCAL_ROLES.admin.address]));
    expect(lower(dep.enabledAddresses)).toEqual(lower([LOCAL_ROLES.deployer.address]));
    expect(lower(mint.adminAddresses)).toEqual(lower([LOCAL_ROLES.admin.address]));
  });

  it("never lets the agent deploy, mint or manage allow-lists", () => {
    const listed = JSON.stringify(genesis.config).toLowerCase();
    expect(listed).not.toContain(LOCAL_AGENT.address.slice(2).toLowerCase());
  });

  it("uses the shared chain id and AgentPolicy address", () => {
    expect(genesis.config.chainId).toBe(261126);
    expect(genesis.config.agentPolicyConfig).toEqual({ blockTimestamp: 0 });
    expect(PRECOMPILES.agentPolicy).toBe(AGENT_POLICY_ADDRESS);
  });
});

describe("precompile ABIs", () => {
  it("match chain/abi", () => {
    expect(allowListAbi).toEqual(
      JSON.parse(readFileSync(repoFile("chain/abi/IAllowList.json"), "utf8")),
    );
    expect(nativeMinterAbi).toEqual(
      JSON.parse(readFileSync(repoFile("chain/abi/INativeMinter.json"), "utf8")),
    );
  });
});
