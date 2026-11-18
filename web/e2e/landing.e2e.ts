import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { chromium } from "playwright";

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
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  // Exercise the unavailable state without polling the public testnet during UI checks.
  await page.route(/\/(rpc|attempts\/(summary|recent))(\?|$)/, (route) =>
    route.fulfill({ status: 503, contentType: "application/json", body: "{}" }),
  );
  const errors: string[] = [];
  const writes: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (/eth_send|personal_sign|eth_sign/.test(request.postData() ?? ""))
      writes.push(request.url());
  });
  await page.addInitScript(() => {
    if (!localStorage.getItem("sealed.lang")) localStorage.setItem("sealed.lang", "vi");
  });
  await page.goto(base);
  await page.getByRole("heading", { level: 1 }).waitFor();
  assert.match((await page.locator("h1").textContent()) ?? "", /Bạn giữ quyền/);
  await page.getByText("Hiện chưa lấy được dữ liệu trực tiếp.", { exact: true }).waitFor();
  assert.equal(await page.locator(".metric-loading").count(), 4);
  await page.getByRole("button", { name: "Trong uỷ quyền", exact: true }).click();
  assert.match((await page.getByRole("status").first().textContent()) ?? "", /có thể vào block/);
  await page.getByRole("button", { name: "Ngoài uỷ quyền", exact: true }).click();
  assert.match((await page.getByRole("status").first().textContent()) ?? "", /Node từ chối/);
  await page.getByRole("button", { name: "Dừng hiệu ứng" }).click();
  assert.equal(await page.locator("[data-motion]").getAttribute("data-motion"), "paused");
  await page.waitForFunction(() =>
    document.getAnimations().every((animation) => animation.playState !== "running"),
  );
  await page.getByRole("button", { name: "Bật hiệu ứng" }).click();
  await page.getByRole("button", { name: "EN", exact: true }).click();
  assert.match((await page.locator("h1").textContent()) ?? "", /Keep control/);
  await page.reload();
  assert.match((await page.locator("h1").textContent()) ?? "", /Keep control/);
  assert.equal(await page.locator("html").getAttribute("lang"), "en");
  const card = page.locator(".sealed-card");
  assert.doesNotMatch((await card.textContent()) ?? "", /\bREFUSED\b|[Rr]efused before a block/);
  const help = page.locator(".metric-help");
  await help.getByLabel("About survival").click();
  await page.keyboard.press("Escape");
  assert.equal(await help.getAttribute("open"), null);
  await help.getByLabel("About survival").click();
  await page.locator("#live-title").click();
  assert.equal(await help.getAttribute("open"), null);
  for (const lang of ["VI", "EN"]) {
    await page.getByRole("button", { name: lang, exact: true }).click();
    for (const width of [360, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      const overflows = await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      );
      assert.equal(overflows, false, `${lang} overflows at ${width}px`);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator(".landing-mobile-menu summary").click();
  assert.equal(await page.getByRole("link", { name: "Business", exact: true }).isVisible(), true);
  await page.getByRole("link", { name: "How it works", exact: true }).click();
  assert.equal(await page.locator(".landing-mobile-menu").getAttribute("open"), null);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const runningAnimations = await page.evaluate(
    () => document.getAnimations().filter((animation) => animation.playState === "running").length,
  );
  assert.equal(runningAnimations, 0, "reduced motion stops decorative animation");
  assert.equal(
    await page
      .getByRole("link", { name: "Try to break it", exact: true })
      .first()
      .getAttribute("href"),
    "/arena",
  );
  assert.equal(
    await page.getByRole("link", { name: "Full results", exact: true }).getAttribute("href"),
    "/compare",
  );
  for (const path of ["/", "/arena", "/arena/rules", "/compare", "/business", "/console"]) {
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(base + path);
      await page.locator("h1").waitFor();
      assert.equal(await page.locator(".network-badge").isVisible(), true);
      assert.ok(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        `${path} overflows at ${width}`,
      );
    }
  }
  assert.deepEqual(writes, [], "the illustration must not send transactions");
  assert.deepEqual(errors, [], "no browser runtime errors");
  console.log(
    "PASS: unavailable data, VI/EN, language persistence, illustration controls, pause, mobile menu, 10 responsive layouts, reduced motion, links, no transaction writes, no runtime errors",
  );
} finally {
  await browser.close();
  server.close();
}
