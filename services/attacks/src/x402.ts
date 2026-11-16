// x402 signed-native-tx on the local Sealed L1, end to end (docs/ARCHITECTURE.md section 4).
// Starts the facilitator and two sample sellers over HTTP, makes one purchase, then tries
// each forbidden payment and checks it is refused without moving the agent's coins.
// Test keys only (packages/shared/src/addresses.local.ts); a fresh agent is made each run.
import type { AddressInfo } from "node:net";
import { serve } from "@hono/node-server";
import {
  allowListAbi,
  CHAIN_ID,
  fetchWithPayment,
  LOCAL_PAYEES,
  PAYMENT_GAS,
  PRECOMPILES,
  paymentData,
  pickSignedNativeTx,
} from "@sealed-arena/shared";
import { decodePaymentRequiredHeader, encodePaymentSignatureHeader } from "@x402/core/http";
import type { PaymentPayload, PaymentRequired, PaymentRequirements } from "@x402/core/types";
import { createFacilitatorApp } from "facilitator";
import { createSellerApp } from "seller";
import { type Address, encodeFunctionData, type Hex, keccak256 } from "viem";
import { generatePrivateKey, type PrivateKeyAccount, privateKeyToAccount } from "viem/accounts";
import {
  accounts,
  coin,
  type Node,
  nodes,
  readPolicy,
  registerAgent,
  sendAndWait,
  setMandate,
} from "./localnet.js";

type Server = { url: string; close: () => void };

function listen(fetch: (r: Request) => Response | Promise<Response>): Promise<Server> {
  return new Promise((resolve) => {
    const s = serve({ fetch, port: 0, hostname: "127.0.0.1" }, (info: AddressInfo) => {
      resolve({ url: `http://127.0.0.1:${info.port}`, close: () => s.close() });
    });
  });
}

/** A fresh agent: allowed to send, funded, registered, with a one-day mandate for `payees`. */
async function freshAgent(n: Node, payees: readonly Address[]): Promise<PrivateKeyAccount> {
  const agent = privateKeyToAccount(generatePrivateKey());
  await sendAndWait(n, accounts.admin, {
    to: PRECOMPILES.txAllowList,
    data: encodeFunctionData({
      abi: allowListAbi,
      functionName: "setEnabled",
      args: [agent.address],
    }),
  });
  await sendAndWait(n, accounts.admin, { to: agent.address, value: coin(10), gas: 21_000n });
  await registerAgent(n, agent);
  const expiry = BigInt(Math.floor(Date.now() / 1000) + 86_400);
  await setMandate(n, agent.address, { payees, perTxCap: coin(1), dailyCap: coin(3), expiry });
  return agent;
}

type Result = { name: string; ok: boolean; detail: string };

async function main(): Promise<void> {
  const n = nodes()[0];
  if (!n) throw new Error("no node");
  const results: Result[] = [];
  const add = (name: string, ok: boolean, detail: string) => {
    results.push({ name, ok, detail });
    console.log(`${ok ? "ok " : "!! "} ${name}: ${detail}`);
  };

  const payTo = LOCAL_PAYEES[0];
  const outsider = privateKeyToAccount(generatePrivateKey()).address; // not in the mandate
  const facilitator = await listen(
    createFacilitatorApp(n.client, { receiptTimeoutMs: 30_000 }).fetch,
  );
  /** A seller on its own port; the app is built once the port (its base URL) is known. */
  // A facilitator whose /settle answer is lost: it settles for real in the background but
  // reports a failure at once, before the payment is in a block.
  const lossy = await listen(async (r) => {
    const url = new URL(r.url);
    const forwarded = fetch(`${facilitator.url}${url.pathname}`, {
      method: r.method,
      headers: r.headers,
      ...(r.method === "POST" ? { body: await r.text() } : {}),
    });
    if (url.pathname !== "/settle") return forwarded;
    forwarded.then((res) => res.text()).catch(() => undefined);
    return Response.json({
      success: false,
      errorReason: "facilitator_unreachable",
      transaction: "",
      network: "eip155:261126",
    });
  });
  const startSeller = async (to: Address, facilitatorUrl = facilitator.url): Promise<Server> => {
    let app: ReturnType<typeof createSellerApp> | undefined;
    const s = await listen((r) => (app ? app.fetch(r) : new Response("starting", { status: 503 })));
    app = createSellerApp({
      baseUrl: s.url,
      payTo: to,
      facilitatorUrl,
      client: n.client,
    });
    return s;
  };
  const seller = await startSeller(payTo);
  const stranger = await startSeller(outsider);
  const sellerUrl = seller.url;
  const strangerUrl = stranger.url;
  const unlucky = await startSeller(payTo, lossy.url);

  const agent = await freshAgent(n, [payTo, LOCAL_PAYEES[1]]);
  console.log(
    `agent ${agent.address}, seller ${sellerUrl} pays to ${payTo}, facilitator ${facilitator.url}`,
  );

  const state = async () => ({
    nonce: await n.client.getTransactionCount({ address: agent.address }),
    balance: await n.client.getBalance({ address: agent.address }),
  });

  /** Gets a fresh 402 for `url`. */
  const quote = async (
    url: string,
  ): Promise<{ required: PaymentRequired; req: PaymentRequirements }> => {
    const res = await fetch(url);
    const header = res.headers.get("PAYMENT-REQUIRED");
    if (res.status !== 402 || !header)
      throw new Error(`expected 402 from ${url}, got ${res.status}`);
    const required = decodePaymentRequiredHeader(header);
    const req = pickSignedNativeTx(required);
    if (!req) throw new Error("no signed-native-tx option");
    return { required, req };
  };

  type Tweak = {
    to?: Address;
    value?: bigint;
    data?: Hex;
    chainId?: number;
    signer?: PrivateKeyAccount;
  };
  const signFor = async (req: PaymentRequirements, t: Tweak = {}): Promise<Hex> => {
    const signer = t.signer ?? agent;
    const [nonce, fees] = await Promise.all([
      n.client.getTransactionCount({ address: signer.address, blockTag: "pending" }),
      n.client.estimateFeesPerGas(),
    ]);
    return signer.signTransaction({
      type: "eip1559",
      chainId: t.chainId ?? CHAIN_ID,
      nonce,
      gas: PAYMENT_GAS,
      maxFeePerGas: fees.maxFeePerGas,
      maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
      to: t.to ?? (req.payTo as Address),
      value: t.value ?? BigInt(req.amount),
      data: t.data ?? paymentData(req.extra.resourceUrl as string, req.extra.requestId as Hex),
    });
  };

  /** Sends a payment header and returns the HTTP status and the seller's reason. */
  const pay = async (
    url: string,
    required: PaymentRequired,
    req: PaymentRequirements,
    raw: Hex,
  ) => {
    const payload: PaymentPayload = {
      x402Version: 2,
      resource: required.resource,
      accepted: req,
      payload: { signedTransaction: raw },
    };
    const res = await fetch(url, {
      headers: { "PAYMENT-SIGNATURE": encodePaymentSignatureHeader(payload) },
    });
    const body = (await res.json()) as { error?: string };
    return { status: res.status, reason: body.error ?? "" };
  };

  /** A forbidden payment: refused with `reason`, and the agent's nonce and balance do not move. */
  const refused = async (
    name: string,
    path: string,
    reason: string | RegExp,
    make: (req: PaymentRequirements) => Promise<Hex>,
  ) => {
    const url = `${sellerUrl}${path}`;
    const before = await state();
    const { required, req } = await quote(url);
    const r = await pay(url, required, req, await make(req));
    const after = await state();
    const reasonOk = typeof reason === "string" ? r.reason === reason : reason.test(r.reason);
    const untouched = after.nonce === before.nonce && after.balance === before.balance;
    add(
      name,
      r.status === 402 && reasonOk && untouched,
      `status ${r.status}, reason ${r.reason}, agent untouched ${untouched}`,
    );
  };

  // 1. One purchase end to end.
  const fx = `${sellerUrl}/data/fx-rates`;
  const bought = await fetchWithPayment(fx, {
    account: agent,
    client: n.client,
    maxAmount: coin(1),
  });
  {
    const hash = bought.settlement?.transaction as Hex | undefined;
    const req = bought.required ? pickSignedNativeTx(bought.required) : undefined;
    let detail = `status ${bought.response.status}`;
    let ok = bought.response.status === 200 && !!hash && !!req;
    if (ok && hash && req) {
      const [tx, receipt] = await Promise.all([
        n.client.getTransaction({ hash }),
        n.client.getTransactionReceipt({ hash }),
      ]);
      const want = paymentData(fx, req.extra.requestId as Hex);
      ok =
        receipt.status === "success" &&
        tx.input === want &&
        tx.to?.toLowerCase() === payTo.toLowerCase();
      detail += `, tx ${hash}, receipt ${receipt.status}, data ${tx.input === want ? "matches" : "DIFFERS"} keccak256(abi.encode(resourceUrl, requestId))`;
    }
    add("buy /data/fx-rates end to end", ok, detail);
  }

  // 2. Forbidden payments.
  await refused(
    "wrong to (another payee of the mandate)",
    "/data/fx-rates",
    "invalid_exact_evm_payload_recipient_mismatch",
    (req) => signFor(req, { to: LOCAL_PAYEES[1] }),
  );
  await refused(
    "value below the price",
    "/data/weather",
    "invalid_exact_evm_payload_authorization_value_mismatch",
    (req) => signFor(req, { value: BigInt(req.amount) - 1n }),
  );
  await refused(
    "data of another resource",
    "/data/weather",
    "invalid_exact_native_payload_data_mismatch",
    (req) =>
      signFor(req, {
        data: paymentData(`${sellerUrl}/data/gas-prices`, req.extra.requestId as Hex),
      }),
  );
  await refused("another chain id", "/data/weather", "invalid_network", (req) =>
    signFor(req, { chainId: 43113 }),
  );
  await refused(
    "signed by a key that is not the agent's",
    "/data/weather",
    "insufficient_funds",
    (req) => signFor(req, { signer: privateKeyToAccount(generatePrivateKey()) }),
  );

  // requestId already used: a new, correct payment for the id of the purchase above.
  {
    const before = await state();
    const usedReq = bought.required ? pickSignedNativeTx(bought.required) : undefined;
    if (!usedReq || !bought.required) {
      add("requestId already used", false, "no purchase to reuse");
    } else {
      const r = await pay(fx, bought.required, usedReq, await signFor(usedReq));
      const after = await state();
      const untouched = after.nonce === before.nonce && after.balance === before.balance;
      add(
        "requestId already used",
        r.status === 402 && r.reason === "request_id_already_used" && untouched,
        `status ${r.status}, reason ${r.reason}, agent untouched ${untouched}`,
      );
    }
  }

  // Transaction already broadcast before it reached the facilitator.
  {
    const url = `${sellerUrl}/data/gas-prices`;
    const { required, req } = await quote(url);
    const raw = await signFor(req);
    const hash = await n.client.sendRawTransaction({ serializedTransaction: raw });
    await n.client.waitForTransactionReceipt({ hash });
    const before = await state();
    const r = await pay(url, required, req, raw);
    const after = await state();
    const untouched = after.nonce === before.nonce && after.balance === before.balance;
    add(
      "transaction already broadcast",
      r.status === 402 &&
        r.reason === "invalid_exact_native_payload_already_submitted" &&
        untouched,
      `status ${r.status}, reason ${r.reason}, no second charge ${untouched}`,
    );
  }

  // 3. A seller outside the agent's payee list: /verify gives the reason, nothing reaches the chain.
  {
    const url = `${strangerUrl}/data/fx-rates`;
    const before = await state();
    const { required, req } = await quote(url);
    const raw = await signFor(req);
    const v = await fetch(`${facilitator.url}/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        x402Version: 2,
        paymentPayload: {
          x402Version: 2,
          resource: required.resource,
          accepted: req,
          payload: { signedTransaction: raw },
        },
        paymentRequirements: req,
      }),
    }).then((r) => r.json() as Promise<{ isValid: boolean; invalidReason?: string }>);
    const r = await pay(url, required, req, raw);
    const after = await state();
    const untouched = after.nonce === before.nonce && after.balance === before.balance;
    const outsiderBalance = await n.client.getBalance({ address: outsider });
    add(
      "seller outside the payee list",
      !v.isValid &&
        v.invalidReason === "agent_payee_not_allowed" &&
        r.reason === "agent_payee_not_allowed" &&
        untouched &&
        outsiderBalance === 0n,
      `/verify ${v.invalidReason}, seller ${r.status} ${r.reason}, agent untouched ${untouched}, outsider balance ${outsiderBalance}`,
    );
  }

  // 4. Settle answer lost after broadcast: the buyer retries the same payment and gets the data, paid once.
  {
    const url = `${unlucky.url}/data/weather`;
    const before = await state();
    const { required, req } = await quote(url);
    const raw = await signFor(req);
    const first = await pay(url, required, req, raw);
    // Another payment for the same request id is refused while the first may still land.
    const other = await pay(
      url,
      required,
      req,
      await signFor(req, { value: BigInt(req.amount) + 1n }),
    );
    await n.client.waitForTransactionReceipt({ hash: keccak256(raw) });
    const retry = await pay(url, required, req, raw);
    const after = await state();
    const paidOnce =
      after.nonce === before.nonce + 1 && before.balance - after.balance >= BigInt(req.amount);
    add(
      "settle answer lost, same payment retried",
      first.status === 402 &&
        first.reason === "facilitator_unreachable" &&
        other.reason === "request_id_already_used" &&
        retry.status === 200 &&
        paidOnce,
      `first ${first.status} ${first.reason}, other tx ${other.reason}, retry ${retry.status}, paid once ${paidOnce}`,
    );
  }

  const [spentToday] = await readPolicy.spend(n, agent.address);
  console.log(`agent spentToday ${spentToday}`);

  facilitator.close();
  seller.close();
  stranger.close();
  unlucky.close();
  lossy.close();

  const failed = results.filter((r) => !r.ok);
  console.log(`x402: ${results.length - failed.length}/${results.length} cases as expected`);
  if (failed.length > 0) {
    console.error("x402: FAIL");
    process.exit(1);
  }
  console.log("x402: PASS");
}

main().catch((err) => {
  console.error("x402: FAIL:", err instanceof Error ? err.message : err);
  process.exit(1);
});
