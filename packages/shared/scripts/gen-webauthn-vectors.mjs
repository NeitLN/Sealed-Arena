// Generates chain/testvectors/webauthn.json: WebAuthn assertions made with a fixed test
// P-256 key, valid and invalid, for the AgentPolicy precompile tests (Go) and the
// packages/shared tests (TypeScript). The encoders here are written directly against
// viem and node:crypto so they cross-check src/agentPolicy.ts.
// Usage: node packages/shared/scripts/gen-webauthn-vectors.mjs
import { createECDH, createHash, createPrivateKey, sign } from "node:crypto";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { encodeAbiParameters, keccak256, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const OUT = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../chain/testvectors/webauthn.json",
);
const N = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;
const CHAIN_ID = 261126n;

// Test-only keys, public on purpose.
const AGENT_KEY = `0x${"11".repeat(32)}`;
const OTHER_AGENT_KEY = `0x${"12".repeat(32)}`;
const OWNER_D = Buffer.from("22".repeat(32), "hex");
const OTHER_OWNER_D = Buffer.from("33".repeat(32), "hex");

const agent = privateKeyToAccount(AGENT_KEY);
const otherAgent = privateKeyToAccount(OTHER_AGENT_KEY);

function p256Key(d) {
  const ecdh = createECDH("prime256v1");
  ecdh.setPrivateKey(d);
  const pub = ecdh.getPublicKey(); // 0x04 || X || Y
  const x = pub.subarray(1, 33);
  const y = pub.subarray(33, 65);
  const key = createPrivateKey({
    key: {
      kty: "EC",
      crv: "P-256",
      d: d.toString("base64url"),
      x: x.toString("base64url"),
      y: y.toString("base64url"),
    },
    format: "jwk",
  });
  return { key, x: toHex(x), y: toHex(y) };
}
const owner = p256Key(OWNER_D);
const otherOwner = p256Key(OTHER_OWNER_D);

const sha256 = (b) => createHash("sha256").update(b).digest();
const enc = (types, values) =>
  encodeAbiParameters(
    types.map((type) => ({ type })),
    values,
  );
const mandateTuple = {
  type: "tuple",
  components: [
    { name: "payees", type: "address[]" },
    { name: "perTxCap", type: "uint256" },
    { name: "dailyCap", type: "uint256" },
    { name: "expiry", type: "uint64" },
  ],
};

const setMandateChallenge = (chainId, agentAddr, m, nonce) =>
  keccak256(
    enc(
      ["string", "uint256", "address", "bytes32", "uint256"],
      [
        "SealedArena:setMandate",
        chainId,
        agentAddr,
        keccak256(encodeAbiParameters([mandateTuple], [m])),
        nonce,
      ],
    ),
  );
const toggleChallenge = (tag, chainId, agentAddr, nonce) =>
  keccak256(enc(["string", "uint256", "address", "uint256"], [tag, chainId, agentAddr, nonce]));

const RP_ID_HASH = sha256(Buffer.from("localhost"));
const authenticatorData = (flags) =>
  Buffer.concat([RP_ID_HASH, Buffer.from([flags]), Buffer.from([0, 0, 0, 1])]);

function clientData(challengeHex, { type = "webauthn.get", duplicateChallenge = false } = {}) {
  const ch = Buffer.from(challengeHex.slice(2), "hex").toString("base64url");
  const dup = duplicateChallenge ? `,"challenge":"${ch}"` : "";
  return Buffer.from(
    `{"type":"${type}","challenge":"${ch}"${dup},"origin":"http://localhost:3000","crossOrigin":false}`,
    "utf8",
  );
}

// ES256 as an authenticator does it: ECDSA-P256-SHA256 over authData || sha256(clientDataJSON).
function assertion(challengeHex, opts = {}) {
  const { signer = owner, flags = 0x05, highS = false, flipSig = false, ...cd } = opts;
  const ad = authenticatorData(flags);
  const cdj = clientData(challengeHex, cd);
  const sig = sign("sha256", Buffer.concat([ad, sha256(cdj)]), {
    key: signer.key,
    dsaEncoding: "ieee-p1363",
  });
  let r = BigInt(`0x${sig.subarray(0, 32).toString("hex")}`);
  let s = BigInt(`0x${sig.subarray(32).toString("hex")}`);
  if (s > N / 2n) s = N - s; // low-s, as a client library must do
  if (highS) s = N - s;
  if (flipSig) r ^= 1n;
  const rHex = toHex(r, { size: 32 });
  const sHex = toHex(s, { size: 32 });
  const auth = enc(["bytes", "bytes", "bytes32", "bytes32"], [toHex(ad), toHex(cdj), rHex, sHex]);
  return { authenticatorData: toHex(ad), clientDataJSON: toHex(cdj), r: rHex, s: sHex, auth };
}

const payee = "0x2B5AD5c4795c026514f8317c7a215E218DcCD6cF";
const mandate = {
  payees: [payee],
  perTxCap: 10n ** 18n,
  dailyCap: 5n * 10n ** 18n,
  expiry: 4102444800n,
};
const otherMandate = { ...mandate, dailyCap: 6n * 10n ** 18n };

const registerDigest = keccak256(
  enc(
    ["string", "uint256", "address", "bytes32", "bytes32"],
    ["SealedArena:register", CHAIN_ID, agent.address, owner.x, owner.y],
  ),
);
const agentSig = await agent.sign({ hash: registerDigest });
const otherAgentSig = await otherAgent.sign({ hash: registerDigest });

const ch0 = setMandateChallenge(CHAIN_ID, agent.address, mandate, 0n);
const ch1 = toggleChallenge("SealedArena:freeze", CHAIN_ID, agent.address, 1n);
const ch2 = toggleChallenge("SealedArena:unfreeze", CHAIN_ID, agent.address, 2n);

const toJSON = (m) => ({
  payees: m.payees,
  perTxCap: m.perTxCap.toString(),
  dailyCap: m.dailyCap.toString(),
  expiry: m.expiry.toString(),
});

const vectors = {
  note: "Test-only keys, public on purpose. Generated by packages/shared/scripts/gen-webauthn-vectors.mjs.",
  chainId: CHAIN_ID.toString(),
  agent: agent.address,
  otherAgent: otherAgent.address,
  owner: { x: owner.x, y: owner.y },
  otherOwner: { x: otherOwner.x, y: otherOwner.y },
  register: { digest: registerDigest, agentSig, otherAgentSig },
  mandate: toJSON(mandate),
  setMandate: {
    nonce: "0",
    challenge: ch0,
    valid: assertion(ch0),
    invalid: {
      wrongKey: { error: "ErrBadOwnerSignature", ...assertion(ch0, { signer: otherOwner }) },
      wrongChallenge: {
        error: "ErrChallengeMismatch",
        ...assertion(setMandateChallenge(CHAIN_ID, agent.address, otherMandate, 0n)),
      },
      otherChain: {
        error: "ErrChallengeMismatch",
        ...assertion(setMandateChallenge(1n, agent.address, mandate, 0n)),
      },
      otherAgent: {
        error: "ErrChallengeMismatch",
        ...assertion(setMandateChallenge(CHAIN_ID, otherAgent.address, mandate, 0n)),
      },
      typeCreate: { error: "ErrBadClientDataType", ...assertion(ch0, { type: "webauthn.create" }) },
      userNotPresent: { error: "ErrUserNotPresent", ...assertion(ch0, { flags: 0x04 }) },
      highS: { error: "ErrHighS", ...assertion(ch0, { highS: true }) },
      duplicateChallengeKey: {
        error: "ErrBadClientData",
        ...assertion(ch0, { duplicateChallenge: true }),
      },
      corruptSignature: { error: "ErrBadOwnerSignature", ...assertion(ch0, { flipSig: true }) },
    },
  },
  freeze: { nonce: "1", challenge: ch1, valid: assertion(ch1) },
  unfreeze: { nonce: "2", challenge: ch2, valid: assertion(ch2) },
};

writeFileSync(OUT, `${JSON.stringify(vectors, null, 2)}\n`);
console.log(`wrote ${OUT}`);
