// Owner-side actions on the AgentPolicy precompile, for local testing.
// A relayer key sends the transactions; a test P-256 key plays the owner's passkey.
//
// Usage: node packages/shared/scripts/agent-admin.mjs <command> [json]
//   register                      register AGENT_KEY with the owner key
//   set-mandate '{"payees":["0x.."],"perTxCap":"1","dailyCap":"2","expiry":"4102444800"}'
//   freeze | unfreeze
//   show                          print mandate, frozen flag, spend counter and owner nonce
// Environment: RPC_URL, RELAYER_KEY, AGENT_KEY (hex private keys), OWNER_P256_KEY (32-byte hex).
// Test keys only: never use a real passkey or a funded key with this script.
import { createECDH, createHash, createPrivateKey, sign } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  encodeAbiParameters,
  http,
  keccak256,
  toHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const here = dirname(fileURLToPath(import.meta.url));
const abi = JSON.parse(readFileSync(join(here, "../../../chain/abi/IAgentPolicy.json"), "utf8"));
const ADDRESS = "0x0300000000000000000000000000000000000001";
const N = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;

const env = (k) => {
  const v = process.env[k];
  if (!v) throw new Error(`${k} is required`);
  return v;
};
const chain = defineChain({
  id: 261126,
  name: "Sealed (local)",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: [env("RPC_URL")] } },
});
const transport = http(env("RPC_URL"));
const pub = createPublicClient({ chain, transport });
const relayer = createWalletClient({
  chain,
  transport,
  account: privateKeyToAccount(env("RELAYER_KEY")),
});
const agent = privateKeyToAccount(env("AGENT_KEY"));

const d = Buffer.from(env("OWNER_P256_KEY").replace(/^0x/, ""), "hex");
const ecdh = createECDH("prime256v1");
ecdh.setPrivateKey(d);
const pubKey = ecdh.getPublicKey();
const ownerX = toHex(pubKey.subarray(1, 33));
const ownerY = toHex(pubKey.subarray(33, 65));
const ownerKey = createPrivateKey({
  key: {
    kty: "EC",
    crv: "P-256",
    d: d.toString("base64url"),
    x: pubKey.subarray(1, 33).toString("base64url"),
    y: pubKey.subarray(33, 65).toString("base64url"),
  },
  format: "jwk",
});

const enc = (types, values) =>
  encodeAbiParameters(
    types.map((type) => ({ type })),
    values,
  );
const sha256 = (b) => createHash("sha256").update(b).digest();
const mandateTuple = {
  type: "tuple",
  components: [
    { name: "payees", type: "address[]" },
    { name: "perTxCap", type: "uint256" },
    { name: "dailyCap", type: "uint256" },
    { name: "expiry", type: "uint64" },
  ],
};

function webauthn(challenge) {
  const authData = Buffer.concat([
    sha256(Buffer.from("localhost")),
    Buffer.from([0x05, 0, 0, 0, 1]),
  ]);
  const ch = Buffer.from(challenge.slice(2), "hex").toString("base64url");
  const clientData = Buffer.from(
    `{"type":"webauthn.get","challenge":"${ch}","origin":"http://localhost"}`,
  );
  const sig = sign("sha256", Buffer.concat([authData, sha256(clientData)]), {
    key: ownerKey,
    dsaEncoding: "ieee-p1363",
  });
  const r = BigInt(`0x${sig.subarray(0, 32).toString("hex")}`);
  let s = BigInt(`0x${sig.subarray(32).toString("hex")}`);
  if (s > N / 2n) s = N - s;
  return enc(
    ["bytes", "bytes", "bytes32", "bytes32"],
    [toHex(authData), toHex(clientData), toHex(r, { size: 32 }), toHex(s, { size: 32 })],
  );
}

async function send(functionName, args) {
  const hash = await relayer.writeContract({
    address: ADDRESS,
    abi,
    functionName,
    args,
    gas: 1_000_000n,
  });
  const receipt = await pub.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`${functionName} failed in ${hash}`);
  console.log(JSON.stringify({ functionName, hash, block: receipt.blockNumber.toString() }));
}

const read = (functionName) =>
  pub.readContract({ address: ADDRESS, abi, functionName, args: [agent.address] });
const chainId = BigInt(chain.id);
const [command, json] = process.argv.slice(2);

if (command === "register") {
  const digest = keccak256(
    enc(
      ["string", "uint256", "address", "bytes32", "bytes32"],
      ["SealedArena:register", chainId, agent.address, ownerX, ownerY],
    ),
  );
  await send("register", [agent.address, ownerX, ownerY, await agent.sign({ hash: digest })]);
} else if (command === "set-mandate") {
  const m = JSON.parse(json);
  const mandate = {
    payees: m.payees,
    perTxCap: BigInt(m.perTxCap),
    dailyCap: BigInt(m.dailyCap),
    expiry: BigInt(m.expiry),
  };
  const nonce = await read("ownerNonce");
  const challenge = keccak256(
    enc(
      ["string", "uint256", "address", "bytes32", "uint256"],
      [
        "SealedArena:setMandate",
        chainId,
        agent.address,
        keccak256(encodeAbiParameters([mandateTuple], [mandate])),
        nonce,
      ],
    ),
  );
  await send("setMandate", [agent.address, mandate, nonce, webauthn(challenge)]);
} else if (command === "freeze" || command === "unfreeze") {
  const nonce = await read("ownerNonce");
  const challenge = keccak256(
    enc(
      ["string", "uint256", "address", "uint256"],
      [`SealedArena:${command}`, chainId, agent.address, nonce],
    ),
  );
  await send(command, [agent.address, nonce, webauthn(challenge)]);
} else if (command === "show") {
  const [m, frozen] = await read("getMandate");
  const [spentToday, dayIndex, totalCharged] = await read("getSpend");
  console.log(
    JSON.stringify({
      agent: agent.address,
      registered: await read("isAgent"),
      payees: m.payees,
      perTxCap: m.perTxCap.toString(),
      dailyCap: m.dailyCap.toString(),
      expiry: m.expiry.toString(),
      frozen,
      spentToday: spentToday.toString(),
      dayIndex: dayIndex.toString(),
      totalCharged: totalCharged.toString(),
      ownerNonce: (await read("ownerNonce")).toString(),
    }),
  );
} else {
  console.error("usage: agent-admin.mjs register|set-mandate <json>|freeze|unfreeze|show");
  process.exit(2);
}
