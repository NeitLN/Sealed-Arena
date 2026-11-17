// Owner console against a deployed page and a public chain (default: the Sealed L1 on Fuji),
// with a virtual passkey. Uses the production flow: the page shows the register digest, the
// agent key signs it, the signature is pasted. No local servers.
//   LIVE_URL (default https://sealed-arena.vercel.app), LIVE_RPC (default https://sealed-arena.duckdns.org/rpc)
//   SEALED_ADMIN_KEY: admin of the chain's TxAllowList (allows and funds the fresh agent)
// Run: pnpm --filter web e2e:live   (reads Sealed-Arena/.env; FUJI_L1_ADMIN_PRIVATE_KEY is used if set)
import { resolve } from "node:path";
import {
  agentPolicyAbi,
  allowListAbi,
  CHAIN_ID,
  LOCAL_PAYEES,
  PRECOMPILES,
} from "@sealed-arena/shared";
import { type Browser, chromium, type Page } from "playwright";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  encodeFunctionData,
  type Hex,
  http,
  parseEther,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

try {
  process.loadEnvFile(resolve(import.meta.dirname, "../../.env"));
} catch {
  // keys may come from the environment
}
const PAGE = process.env.LIVE_URL ?? "https://sealed-arena.vercel.app/console";
const RPC = process.env.LIVE_RPC ?? "https://sealed-arena.duckdns.org/rpc";
const adminKey = (process.env.SEALED_ADMIN_KEY ?? process.env.FUJI_L1_ADMIN_PRIVATE_KEY) as
  | Hex
  | undefined;
if (!adminKey) throw new Error("set SEALED_ADMIN_KEY (or FUJI_L1_ADMIN_PRIVATE_KEY in .env)");

const chain = defineChain({
  id: CHAIN_ID,
  name: "Sealed",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
});
const pub = createPublicClient({ chain, transport: http(RPC) });
const admin = privateKeyToAccount(adminKey);
const adminWallet = createWalletClient({ account: admin, chain, transport: http(RPC) });

type Check = { name: string; ok: boolean; detail: string };
const checks: Check[] = [];
const check = (name: string, ok: boolean, detail = "") => {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "ok " : "!! "} ${name}${detail ? `: ${detail}` : ""}`);
};

async function until(page: Page, what: string, cond: () => Promise<boolean>, ms = 60_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await cond()) return;
    await new Promise((r) => setTimeout(r, 1000));
  }
  const banners = await page
    .getByRole("alert")
    .allTextContents()
    .catch(() => []);
  throw new Error(`timed out waiting for ${what}; page says: ${banners.join(" | ")}`);
}

async function ownerPage(browser: Browser): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  await ctx.addInitScript(() => localStorage.setItem("sealed.lang", "en"));
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  await page.goto(PAGE);
  return page;
}

const read = (fn: string, args: unknown[]) =>
  pub.readContract({
    address: PRECOMPILES.agentPolicy,
    abi: agentPolicyAbi,
    functionName: fn,
    args,
  } as never) as Promise<unknown>;

async function main() {
  // A fresh agent the admin allows to send (the relayer registers only such agents) and funds a little.
  const agentKey = generatePrivateKey();
  const agent = privateKeyToAccount(agentKey);
  for (const tx of [
    {
      to: PRECOMPILES.txAllowList,
      data: encodeFunctionData({
        abi: allowListAbi,
        functionName: "setEnabled",
        args: [agent.address],
      }),
    },
    { to: agent.address, value: parseEther("0.2"), gas: 21_000n },
  ]) {
    const hash = await adminWallet.sendTransaction(tx as never);
    if ((await pub.waitForTransactionReceipt({ hash })).status !== "success")
      throw new Error("setup tx failed");
  }
  console.log(`agent ${agent.address} allowed and funded; page ${PAGE}`);
  const agentWallet = createWalletClient({ account: agent, chain, transport: http(RPC) });
  const pay = () =>
    agentWallet
      .sendTransaction({ to: LOCAL_PAYEES[0], value: parseEther("0.001"), gas: 21_000n })
      .then(async (hash: Hex) => (await pub.waitForTransactionReceipt({ hash })).status)
      .catch((e: unknown) => (e instanceof Error ? e.message : String(e)));

  const browser = await chromium.launch();
  try {
    const page = await ownerPage(browser);
    await page.getByRole("button", { name: "Create passkey" }).click();
    await page.getByText("Passkey ready").waitFor();
    await page.getByLabel("Agent address").fill(agent.address);

    // Production flow: read the digest the page shows, sign it with the agent key, paste the signature.
    const digest = (
      await page
        .getByText(/^0x[0-9a-f]{64}$/)
        .first()
        .textContent()
    )?.trim() as Hex;
    const signature = await agent.sign({ hash: digest });
    await page.getByLabel("Agent signature").fill(signature);
    await page.getByRole("button", { name: "Link agent to passkey" }).click();
    await until(
      page,
      "registration",
      async () => (await read("isAgent", [agent.address])) === true,
    );
    const saved = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("sealed.owner.v1") ?? "{}"),
    );
    const key = (await read("ownerKey", [agent.address])) as readonly [Hex, Hex];
    check(
      "live: agent linked to the passkey created on the deployed page",
      key[0].toLowerCase() === saved.passkey?.x?.toLowerCase() &&
        key[1].toLowerCase() === saved.passkey?.y?.toLowerCase(),
      `rpId ${new URL(PAGE).hostname}`,
    );

    await page.getByLabel("Allowed payees").fill(`${LOCAL_PAYEES[0]}\n${LOCAL_PAYEES[1]}`);
    await page.getByLabel("Per payment (USDC)").fill("0.1");
    await page.getByLabel("Per day (USDC)").fill("0.3");
    await page.getByLabel("Valid (days)").fill("1");
    await page.getByRole("button", { name: "Sign and set mandate" }).click();
    await until(
      page,
      "the mandate",
      async () =>
        ((await read("getMandate", [agent.address])) as [{ payees: unknown[] }])[0].payees
          .length === 2,
    );
    check("live: mandate set with the passkey", true);
    check("live: the agent can pay inside the mandate", (await pay()) === "success");

    await page.getByRole("button", { name: "Freeze agent" }).click();
    await until(
      page,
      "frozen",
      async () => ((await read("getMandate", [agent.address])) as [unknown, boolean])[1],
    );
    const whileFrozen = String(await pay());
    check(
      "live: frozen agent's payment refused by the node",
      /agent: frozen/.test(whileFrozen),
      whileFrozen.split("\n").find((l) => /agent:/.test(l)) ?? whileFrozen.slice(0, 80),
    );
    await page.getByRole("button", { name: "Unfreeze agent" }).waitFor({ timeout: 30_000 });
    await page.getByRole("button", { name: "Unfreeze agent" }).click();
    await until(
      page,
      "unfrozen",
      async () => !((await read("getMandate", [agent.address])) as [unknown, boolean])[1],
    );
    check("live: unfrozen agent pays again", (await pay()) === "success");

    const other = await ownerPage(browser);
    await other.getByRole("button", { name: "Create passkey" }).click();
    await other.getByText("Passkey ready").waitFor();
    await other.getByLabel("Agent address").fill(agent.address);
    await other.getByText("Linked to another passkey").waitFor({ timeout: 30_000 });
    await other.getByRole("button", { name: "Freeze agent" }).click();
    const refused = other.getByText(/^Refused: /);
    await refused.waitFor({ timeout: 60_000 });
    const reason = (await refused.textContent()) ?? "";
    const stillActive = !((await read("getMandate", [agent.address])) as [unknown, boolean])[1];
    check("live: another passkey cannot freeze", stillActive && /agentpolicy/.test(reason), reason);
  } finally {
    await browser.close();
  }
  const failed = checks.filter((c) => !c.ok);
  console.log(
    `live e2e: ${checks.length - failed.length}/${checks.length} ${failed.length ? "FAIL" : "PASS"}`,
  );
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error("live e2e: FAIL:", err instanceof Error ? err.message : err);
  process.exit(1);
});
