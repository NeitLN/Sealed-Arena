import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdirSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { agentPolicyAbi } from "@sealed-arena/shared";
import { Hono } from "hono";
import { chromium } from "playwright";
import { decodeFunctionData, encodeFunctionResult, type Hex, parseEther, toHex } from "viem";
import result from "../src/compare-result.json" with { type: "json" };
import leakedKey from "../src/leakedKeySummary.json" with { type: "json" };
import { limitationSources } from "../src/limitationsText.js";

const site = new Hono();
site.use("/*", serveStatic({ root: "./dist" }));
site.get("*", serveStatic({ path: "./dist/index.html" }));
const server = serve({ fetch: site.fetch, port: 0, hostname: "127.0.0.1" });
await once(server, "listening");
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
const browser = await chromium.launch().catch((error) => {
  server.close();
  throw error;
});
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
  });
  // No test traffic is sent to the public testnet or relayer.
  await page.route("**/*", (route) => {
    const url = route.request().url();
    return url.startsWith(base) || url.startsWith("data:")
      ? route.continue()
      : route.fulfill({ status: 503, contentType: "application/json", body: "{}" });
  });
  const errors: string[] = [];
  const writes: string[] = [];
  const bundles: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (
      /eth_send|personal_sign|eth_sign|\/demo\/claim|\/relay$/.test(
        (request.postData() ?? "") + request.url(),
      )
    )
      writes.push(request.url());
    if (request.url().endsWith(".js")) bundles.push(request.url());
  });
  await page.goto(`${base}/?lang=vi`);
  await page.getByRole("heading", { level: 1 }).waitFor();
  assert.match((await page.locator("h1").textContent()) ?? "", /Đưa agent một chiếc thẻ/);
  await page.getByText("Hiện chưa lấy được dữ liệu trực tiếp.", { exact: true }).waitFor();
  assert.equal(await page.locator(".metric-loading").count(), 3);
  assert.equal(
    bundles.some((url) => /OwnerPage-|useArenaLive-|TryPayment-/.test(url)),
    false,
    "landing does not load console or transaction dependencies",
  );
  await page.getByRole("button", { name: "EN", exact: true }).click();
  assert.match((await page.locator("h1").textContent()) ?? "", /Give your agent a card/);
  await page.goto(base);
  await page.locator("h1").waitFor();
  assert.equal(await page.locator("html").getAttribute("lang"), "en");
  assert.match((await page.locator("h1").textContent()) ?? "", /Give your agent a card/);
  assert.equal(
    ((await page.locator(".key-evidence .evidence-number").textContent()) ?? "").replace(/\s/g, ""),
    `${leakedKey.passed}/${leakedKey.cases}`,
  );
  await page.getByRole("button", { name: "Try a real payment", exact: true }).click();
  await page.locator("#hero-transaction h2").waitFor();
  assert.equal(await page.getByRole("button", { name: /Pay a stranger/ }).isVisible(), true);
  assert.equal(
    await page.getByRole("button", { name: /control/ }).isDisabled(),
    true,
    "seller controls explain unavailable mandate",
  );
  await page.getByRole("button", { name: "Try a real payment", exact: true }).click();
  mkdirSync("screenshots", { recursive: true });
  for (const path of ["/", "/arena", "/arena/rules", "/compare", "/business", "/console"]) {
    for (const lang of ["en", "vi"]) {
      await page.goto(`${base}${path}?lang=${lang}`);
      await page.locator("h1").waitFor();
      await page.evaluate(() => document.fonts.ready);
      for (const width of [360, 390, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        assert.ok(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          `${path} ${lang} overflows at ${width}`,
        );
        assert.equal(await page.locator("h1").count(), 1);
        assert.equal(await page.locator("html").getAttribute("lang"), lang);
        const tiny = await page.locator("main").evaluate((main) =>
          Array.from(main.querySelectorAll("*"))
            .filter(
              (el) =>
                Array.from(el.childNodes).some(
                  (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim(),
                ) &&
                el.getBoundingClientRect().width > 0 &&
                parseFloat(getComputedStyle(el).fontSize) < 12,
            )
            .map((el) => `${el.tagName}: ${el.textContent?.slice(0, 60)}`),
        );
        assert.deepEqual(tiny, [], `${path} has text below 12px`);
        if ((width === 360 || width === 1440) && lang === "en")
          await page.screenshot({
            path: `screenshots/${path === "/" ? "landing" : path.slice(1).replaceAll("/", "-")}-${width}.png`,
            fullPage: true,
          });
      }
    }
  }
  await page.goto(`${base}/compare?lang=en`);
  await page.locator(".burst-panel").first().waitFor();
  assert.equal(
    await page.locator(".burst-panel").nth(1).locator(".burst-dot").count(),
    result.S.attempts,
  );
  assert.equal(
    await page.locator(".burst-panel").nth(1).locator(".burst-refused").count(),
    result.S.refusedByPool,
  );
  assert.doesNotMatch(
    (await page.locator(".section-note").textContent()) ?? "",
    /waiting payments may/i,
  );
  await page.goto(`${base}/arena/rules?lang=en`);
  await page.locator(".limits-ledger").waitFor();
  // As many as the limitations list (every limit has a source, tested in limitationsText).
  assert.equal(await page.locator(".limits-ledger li").count(), limitationSources.length);
  await page.goto(`${base}/?lang=en`);
  await page.locator("h1").waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator(".landing-mobile-menu summary").click();
  assert.equal(
    await page.getByRole("link", { name: "For builders", exact: true }).isVisible(),
    true,
  );
  await page.getByRole("link", { name: "How it works", exact: true }).click();
  assert.equal(await page.locator(".landing-mobile-menu").getAttribute("open"), null);
  assert.equal(
    await page.evaluate(
      () =>
        document.getAnimations().filter((animation) => animation.playState === "running").length,
    ),
    0,
    "reduced motion stops animations",
  );
  await page.keyboard.press("Control+Home");
  await page.keyboard.press("Tab");
  assert.equal(await page.locator(".landing-skip").getAttribute("href"), "#site-main");
  assert.equal(
    await page.getByRole("link", { name: "Full results", exact: true }).getAttribute("href"),
    "/compare",
  );
  // Exercise the populated console without signing or sending anything. All RPC values here
  // are UI fixtures; real passkey + chain integration remains in owner.e2e.ts.
  const fixture = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
  });
  fixture.on("pageerror", (error) => errors.push(error.message));
  const x = `0x${"11".repeat(32)}` as Hex;
  const y = `0x${"22".repeat(32)}` as Hex;
  const seller = "0x0000000000000000000000000000000000000001";
  await fixture.addInitScript(
    ({ agent, x, y }) => {
      localStorage.setItem(
        "sealed.owner.v1",
        JSON.stringify({ agent, passkey: { credentialId: "layout-fixture", x, y } }),
      );
    },
    { agent: result.S.agent, x, y },
  );
  const replies = {
    isAgent: encodeFunctionResult({ abi: agentPolicyAbi, functionName: "isAgent", result: true }),
    ownerKey: encodeFunctionResult({
      abi: agentPolicyAbi,
      functionName: "ownerKey",
      result: [x, y],
    }),
    ownerNonce: encodeFunctionResult({
      abi: agentPolicyAbi,
      functionName: "ownerNonce",
      result: 0n,
    }),
    getMandate: encodeFunctionResult({
      abi: agentPolicyAbi,
      functionName: "getMandate",
      result: [
        {
          payees: [seller],
          perTxCap: parseEther(result.S.caps.perTx),
          dailyCap: parseEther(result.S.caps.daily),
          expiry: BigInt(Math.floor(Date.now() / 1000) + 7 * 86400),
        },
        false,
      ],
    }),
    getSpend: encodeFunctionResult({
      abi: agentPolicyAbi,
      functionName: "getSpend",
      result: [0n, 0n, 0n],
    }),
  };
  await fixture.route("**/*", async (route) => {
    const request = route.request();
    if (request.url().startsWith(base)) return route.continue();
    if (request.url().endsWith("/rpc")) {
      type Call = { id: number; method: string; params: [{ data: Hex }] };
      const payload = request.postDataJSON() as Call | Call[];
      const answer = (call: Call) => {
        if (call.method === "eth_getBalance")
          return { jsonrpc: "2.0", id: call.id, result: toHex(parseEther("2")) };
        if (call.method === "eth_call") {
          const { functionName } = decodeFunctionData({
            abi: agentPolicyAbi,
            data: call.params[0].data,
          });
          // A rule v1 node does not know ruleVersion(): it answers the way the precompile does.
          if (functionName === "ruleVersion")
            return {
              jsonrpc: "2.0",
              id: call.id,
              error: { code: -32000, message: "execution reverted: invalid function selector" },
            };
          return {
            jsonrpc: "2.0",
            id: call.id,
            result: replies[functionName as keyof typeof replies],
          };
        }
        throw new Error(`Unexpected fixture RPC call: ${call.method}`);
      };
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(Array.isArray(payload) ? payload.map(answer) : answer(payload)),
      });
    }
    return route.fulfill({ status: 503, contentType: "application/json", body: "{}" });
  });
  for (const lang of ["en", "vi"]) {
    await fixture.goto(`${base}/console?lang=${lang}`);
    // Populated: the mandate form for the linked agent is shown (the sign preview itself only
    // appears once the form is valid).
    await fixture
      .getByRole("button", {
        name: lang === "en" ? "Sign and set mandate" : "Ký và đặt uỷ quyền",
        exact: true,
      })
      .waitFor();
    for (const width of [360, 768, 1440]) {
      await fixture.setViewportSize({ width, height: 1000 });
      assert.ok(
        await fixture.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        `populated console ${lang} overflows at ${width}`,
      );
      if (lang === "en" && width !== 768)
        await fixture.screenshot({
          path: `screenshots/console-fixture-${width}.png`,
          fullPage: true,
        });
    }
    if (lang === "en") {
      assert.equal(
        await fixture
          .getByRole("button", { name: "Sign and set mandate", exact: true })
          .isVisible(),
        true,
      );
      assert.equal(
        await fixture.getByRole("button", { name: "Freeze agent", exact: true }).isVisible(),
        true,
      );
      await fixture.getByLabel("Per day (USDC)", { exact: true }).fill("0.75");
      assert.match(
        (await fixture.locator("section.sign-preview").textContent()) ?? "",
        /0.75 USDC/,
      );
      assert.equal(await fixture.getByText("Linked to this passkey", { exact: true }).count(), 1);
    }
  }
  await fixture.close();
  assert.deepEqual(writes, [], "viewing pages and opening controls sends no transactions");
  assert.deepEqual(errors, [], "no browser runtime errors");
  console.log(
    "PASS: all six routes in EN/VI at five widths, readable text, recorded data, lazy transaction bundles, unavailable data, language persistence, mobile navigation, reduced motion, no transaction writes, no runtime errors. Screenshots: web/screenshots/",
  );
} finally {
  await browser.close();
  server.close();
}
