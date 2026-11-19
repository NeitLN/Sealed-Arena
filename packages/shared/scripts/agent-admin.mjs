// Owner-side actions on the AgentPolicy precompile, for local testing.
// A relayer key sends the transactions; a test P-256 key plays the owner's passkey.
//
// Usage: node packages/shared/scripts/agent-admin.mjs <command> [json]
//   register                      register AGENT_KEY with the owner key
//   set-mandate '{"payees":["0x.."],"perTxCap":"1","dailyCap":"2","expiry":"4102444800"}'
//                                 (under agent rule v2 also "dailyFeeCap", default dailyCap)
//   freeze | unfreeze
// Proofs follow the rule version in force: v1 (bound to the EVM chain id) before agentRuleV2Config
// activates, v2 (bound to the network id from the node's info API and the blockchain id in
// RPC_URL) from then on.
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
const mandateV2Tuple = {
  type: "tuple",
  components: [
    { name: "payees", type: "address[]" },
    { name: "perTxCap", type: "uint256" },
    { name: "dailyCap", type: "uint256" },
    { name: "dailyFeeCap", type: "uint256" },
    { name: "expiry", type: "uint64" },
  ],
};

// ---- rule version and the v2 signing domain ----------------------------------------------
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function cb58ToHex(s) {
  let n = 0n;
  for (const c of s) {
    const i = B58.indexOf(c);
    if (i < 0) throw new Error("cb58: bad character");
    n = n * 58n + BigInt(i);
  }
  return `0x${n.toString(16).padStart(72, "0").slice(0, 64)}`;
}
async function ruleVersion() {
  try {
    return Number(await pub.readContract({ address: ADDRESS, abi, functionName: "ruleVersion" })) >=
      2
      ? 2
      : 1;
  } catch {
    await pub.getBlockNumber(); // the node answers: the function does not exist before v2
    return 1;
  }
}
async function domainV2() {
  const url = env("RPC_URL");
  const bc = /\/ext\/bc\/([1-9A-HJ-NP-Za-km-z]{40,60})\/rpc/.exec(url)?.[1];
  if (!bc) throw new Error("RPC_URL has no /ext/bc/<blockchain id>/rpc path");
  const r = await fetch(`${url.slice(0, url.indexOf("/ext/"))}/ext/info`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "info.getNetworkID", params: {} }),
  });
  const networkId = BigInt((await r.json()).result.networkID);
  return keccak256(
    enc(
      ["string", "uint256", "bytes32", "uint256", "address"],
      ["SealedArena.AgentPolicy.v2", networkId, cb58ToHex(bc), chainId, ADDRESS],
    ),
  );
}

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
const v2 = (await ruleVersion()) === 2;
const domain = v2 ? await domainV2() : undefined;

if (command === "register") {
  const digest = v2
    ? keccak256(
        enc(
          ["string", "bytes32", "address", "bytes32", "bytes32"],
          ["SealedArena:register", domain, agent.address, ownerX, ownerY],
        ),
      )
    : keccak256(
        enc(
          ["string", "uint256", "address", "bytes32", "bytes32"],
          ["SealedArena:register", chainId, agent.address, ownerX, ownerY],
        ),
      );
  await send("register", [agent.address, ownerX, ownerY, await agent.sign({ hash: digest })]);
} else if (command === "set-mandate" && v2) {
  const m = JSON.parse(json);
  const mandate = {
    payees: m.payees,
    perTxCap: BigInt(m.perTxCap),
    dailyCap: BigInt(m.dailyCap),
    dailyFeeCap: BigInt(m.dailyFeeCap ?? m.dailyCap),
    expiry: BigInt(m.expiry),
  };
  const nonce = await read("ownerNonce");
  const challenge = keccak256(
    enc(
      ["string", "bytes32", "address", "bytes32", "uint256"],
      [
        "SealedArena:setMandate",
        domain,
        agent.address,
        keccak256(encodeAbiParameters([mandateV2Tuple], [mandate])),
        nonce,
      ],
    ),
  );
  await send("setMandateV2", [agent.address, mandate, nonce, webauthn(challenge)]);
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
} else if ((command === "freeze" || command === "unfreeze") && v2) {
  // v2: a freeze is signed on the freeze epoch, an unfreeze on the owner nonce and the epoch.
  const [nonce, epoch] = [await read("ownerNonce"), await read("freezeEpoch")];
  const challenge =
    command === "freeze"
      ? keccak256(
          enc(
            ["string", "bytes32", "address", "uint256"],
            ["SealedArena:freeze", domain, agent.address, epoch],
          ),
        )
      : keccak256(
          enc(
            ["string", "bytes32", "address", "uint256", "uint256"],
            ["SealedArena:unfreeze", domain, agent.address, nonce, epoch],
          ),
        );
  await send(command, [agent.address, command === "freeze" ? epoch : nonce, webauthn(challenge)]);
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
      ruleVersion: v2 ? 2 : 1,
    }),
  );
} else {
  console.error("usage: agent-admin.mjs register|set-mandate <json>|freeze|unfreeze|show");
  process.exit(2);
}
