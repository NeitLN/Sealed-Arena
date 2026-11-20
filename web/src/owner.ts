import {
  AGENT_POLICY_ADDRESS,
  agentPolicyAbi,
  assertionToAuth,
  CHAIN_ID,
  type Mandate,
  type RuleVersion,
  readRuleVersion,
  registerDigestFor,
  spkiToXY,
} from "@sealed-arena/shared";
import {
  type Address,
  bytesToHex,
  createPublicClient,
  defineChain,
  type Hex,
  hexToBytes,
  http,
  type PublicClient,
} from "viem";

import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

/** Where the relayer runs. Its /info tells the RPC URL. */
export const RELAYER_URL: string = import.meta.env.VITE_RELAYER_URL ?? "http://127.0.0.1:4040";

export type RelayerInfo = {
  relayer: Address;
  chainId: number;
  target: Address;
  rpc: string;
  /** Ids a v2 owner proof is bound to (relayers from rule v2 on). */
  ruleVersion?: RuleVersion;
  networkId?: number;
  blockchainId?: Hex;
};

export async function relayerInfo(): Promise<RelayerInfo> {
  const res = await fetch(`${RELAYER_URL}/info`);
  if (!res.ok) throw new Error("relayer_down");
  return (await res.json()) as RelayerInfo;
}

/** Generate and sign locally. Only `request` is sent; `privateKey` stays in this browser. */
export async function prepareDemoClaim(passkey: Passkey, info: RelayerInfo) {
  if (info.chainId !== CHAIN_ID) throw new Error("chain_mismatch");
  if ((info.ruleVersion !== 1 && info.ruleVersion !== 2) || !info.networkId || !info.blockchainId)
    throw new Error("demoFailed");
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  const agentSig = await account.sign({
    hash: registerDigestFor(
      info.ruleVersion,
      {
        chainId: BigInt(info.chainId),
        networkId: info.networkId,
        blockchainId: info.blockchainId,
      },
      account.address,
      passkey.x,
      passkey.y,
    ),
  });
  return {
    privateKey,
    request: { agent: account.address, ownerX: passkey.x, ownerY: passkey.y, agentSig },
  };
}

/**
 * `live`: for pages that poll. Calls made together go in one batch request (at most 20, the
 * gateway's batch limit), and a failed request is not retried (a rate-limited page waits for its
 * next poll instead of sending more).
 */
export function chainClient(
  rpc: string,
  o: {
    live?: boolean /** X-Sealed-Source label for the gateway's attempt log. */;
    source?: string;
  } = {},
): PublicClient {
  const chain = defineChain({
    id: CHAIN_ID,
    name: "Sealed",
    nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
    rpcUrls: { default: { http: [rpc] } },
  });
  const fetchOptions = o.source ? { headers: { "x-sealed-source": o.source } } : undefined;
  const transport = o.live
    ? http(rpc, {
        batch: { batchSize: 20 },
        retryCount: 0,
        ...(fetchOptions ? { fetchOptions } : {}),
      })
    : http(rpc, fetchOptions ? { fetchOptions } : {});
  return createPublicClient({ chain, transport }) as PublicClient;
}

export const isLocalRpc = (rpc: string) =>
  /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(rpc);

// ---- passkey ------------------------------------------------------------------------

export type Passkey = { credentialId: string; x: Hex; y: Hex };

const b64url = (b: Uint8Array) =>
  btoa(String.fromCharCode(...b))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
const fromB64url = (s: string) =>
  Uint8Array.from(atob(s.replaceAll("-", "+").replaceAll("_", "/")), (c) => c.charCodeAt(0));

/** Creates a P-256 (ES256) passkey for this site and returns its public key. */
export async function createPasskey(): Promise<Passkey> {
  if (!window.PublicKeyCredential) throw new Error("passkey_unsupported");
  const cred = (await navigator.credentials.create({
    publicKey: {
      rp: { name: "Sealed Arena", id: location.hostname },
      user: {
        id: crypto.getRandomValues(new Uint8Array(16)),
        name: `owner-${new Date().toISOString().slice(0, 10)}`,
        displayName: "Sealed Arena owner",
      },
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      pubKeyCredParams: [{ type: "public-key", alg: -7 }],
      authenticatorSelection: { residentKey: "preferred", userVerification: "preferred" },
      timeout: 120_000,
    },
  })) as PublicKeyCredential | null;
  if (!cred) throw new Error("passkey_unsupported");
  const res = cred.response as AuthenticatorAttestationResponse;
  const spki = res.getPublicKey?.();
  if (!spki) throw new Error("passkey_unsupported");
  return { credentialId: b64url(new Uint8Array(cred.rawId)), ...spkiToXY(new Uint8Array(spki)) };
}

/** Signs a 32-byte challenge with the passkey and returns the `auth` bytes the precompile checks. */
export async function signWithPasskey(challenge: Hex, credentialId: string): Promise<Hex> {
  const cred = (await navigator.credentials.get({
    publicKey: {
      challenge: new Uint8Array(hexToBytes(challenge)),
      rpId: location.hostname,
      allowCredentials: [{ type: "public-key", id: fromB64url(credentialId) }],
      userVerification: "preferred",
      timeout: 120_000,
    },
  })) as PublicKeyCredential | null;
  if (!cred) throw new Error("passkey_cancelled");
  const r = cred.response as AuthenticatorAssertionResponse;
  return assertionToAuth({
    authenticatorData: new Uint8Array(r.authenticatorData),
    clientDataJSON: new Uint8Array(r.clientDataJSON),
    signature: new Uint8Array(r.signature),
  });
}

// ---- saved state (this browser only) ---------------------------------------------------

const SAVED = "sealed.owner.v1";
export type Saved = { passkey?: Passkey; agent?: string };

export function loadSaved(): Saved {
  try {
    return JSON.parse(localStorage.getItem(SAVED) ?? "{}") as Saved;
  } catch {
    return {};
  }
}

export function save(s: Saved): void {
  try {
    localStorage.setItem(SAVED, JSON.stringify(s));
  } catch {
    // not saved: the page still works for this visit
  }
}

// ---- chain reads --------------------------------------------------------------------

export type AgentView = {
  registered: boolean;
  ownerX: Hex;
  ownerY: Hex;
  nonce: bigint;
  mandate: Mandate;
  frozen: boolean;
  spentToday: bigint;
  totalCharged: bigint;
  balance: bigint;
  /** Agent rule version in force; the fields below are read only under v2 (zero/false before). */
  version: RuleVersion;
  freezeEpoch: bigint;
  /** Whether the mandate has a daily fee cap (set with setMandateV2). */
  feeCapSet: boolean;
  dailyFeeCap: bigint;
  feeSpentToday: bigint;
};

export async function readAgent(c: PublicClient, agent: Address): Promise<AgentView> {
  const read = (functionName: string) =>
    c.readContract({
      address: AGENT_POLICY_ADDRESS,
      abi: agentPolicyAbi,
      functionName,
      args: [agent],
    } as never);
  const [registered, key, nonce, mf, spend, balance, version] = await Promise.all([
    read("isAgent") as Promise<boolean>,
    read("ownerKey") as Promise<readonly [Hex, Hex]>,
    read("ownerNonce") as Promise<bigint>,
    read("getMandate") as Promise<readonly [Mandate, boolean]>,
    read("getSpend") as Promise<readonly [bigint, bigint, bigint]>,
    c.getBalance({ address: agent }),
    readRuleVersion(c),
  ]);
  let v2 = { freezeEpoch: 0n, feeCapSet: false, dailyFeeCap: 0n, feeSpentToday: 0n };
  if (version === 2) {
    const [epoch, m2, fee] = await Promise.all([
      read("freezeEpoch") as Promise<bigint>,
      read("getMandateV2") as Promise<readonly [{ dailyFeeCap: bigint }, boolean, boolean]>,
      read("getFeeSpend") as Promise<readonly [bigint, bigint]>,
    ]);
    v2 = {
      freezeEpoch: epoch,
      feeCapSet: m2[1],
      dailyFeeCap: m2[0].dailyFeeCap,
      feeSpentToday: fee[0],
    };
  }
  return {
    version,
    ...v2,
    registered,
    ownerX: key[0],
    ownerY: key[1],
    nonce,
    mandate: mf[0],
    frozen: mf[1],
    spentToday: spend[0],
    totalCharged: spend[2],
    balance,
  };
}

/**
 * Lower-case addresses among `list` that have code on chain, and the addresses that could not be
 * checked (the read failed): those are reported, not treated as having no code.
 */
export async function withCode(
  c: PublicClient,
  list: Address[],
): Promise<{ withCode: Set<string>; unchecked: Address[] }> {
  const codes = await Promise.all(
    list.map((a) =>
      c.getCode({ address: a }).then(
        (code) => ({ ok: true as const, code }),
        () => ({ ok: false as const }),
      ),
    ),
  );
  return {
    withCode: new Set(
      list
        .filter((_, i) => {
          const r = codes[i];
          return r?.ok && r.code && r.code !== "0x";
        })
        .map((a) => a.toLowerCase()),
    ),
    unchecked: list.filter((_, i) => !codes[i]?.ok),
  };
}

// ---- relayer ------------------------------------------------------------------------

export type RelayResult =
  | { ok: true; function: string; transaction: Hex }
  | { ok: false; error: string; reason?: string; transaction?: Hex };

export async function relay(data: Hex): Promise<RelayResult> {
  try {
    const res = await fetch(`${RELAYER_URL}/relay`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ data }),
    });
    return (await res.json()) as RelayResult;
  } catch {
    return { ok: false, error: "relayer_down" };
  }
}

export { bytesToHex };
