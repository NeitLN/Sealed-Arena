import type { Address, Hex } from "viem";

/**
 * Local network only (chain/genesis/sealed-local.json, scripts/localnet.sh).
 *
 * Every private key below is a well-known development key and is PUBLIC ON PURPOSE.
 * They hold coins only on the local Sealed L1. Never fund them on any other network.
 */

/** Precompile addresses on the Sealed L1. */
export const PRECOMPILES = {
  contractDeployerAllowList: "0x0200000000000000000000000000000000000000",
  nativeMinter: "0x0200000000000000000000000000000000000001",
  txAllowList: "0x0200000000000000000000000000000000000002",
  warp: "0x0200000000000000000000000000000000000005",
  agentPolicy: "0x0300000000000000000000000000000000000001",
} as const satisfies Record<string, Address>;

type Role = { address: Address; privateKey: Hex };

/** Roles of docs/ARCHITECTURE.md sections 3 and 7, with local development keys. */
export const LOCAL_ROLES = {
  /** Admin of TxAllowList, ContractDeployerAllowList and NativeMinter ("ewoq" key). */
  admin: {
    address: "0x8db97C7cEcE249c2b98bDC0226Cc4C2A57BF52FC",
    privateKey: "0x56289e99c94b6912bfc12adc093c9b51124f0dc54ac7a766b2bc5ccf558d8027",
  },
  /** Allowed to send transactions and deploy contracts. */
  deployer: {
    address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    privateKey: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  },
  /** Sends owner passkey actions (register, setMandate, freeze) on the owner's behalf. */
  relayer: {
    address: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
    privateKey: "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
  },
  /** x402 facilitator: broadcasts agents' signed payments. */
  facilitator: {
    address: "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
    privateKey: "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
  },
  /** ICM relayer. */
  icmRelayer: {
    address: "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65",
    privateKey: "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a",
  },
} as const satisfies Record<string, Role>;

/** The seeded test agent (scripts/localnet.sh seed). Its key is public: it plays a leaked key. */
export const LOCAL_AGENT = {
  address: "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc",
  privateKey: "0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba",
} as const satisfies Role;

/** Test P-256 key standing in for the owner's passkey on the local network. */
export const LOCAL_OWNER_P256_KEY: Hex =
  "0x2222222222222222222222222222222222222222222222222222222222222222";

/** The two payees in the seeded mandate (plain EOAs without code). */
export const LOCAL_PAYEES = [
  "0x976EA74026E726554dB657fA54763abd0C3a0aa9",
  "0x14dC79964da2C08b23698B3D3cc7Ca32193d9955",
] as const satisfies readonly Address[];

/** HTTP base URLs of the three local nodes, as published by infra/local/docker-compose.yml. */
export const LOCAL_NODE_URLS = [
  "http://127.0.0.1:9650",
  "http://127.0.0.1:9652",
  "http://127.0.0.1:9654",
] as const;
