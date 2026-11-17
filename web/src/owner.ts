import {
  AGENT_POLICY_ADDRESS,
  agentPolicyAbi,
  assertionToAuth,
  CHAIN_ID,
  type Mandate,
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

/** Where the relayer runs. Its /info tells the RPC URL. */
export const RELAYER_URL: string = import.meta.env.VITE_RELAYER_URL ?? "http://127.0.0.1:4040";

export type RelayerInfo = { relayer: Address; chainId: number; target: Address; rpc: string };

export async function relayerInfo(): Promise<RelayerInfo> {
  const res = await fetch(`${RELAYER_URL}/info`);
  if (!res.ok) throw new Error("relayer_down");
  return (await res.json()) as RelayerInfo;
}

/**
 * `live`: for pages that poll. Calls made together go in one batch request (at most 20, the
 * gateway's batch limit), and a failed request is not retried (a rate-limited page waits for its
 * next poll instead of sending more).
 */
export function chainClient(rpc: string, o: { live?: boolean } = {}): PublicClient {
  const chain = defineChain({
    id: CHAIN_ID,
    name: "Sealed",
    nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
    rpcUrls: { default: { http: [rpc] } },
  });
  const transport = o.live ? http(rpc, { batch: { batchSize: 20 }, retryCount: 0 }) : http(rpc);
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
};

export async function readAgent(c: PublicClient, agent: Address): Promise<AgentView> {
  const read = (functionName: string) =>
    c.readContract({
      address: AGENT_POLICY_ADDRESS,
      abi: agentPolicyAbi,
      functionName,
      args: [agent],
    } as never);
  const [registered, key, nonce, mf, spend, balance] = await Promise.all([
    read("isAgent") as Promise<boolean>,
    read("ownerKey") as Promise<readonly [Hex, Hex]>,
    read("ownerNonce") as Promise<bigint>,
    read("getMandate") as Promise<readonly [Mandate, boolean]>,
    read("getSpend") as Promise<readonly [bigint, bigint, bigint]>,
    c.getBalance({ address: agent }),
  ]);
  return {
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

/** Lower-case addresses among `list` that have code on chain. */
export async function withCode(c: PublicClient, list: Address[]): Promise<Set<string>> {
  const codes = await Promise.all(
    list.map((a) => c.getCode({ address: a }).catch(() => undefined)),
  );
  return new Set(list.filter((_, i) => codes[i] && codes[i] !== "0x").map((a) => a.toLowerCase()));
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
