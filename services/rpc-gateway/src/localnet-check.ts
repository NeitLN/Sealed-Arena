// The gateway in front of the local Sealed L1 (scripts/localnet.sh up + seed): a forbidden payment
// sent through it is refused by the node and recorded with the rule's reason; a debug method is
// refused; the store holds no client IP. Test keys only.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serve } from "@hono/node-server";
import { CHAIN_ID, LOCAL_AGENT } from "@sealed-arena/shared";
import { createWalletClient, defineChain, http, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createGatewayApp } from "./app.js";
import { sqliteStore } from "./store.js";

async function main() {
  const { execFileSync } = await import("node:child_process");
  const state = JSON.parse(
    execFileSync("docker", ["exec", "sealed-node", "cat", "/data/sealed.json"], {
      encoding: "utf8",
    }),
  );
  const nodeRpc = `http://127.0.0.1:9650${state.rpcPath as string}`;
  const dir = mkdtempSync(join(tmpdir(), "gateway-check-"));
  const store = await sqliteStore(join(dir, "attempts.db"));
  const app = createGatewayApp({
    store,
    ipSalt: "localnet-check-salt",
    trustProxy: true,
    upstream: async (req) =>
      (
        await fetch(nodeRpc, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(req),
        })
      ).json(),
  });
  const server = serve({ fetch: app.fetch, port: 4051, hostname: "127.0.0.1" });
  const url = "http://127.0.0.1:4051/";
  const checks: Array<[string, boolean, string]> = [];
  try {
    const chain = defineChain({
      id: CHAIN_ID,
      name: "Sealed",
      nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
      rpcUrls: { default: { http: [url] } },
    });
    const agent = createWalletClient({
      account: privateKeyToAccount(LOCAL_AGENT.privateKey),
      chain,
      transport: http(url, { fetchOptions: { headers: { "x-forwarded-for": "198.51.100.77" } } }),
    });
    let refused = "";
    try {
      await agent.sendTransaction({
        to: "0x000000000000000000000000000000000000dEaD",
        value: parseEther("1"),
        gas: 21_000n,
      });
    } catch (e) {
      refused = e instanceof Error ? e.message : String(e);
    }
    const [a] = await store.recent(1);
    checks.push([
      "forbidden payment refused by the node",
      /agent: payee not allowed/.test(refused),
      refused.split("\n").find((l) => l.includes("agent:")) ?? "",
    ]);
    checks.push([
      "attempt recorded with the rule's reason",
      a?.reason === "agent: payee not allowed" && a.from === LOCAL_AGENT.address,
      JSON.stringify(a),
    ]);
    const dbg = (await (
      await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "debug_traceBlockByNumber",
          params: ["latest"],
        }),
      })
    ).json()) as { error?: { code: number } };
    checks.push(["debug_* refused", dbg.error?.code === -32601, JSON.stringify(dbg.error)]);
    checks.push([
      "no client IP stored",
      !JSON.stringify(await store.dump()).includes("198.51.100.77"),
      "",
    ]);
  } finally {
    server.close();
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
  for (const [name, ok, detail] of checks)
    console.log(`${ok ? "ok " : "!! "} ${name}${detail ? `: ${detail}` : ""}`);
  const failed = checks.filter((c) => !c[1]).length;
  console.log(`gateway: ${failed ? "FAIL" : "PASS"}`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error("gateway: FAIL:", e instanceof Error ? e.message : e);
  process.exit(1);
});
