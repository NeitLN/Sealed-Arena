// HTTP proxy in front of the Sealed L1 node for the ICM relayer (icm-relayer v1.8.4).
//
// At start the relayer reads eth_getChainConfig and decodes every entry of
// upgrades.precompileUpgrades with the upstream Subnet-EVM registry. It does not know the Sealed
// precompiles, so once agentRuleV2Config is scheduled (docs/RUNBOOK.md 7.1) it fails with "failed
// to fetch chain config" and restarts forever. This proxy passes every request through unchanged
// and, in eth_getChainConfig answers only, drops the precompile upgrades of the Sealed precompiles.
// The relayer reads only the Warp config there, which is kept as is.
//
// Run with Node 24 (type stripping, no dependencies):
//   node services/fuji-ops/src/chain-config-proxy.ts   # PROXY_LISTEN=127.0.0.1:9660 PROXY_TARGET=http://127.0.0.1:9650
import { createServer, request } from "node:http";

/** Precompile config keys of this project, unknown to upstream tools. */
export const SEALED_PRECOMPILE_KEYS = ["agentPolicyConfig", "agentRuleV2Config"];

type JsonRpc = { id?: unknown; method?: string; result?: unknown };

/** A chain config without the precompile upgrades of the Sealed precompiles. */
export function stripSealedUpgrades(config: unknown): unknown {
  if (!config || typeof config !== "object") return config;
  const c = config as { upgrades?: { precompileUpgrades?: Record<string, unknown>[] } };
  const list = c.upgrades?.precompileUpgrades;
  if (!Array.isArray(list)) return config;
  return {
    ...c,
    upgrades: {
      ...c.upgrades,
      precompileUpgrades: list.filter(
        (u) => !Object.keys(u ?? {}).some((k) => SEALED_PRECOMPILE_KEYS.includes(k)),
      ),
    },
  };
}

/**
 * The response body to return for `requestBody`: unchanged, except the results of
 * eth_getChainConfig calls (single or batch), matched by id.
 */
export function rewriteResponse(requestBody: string, responseBody: string): string {
  let req: JsonRpc | JsonRpc[];
  let res: JsonRpc | JsonRpc[];
  try {
    req = JSON.parse(requestBody);
    res = JSON.parse(responseBody);
  } catch {
    return responseBody;
  }
  const calls = Array.isArray(req) ? req : [req];
  const ids = new Set(
    calls.filter((r) => r?.method === "eth_getChainConfig").map((r) => JSON.stringify(r.id)),
  );
  if (ids.size === 0) return responseBody;
  const fix = (r: JsonRpc) =>
    r && ids.has(JSON.stringify(r.id)) && "result" in r
      ? { ...r, result: stripSealedUpgrades(r.result) }
      : r;
  return JSON.stringify(Array.isArray(res) ? res.map(fix) : fix(res));
}

function main() {
  const [host, port] = (process.env.PROXY_LISTEN ?? "127.0.0.1:9660").split(":");
  const target = new URL(process.env.PROXY_TARGET ?? "http://127.0.0.1:9650");
  createServer((inReq, inRes) => {
    const chunks: Buffer[] = [];
    inReq.on("data", (c: Buffer) => chunks.push(c));
    inReq.on("end", () => {
      const body = Buffer.concat(chunks);
      const out = request(
        {
          hostname: target.hostname,
          port: target.port,
          path: inReq.url,
          method: inReq.method,
          headers: { ...inReq.headers, host: target.host },
        },
        (res) => {
          const parts: Buffer[] = [];
          res.on("data", (c: Buffer) => parts.push(c));
          res.on("end", () => {
            const text = rewriteResponse(
              body.toString("utf8"),
              Buffer.concat(parts).toString("utf8"),
            );
            const headers = { ...res.headers };
            delete headers["content-length"];
            delete headers["transfer-encoding"];
            inRes.writeHead(res.statusCode ?? 502, headers);
            inRes.end(text);
          });
        },
      );
      out.on("error", () => {
        inRes.writeHead(502);
        inRes.end();
      });
      out.end(body);
    });
  }).listen(Number(port), host, () =>
    console.log(`chain-config-proxy on ${host}:${port} -> ${target.origin}`),
  );
}

if (process.argv[1]?.endsWith("chain-config-proxy.ts")) main();
