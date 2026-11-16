// Small helpers to run the facilitator, sellers and test pages in-process over real HTTP.
import type { AddressInfo } from "node:net";
import { serve } from "@hono/node-server";

export type Server = { url: string; close: () => void };

/** Serves `fetch` on 127.0.0.1; port 0 picks a free port. */
export function listen(
  fetch: (r: Request) => Response | Promise<Response>,
  port = 0,
): Promise<Server> {
  return new Promise((resolve) => {
    const s = serve({ fetch, port, hostname: "127.0.0.1" }, (info: AddressInfo) => {
      resolve({ url: `http://127.0.0.1:${info.port}`, close: () => s.close() });
    });
  });
}
