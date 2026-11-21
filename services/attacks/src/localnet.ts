// Helpers for scripts that drive the local Sealed L1 (scripts/localnet.sh).
// Test keys only: see packages/shared/src/addresses.local.ts.
import { execFileSync } from "node:child_process";
import { createECDH, createHash, createPrivateKey, sign } from "node:crypto";
import {
  AGENT_POLICY_ADDRESS,
  agentPolicyAbi,
  allowListAbi,
  blockchainIdFromRpc,
  CHAIN_ID,
  cb58ToHex,
  challengeToBase64Url,
  encodeAuth,
  LOCAL_AGENT,
  LOCAL_NODE_URLS,
  LOCAL_OWNER_P256_KEY,
  LOCAL_ROLES,
  type MandateInput,
  normalizeLowS,
  type PolicyIds,
  PRECOMPILES,
  readFreezeEpoch,
  readRuleVersion,
  registerData,
  registerDigestFor,
  setFrozenRequest,
  setMandateRequest,
} from "@sealed-arena/shared";
import {
  type Address,
  type Chain,
  createPublicClient,
  createWalletClient,
  defineChain,
  encodeFunctionData,
  type Hex,
  http,
  type PublicClient,
  toHex,
} from "viem";
import { generatePrivateKey, type PrivateKeyAccount, privateKeyToAccount } from "viem/accounts";

/** RPC path of the Sealed chain, e.g. /ext/bc/<blockchainId>/rpc (changes with every new network). */
export function rpcPath(): string {
  // Given without the leading slash: Git Bash on Windows rewrites env values that look like paths.
  const fromEnv = process.env.SEALED_RPC_PATH;
  if (fromEnv) return fromEnv.startsWith("/") ? fromEnv : `/${fromEnv}`;
  const state = execFileSync("docker", ["exec", "sealed-node", "cat", "/data/sealed.json"], {
    encoding: "utf8",
  });
  return JSON.parse(state).rpcPath as string;
}

export function sealedChain(url: string): Chain {
  return defineChain({
    id: CHAIN_ID,
    name: "Sealed (local)",
    nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
    rpcUrls: { default: { http: [url] } },
  });
}

export type Node = { index: number; url: string; chain: Chain; client: PublicClient };

/**
 * Node base URLs: SEALED_NODE_URLS (comma-separated) to run the same scripts against another
 * network such as the Sealed L1 on Fuji; the three local nodes otherwise.
 */
export function nodeUrls(): readonly string[] {
  const list = process.env.SEALED_NODE_URLS?.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return list?.length ? list : LOCAL_NODE_URLS;
}

/** Public clients for the nodes. */
export function nodes(path = rpcPath()): Node[] {
  return nodeUrls().map((base, index) => {
    const url = `${base}${path}`;
    const chain = sealedChain(url);
    return { index, url, chain, client: createPublicClient({ chain, transport: http(url) }) };
  });
}

/** A role key from the environment (another network), or the public local development key. */
const roleKey = (env: string, local: Hex): Hex => (process.env[env] as Hex | undefined) || local;

export const accounts = {
  admin: privateKeyToAccount(roleKey("SEALED_ADMIN_KEY", LOCAL_ROLES.admin.privateKey)),
  relayer: privateKeyToAccount(roleKey("SEALED_RELAYER_KEY", LOCAL_ROLES.relayer.privateKey)),
  deployer: privateKeyToAccount(roleKey("SEALED_DEPLOYER_KEY", LOCAL_ROLES.deployer.privateKey)),
  agent: privateKeyToAccount(roleKey("SEALED_AGENT_KEY", LOCAL_AGENT.privateKey)),
};

export function wallet(node: Node, account: PrivateKeyAccount) {
  return createWalletClient({ account, chain: node.chain, transport: http(node.url) });
}

/** Sends a transaction from a trusted role and waits for a successful receipt. */
export async function sendAndWait(
  node: Node,
  account: PrivateKeyAccount,
  tx: { to?: Address; value?: bigint; data?: Hex; gas?: bigint },
): Promise<Hex> {
  const hash = await wallet(node, account).sendTransaction({ ...tx, gas: tx.gas ?? 1_000_000n });
  const receipt = await node.client.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`transaction ${hash} failed`);
  return hash;
}

// ---- owner passkey stand-in (P-256 test key) ----------------------------------

// SEALED_OWNER_P256_KEY: a secret owner key for agents others must not control (the open challenge).
const d = Buffer.from(
  ((process.env.SEALED_OWNER_P256_KEY as string | undefined) ?? LOCAL_OWNER_P256_KEY).slice(2),
  "hex",
);
const ecdh = createECDH("prime256v1");
ecdh.setPrivateKey(d);
const pub = ecdh.getPublicKey();
export const OWNER_X: Hex = toHex(pub.subarray(1, 33));
export const OWNER_Y: Hex = toHex(pub.subarray(33, 65));
const ownerKey = createPrivateKey({
  key: {
    kty: "EC",
    crv: "P-256",
    d: d.toString("base64url"),
    x: pub.subarray(1, 33).toString("base64url"),
    y: pub.subarray(33, 65).toString("base64url"),
  },
  format: "jwk",
});

const sha256 = (b: Buffer) => createHash("sha256").update(b).digest();

/**
 * A WebAuthn assertion over `challenge`, as an authenticator with the owner's passkey would make.
 * `flags` is the authenticator flags byte (default UP and UV); `clientData` builds another
 * clientDataJSON from the base64url challenge (tests of the rule v3 parser).
 */
export function ownerProof(
  challenge: Hex,
  o: { flags?: number; clientData?: (b64: string) => string } = {},
): Hex {
  const authenticatorData = Buffer.concat([
    sha256(Buffer.from("localhost")),
    Buffer.from([o.flags ?? 0x05, 0, 0, 0, 1]),
  ]);
  const b64 = challengeToBase64Url(challenge);
  const clientData = Buffer.from(
    o.clientData
      ? o.clientData(b64)
      : `{"type":"webauthn.get","challenge":"${b64}","origin":"http://localhost"}`,
  );
  const sig = sign("sha256", Buffer.concat([authenticatorData, sha256(clientData)]), {
    key: ownerKey,
    dsaEncoding: "ieee-p1363",
  });
  const r = BigInt(`0x${sig.subarray(0, 32).toString("hex")}`);
  const s = normalizeLowS(BigInt(`0x${sig.subarray(32).toString("hex")}`));
  return encodeAuth({
    authenticatorData: toHex(authenticatorData),
    clientDataJSON: toHex(clientData),
    r: toHex(r, { size: 32 }),
    s: toHex(s, { size: 32 }),
  });
}

// ---- reads ---------------------------------------------------------------------

export const readPolicy = {
  isAgent: (n: Node, agent: Address) =>
    n.client.readContract({
      address: AGENT_POLICY_ADDRESS,
      abi: agentPolicyAbi,
      functionName: "isAgent",
      args: [agent],
    }),
  ownerNonce: (n: Node, agent: Address) =>
    n.client.readContract({
      address: AGENT_POLICY_ADDRESS,
      abi: agentPolicyAbi,
      functionName: "ownerNonce",
      args: [agent],
    }),
  mandate: (n: Node, agent: Address) =>
    n.client.readContract({
      address: AGENT_POLICY_ADDRESS,
      abi: agentPolicyAbi,
      functionName: "getMandate",
      args: [agent],
    }),
  spend: (n: Node, agent: Address) =>
    n.client.readContract({
      address: AGENT_POLICY_ADDRESS,
      abi: agentPolicyAbi,
      functionName: "getSpend",
      args: [agent],
    }),
};

export const isTxAllowed = async (n: Node, who: Address) =>
  (await n.client.readContract({
    address: PRECOMPILES.txAllowList,
    abi: allowListAbi,
    functionName: "readAllowList",
    args: [who],
  })) > 0n;

// ---- owner actions, sent by the relayer ------------------------------------------

// Owner proofs are bound to the chain: under rule v2 to the Avalanche network id and the
// blockchain id too (the node's info API and the RPC path give them).
const idsCache = new Map<string, Promise<PolicyIds>>();

async function networkIdOf(n: Node): Promise<number> {
  const base = n.url.slice(0, n.url.indexOf("/ext/"));
  const r = await fetch(`${base}/ext/info`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "info.getNetworkID", params: {} }),
  });
  return Number(((await r.json()) as { result: { networkID: string } }).result.networkID);
}

/** The ids a v2 proof for the chain behind `n` is bound to. */
export function policyIds(n: Node): Promise<PolicyIds> {
  let ids = idsCache.get(n.url);
  if (!ids) {
    const bc = blockchainIdFromRpc(n.url);
    if (!bc) throw new Error(`no blockchain id in ${n.url}`);
    ids = networkIdOf(n).then((networkId) => ({
      chainId: BigInt(CHAIN_ID),
      networkId,
      blockchainId: cb58ToHex(bc),
    }));
    idsCache.set(n.url, ids);
  }
  return ids;
}

/** The agent rule version in force (1 before agentRuleV2Config activates, 2 from then). */
export const ruleVersion = (n: Node) => readRuleVersion(n.client);

export async function registerAgent(n: Node, agent: PrivateKeyAccount): Promise<void> {
  const [v, ids] = await Promise.all([ruleVersion(n), policyIds(n)]);
  const agentSig = await agent.sign({
    hash: registerDigestFor(v, ids, agent.address, OWNER_X, OWNER_Y),
  });
  await sendAndWait(n, accounts.relayer, {
    to: AGENT_POLICY_ADDRESS,
    data: registerData(agent.address, OWNER_X, OWNER_Y, agentSig),
  });
}

/**
 * Sets the agent's mandate with the owner key (setMandate under v1, setMandateV2 under v2, where
 * dailyFeeCap defaults to dailyCap / 20); returns the transaction hash.
 */
export async function setMandate(n: Node, agent: Address, m: MandateInput): Promise<Hex> {
  const [v, ids, nonce] = await Promise.all([
    ruleVersion(n),
    policyIds(n),
    readPolicy.ownerNonce(n, agent),
  ]);
  const req = setMandateRequest(v, ids, agent, m, nonce);
  return sendAndWait(n, accounts.relayer, {
    to: AGENT_POLICY_ADDRESS,
    data: req.data(ownerProof(req.challenge)),
    gas: 2_000_000n, // setMandateV3 costs 1.7M (rule v3)
  });
}

export async function setFrozen(n: Node, agent: Address, frozen: boolean): Promise<void> {
  const [v, ids, ownerNonce] = await Promise.all([
    ruleVersion(n),
    policyIds(n),
    readPolicy.ownerNonce(n, agent),
  ]);
  const freezeEpoch = v >= 2 ? await readFreezeEpoch(n.client, agent) : 0n;
  const req = setFrozenRequest(v, ids, agent, frozen, { ownerNonce, freezeEpoch });
  await sendAndWait(n, accounts.relayer, {
    to: AGENT_POLICY_ADDRESS,
    data: req.data(ownerProof(req.challenge)),
  });
}

export const coin = (n: number | bigint) => BigInt(n) * 10n ** 18n;

/** A fresh agent: allowed to send, funded, registered, with a one-day mandate for `payees`. */
export async function freshAgent(
  n: Node,
  payees: readonly Address[],
  o: { funding?: bigint; perTxCap?: bigint; dailyCap?: bigint; key?: Hex } = {},
): Promise<PrivateKeyAccount> {
  const agent = privateKeyToAccount(o.key ?? generatePrivateKey());
  await sendAndWait(n, accounts.admin, {
    to: PRECOMPILES.txAllowList,
    data: encodeFunctionData({
      abi: allowListAbi,
      functionName: "setEnabled",
      args: [agent.address],
    }),
  });
  await sendAndWait(n, accounts.admin, {
    to: agent.address,
    value: o.funding ?? coin(10),
    gas: 21_000n,
  });
  await registerAgent(n, agent);
  const expiry = BigInt(Math.floor(Date.now() / 1000) + 86_400);
  await setMandate(n, agent.address, {
    payees,
    perTxCap: o.perTxCap ?? coin(1),
    dailyCap: o.dailyCap ?? coin(3),
    expiry,
  });
  return agent;
}
