// Owner console end to end on the local Sealed L1, with a virtual passkey (Chrome DevTools WebAuthn).
// Starts the relayer and serves the built page at http://localhost:4173, then:
//   E1 create a passkey, link a fresh agent, set a mandate: the chain holds exactly that
//   E2 freeze: the agent's payment is refused (agent: frozen); unfreeze: it goes through
//   E3 another passkey tries to freeze: refused, the page shows why, the chain is unchanged
//   R9 the page fits a 360 px wide screen
// Needs: bash scripts/localnet.sh up. Run: pnpm --filter web e2e. Test keys only.
import type { AddressInfo } from "node:net";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { allowListAbi, LOCAL_PAYEES, LOCAL_ROLES, PRECOMPILES } from "@sealed-arena/shared";
import { accounts, coin, nodes, readPolicy, sendAndWait, wallet } from "attacks/localnet";
import { Hono } from "hono";
import { type BrowserContext, chromium, type Page } from "playwright";
import { createRelayerApp } from "relayer";
import { sealedRelayChain } from "relayer/chain";
import { encodeFunctionData } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const PAGE = "http://localhost:4173/console";

function listen(
  fetch: (r: Request) => Response | Promise<Response>,
  port: number,
  hostname = "localhost",
) {
  return new Promise<{ close: () => void }>((resolve) => {
    const s = serve({ fetch, port, hostname }, (_info: AddressInfo) =>
      resolve({ close: () => s.close() }),
    );
  });
}
type Check = { name: string; ok: boolean; detail: string };
const checks: Check[] = [];
const check = (name: string, ok: boolean, detail = "") => {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "ok " : "!! "} ${name}${detail ? `: ${detail}` : ""}`);
};

/** A browser context with its own virtual platform authenticator, English UI. */
async function ownerContext(
  browser: Awaited<ReturnType<typeof chromium.launch>>,
): Promise<{ ctx: BrowserContext; page: Page }> {
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
  return { ctx, page };
}

/** Waits until `cond` holds on chain; on timeout reports the page's banners. */
async function until(page: Page, what: string, cond: () => Promise<boolean>, ms = 30_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await cond()) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  const banners = await page
    .getByRole("alert")
    .allTextContents()
    .catch(() => []);
  throw new Error(`timed out waiting for ${what}; page says: ${banners.join(" | ")}`);
}

async function main() {
  const n = nodes()[0];
  if (!n) throw new Error("no local node");

  const relayer = await listen(
    createRelayerApp({
      chain: sealedRelayChain(n.url, LOCAL_ROLES.relayer.privateKey),
      publicRpc: n.url,
    }).fetch,
    4040,
    "127.0.0.1",
  );
  const site = new Hono();
  site.use("/*", serveStatic({ root: "./dist" }));
  // Routes such as /console are client-side: serve index.html, as the host's rewrite does.
  site.get("*", serveStatic({ path: "./dist/index.html" }));
  const web = await listen(site.fetch, 4173);

  // A fresh agent that may send transactions and holds a little; not linked to any owner yet.
  const agentKey = generatePrivateKey();
  const agent = privateKeyToAccount(agentKey);
  await sendAndWait(n, accounts.admin, {
    to: PRECOMPILES.txAllowList,
    data: encodeFunctionData({
      abi: allowListAbi,
      functionName: "setEnabled",
      args: [agent.address],
    }),
  });
  await sendAndWait(n, accounts.admin, { to: agent.address, value: coin(5), gas: 21_000n });
  const pay = () =>
    wallet(n, agent)
      .sendTransaction({ to: LOCAL_PAYEES[0], value: coin(1) / 100n, gas: 21_000n })
      .then(
        async (hash: `0x${string}`) => (await n.client.waitForTransactionReceipt({ hash })).status,
      )
      .catch((e: unknown) => (e instanceof Error ? e.message : String(e)));

  const browser = await chromium.launch();
  try {
    // ---- E1 -----------------------------------------------------------------------
    const { page } = await ownerContext(browser);
    await page.getByRole("button", { name: "Create passkey" }).click();
    await page.getByText("Passkey ready").waitFor();
    await page.getByLabel("Agent address").fill(agent.address);
    await page.getByLabel("Agent private key (local network only)").fill(agentKey);
    await page.getByRole("button", { name: "Link agent to passkey" }).click();
    await page.getByText("Linked to this passkey").waitFor({ timeout: 30_000 });

    const saved = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("sealed.owner.v1") ?? "{}"),
    );
    const key = await n.client.readContract({
      address: PRECOMPILES.agentPolicy,
      abi: (await import("@sealed-arena/shared")).agentPolicyAbi,
      functionName: "ownerKey",
      args: [agent.address],
    });
    check(
      "E1 owner key on chain is the passkey's public key",
      key[0].toLowerCase() === saved.passkey?.x?.toLowerCase() &&
        key[1].toLowerCase() === saved.passkey?.y?.toLowerCase(),
      `x ${key[0].slice(0, 12)}…`,
    );

    await page.getByLabel("Allowed payees").fill(`${LOCAL_PAYEES[0]}\n${LOCAL_PAYEES[1]}`);
    await page.getByLabel("Per payment (USDC)").fill("1");
    await page.getByLabel("Per day (USDC)").fill("3");
    await page.getByLabel("Valid (days)").fill("7");
    await page.getByRole("button", { name: "Sign and set mandate" }).click();
    await until(
      page,
      "the mandate",
      async () => (await readPolicy.mandate(n, agent.address))[0].payees.length === 2,
    );
    const [m, frozen0] = await readPolicy.mandate(n, agent.address);
    const days = (Number(m.expiry) - Date.now() / 1000) / 86_400;
    check(
      "E1 mandate on chain is what the form said",
      m.payees.join() === [LOCAL_PAYEES[0], LOCAL_PAYEES[1]].join() &&
        m.perTxCap === coin(1) &&
        m.dailyCap === coin(3) &&
        days > 6.9 &&
        days <= 7 &&
        !frozen0,
      `payees ${m.payees.length}, perTxCap ${m.perTxCap}, dailyCap ${m.dailyCap}, expires in ${days.toFixed(3)} days`,
    );
    check("E1 the agent can pay inside the mandate", (await pay()) === "success");

    // ---- E2 -----------------------------------------------------------------------
    await page.getByRole("button", { name: "Freeze agent" }).click();
    await until(page, "frozen", async () => (await readPolicy.mandate(n, agent.address))[1]);
    const frozen = (await readPolicy.mandate(n, agent.address))[1];
    const whileFrozen = await pay();
    check(
      "E2 freeze is on chain and the agent's payment is refused",
      frozen && /agent: frozen/.test(String(whileFrozen)),
      String(whileFrozen).split("\n")[0],
    );
    await page.getByRole("button", { name: "Unfreeze agent" }).waitFor({ timeout: 15_000 });
    await page.getByRole("button", { name: "Unfreeze agent" }).click();
    await until(page, "unfrozen", async () => !(await readPolicy.mandate(n, agent.address))[1]);
    check("E2 unfreeze lets the agent pay again", (await pay()) === "success");

    // ---- E3 -----------------------------------------------------------------------
    const other = await ownerContext(browser);
    await other.page.getByRole("button", { name: "Create passkey" }).click();
    await other.page.getByText("Passkey ready").waitFor();
    await other.page.getByLabel("Agent address").fill(agent.address);
    await other.page.getByText("Linked to another passkey").waitFor({ timeout: 15_000 });
    await other.page.getByRole("button", { name: "Freeze agent" }).click();
    const refused = other.page.getByText(/^Refused: /);
    await refused.waitFor({ timeout: 30_000 });
    const reason = (await refused.textContent()) ?? "";
    const stillActive = !(await readPolicy.mandate(n, agent.address))[1];
    check(
      "E3 another passkey cannot freeze; the page shows why",
      stillActive && /agentpolicy/.test(reason),
      reason,
    );

    // ---- R9 -----------------------------------------------------------------------
    await page.setViewportSize({ width: 360, height: 800 });
    await page.waitForTimeout(300);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    check(
      "R9 fits a 360 px wide screen (no horizontal scroll)",
      overflow <= 0,
      `overflow ${overflow}px`,
    );
    if (process.env.E2E_SCREENSHOTS) {
      await page.screenshot({
        path: `${process.env.E2E_SCREENSHOTS}/owner-360.png`,
        fullPage: true,
      });
      await page.setViewportSize({ width: 1200, height: 900 });
      await page.screenshot({
        path: `${process.env.E2E_SCREENSHOTS}/owner-1200.png`,
        fullPage: true,
      });
    }
  } finally {
    await browser.close();
    relayer.close();
    web.close();
  }

  const failed = checks.filter((c) => !c.ok);
  console.log(
    `owner e2e: ${checks.length - failed.length}/${checks.length} ${failed.length ? "FAIL" : "PASS"}`,
  );
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error("owner e2e: FAIL:", err instanceof Error ? err.message : err);
  process.exit(1);
});
