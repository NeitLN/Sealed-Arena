import assert from "node:assert/strict";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { agentPolicyAbi, FUJI_POLICY_IDS } from "@sealed-arena/shared";
import { Hono } from "hono";
import { chromium } from "playwright";
import { decodeFunctionData, encodeFunctionResult, type Hex, parseEther, toHex } from "viem";

const agent = /agent: "(0x[0-9a-fA-F]+)"/.exec(readFileSync("src/arena.config.ts", "utf8"))?.[1];
if (!agent) throw new Error("Missing challenge agent");

const app = new Hono();
app.use("/*", serveStatic({ root: "./dist" }));
app.get("*", serveStatic({ path: "./dist/index.html" }));
const server = serve({ fetch: app.fetch, port: 0, hostname: "127.0.0.1" });
await once(server, "listening");
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
const browser = await chromium.launch();
const x = `0x${"11".repeat(32)}` as Hex;
const y = `0x${"22".repeat(32)}` as Hex;
const hash = `0x${"aa".repeat(32)}`;
const seller = "0x0000000000000000000000000000000000001234";
const m = {
  payees: [seller],
  perTxCap: parseEther("0.02"),
  dailyCap: parseEther("0.03"),
  dailyFeeCap: parseEther("0.001"),
  expiry: BigInt(Math.floor(Date.now() / 1000) + 7 * 86400),
};
const values: Record<string, unknown> = {
  isAgent: true,
  ownerKey: [x, y],
  ownerNonce: 0n,
  getMandate: [m, false],
  getSpend: [0n, 0n, 0n],
  ruleVersion: 2,
  freezeEpoch: 0n,
  getMandateV2: [m, true, false],
  getFeeSpend: [0n, 0n],
};
const errors: string[] = [];
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(
    ({ agent, x, y }) =>
      localStorage.setItem(
        "sealed.owner.v1",
        JSON.stringify({ agent, passkey: { credentialId: "fixture", x, y } }),
      ),
    { agent: agent, x, y },
  );
  await page.route("**/*", async (route) => {
    const request = route.request();
    if (request.url().startsWith(base)) return route.continue();
    const json = (value: unknown) =>
      route.fulfill({ contentType: "application/json", body: JSON.stringify(value) });
    if (request.url().endsWith("/info"))
      return json({
        chainId: 261126,
        rpc: "https://sealed-arena.duckdns.org/rpc",
        ruleVersion: 2,
        networkId: FUJI_POLICY_IDS.networkId,
        blockchainId: FUJI_POLICY_IDS.blockchainId,
      });
    if (request.url().includes("/attempts/recent"))
      return json([
        {
          ts: Date.now(),
          from: agent,
          to: seller,
          value: "1",
          hash,
          result: "accepted",
          reason: "",
        },
        {
          ts: Date.now() - 1000,
          from: agent,
          to: seller,
          value: "1",
          hash: "",
          result: "rejected",
          reason: "agent: budget exceeded",
        },
      ]);
    if (request.url().endsWith("/rpc")) {
      type Call = { id: number; method: string; params: [{ data: Hex }] };
      const answer = (call: Call) => {
        let result: unknown;
        if (call.method === "eth_getBalance") result = toHex(parseEther("0.05"));
        else if (call.method === "eth_blockNumber") result = "0x100";
        else if (call.method === "eth_getCode") result = "0x";
        else if (call.method === "eth_getTransactionReceipt")
          result = {
            transactionHash: hash,
            from: agent,
            to: seller,
            blockNumber: "0x100",
            blockHash: hash,
            transactionIndex: "0x0",
            gasUsed: "0x5208",
            cumulativeGasUsed: "0x5208",
            effectiveGasPrice: "0x1",
            contractAddress: null,
            logs: [],
            logsBloom: `0x${"00".repeat(256)}`,
            status: "0x1",
            type: "0x2",
          };
        else if (call.method === "eth_call") {
          const { functionName } = decodeFunctionData({
            abi: agentPolicyAbi,
            data: call.params[0].data,
          });
          result = encodeFunctionResult({
            abi: agentPolicyAbi,
            functionName,
            result: values[functionName],
          } as never);
        } else throw new Error(`Unexpected RPC: ${call.method}`);
        return { jsonrpc: "2.0", id: call.id, result };
      };
      const calls = request.postDataJSON() as Call | Call[];
      return json(Array.isArray(calls) ? calls.map(answer) : answer(calls));
    }
    return route.fulfill({ status: 503, body: "{}" });
  });
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    for (const lang of ["en", "vi"]) {
      for (const path of ["/business", "/console", "/live"]) {
        await page.goto(`${base}${path}?lang=${lang}`);
        await page.locator("h1").waitFor();
        if (path === "/console")
          await page.locator('.owner-stepper li[data-state="done"]').nth(3).waitFor();
        if (path === "/live") await page.locator(".live-attempts li").first().waitFor();
        for (const width of [360, 1440]) {
          await page.setViewportSize({ width, height: 1000 });
          await page.evaluate(() => document.fonts.ready);
          assert.ok(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
            `${path} ${scheme} ${lang} overflow ${width}`,
          );
          if (lang === "en")
            await page.screenshot({
              path: `screenshots/update-${path.slice(1)}-${scheme}-${width}.png`,
              fullPage: true,
            });
        }
      }
    }
  }
  await page.goto(`${base}/business?lang=en`);
  const issue = new URL(
    (await page
      .getByRole("link", { name: "Become a design partner", exact: true })
      .first()
      .getAttribute("href")) ?? "",
  );
  assert.equal(issue.origin + issue.pathname, "https://github.com/NeitLN/Sealed-Arena/issues/new");
  assert.ok(issue.searchParams.get("title"));
  assert.ok(issue.searchParams.get("body"));
  await page.goto(`${base}/console?lang=en`);
  await page.getByRole("button", { name: "Sign and set mandate", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  assert.match((await dialog.textContent()) ?? "", /Daily fee cap/);
  assert.match((await dialog.textContent()) ?? "", /0.24 USDC/);
  assert.ok(((await dialog.textContent()) ?? "").includes(seller));
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Freeze agent", exact: true }).click();
  await dialog.waitFor();
  assert.ok(((await dialog.textContent()) ?? "").includes(agent));
  await page.keyboard.press("Escape");
  assert.equal(await dialog.isVisible(), false);
  await page.goto(`${base}/live?lang=en`);
  await page.getByText("Payment confirmed", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Full screen", exact: true }).click();
  await page.locator(".live-display.is-full").waitFor();
  assert.equal(await page.locator(".arena-qr").isVisible(), true);
  await page.getByRole("button", { name: "Exit full screen", exact: true }).click();
  assert.deepEqual(errors, []);
  console.log(
    "PASS: EN/VI, light/dark, 360/1440px; issue URL; v2 review/cancel; receipt lanes; full-screen QR.",
  );
} finally {
  await browser.close();
  server.close();
}
