// Load test: 50 open /arena tabs at once (people at one event, behind one IP).
// Each virtual user polls what the page polls: GET /state every 5 s and the attempts summary every
// 5 s, for 2 minutes. Reads only; no transaction is sent.
//   MSYS_NO_PATHCONV=1 docker run --rm -i grafana/k6:0.57.0 run - < infra/load/arena.k6.js
//   (GATEWAY=https://... to point elsewhere: docker run -e GATEWAY=...)

import { check, sleep } from "k6";
import http from "k6/http";

const GATEWAY = __ENV.GATEWAY || "https://sealed-arena.duckdns.org";
const AGENT = "0x30b01562945BB3cE72241b0EaaEB3F41660982F6";

export const options = {
  vus: 50,
  duration: "2m",
  thresholds: {
    http_req_failed: ["rate<0.01"],
    "http_req_duration{name:state}": ["p(95)<1000"],
    "http_req_duration{name:summary}": ["p(95)<1000"],
  },
};

export default function () {
  const s = http.get(`${GATEWAY}/state`, { tags: { name: "state" } });
  check(s, { "state 200": (r) => r.status === 200 });
  const a = http.get(`${GATEWAY}/attempts/summary?from=${AGENT}`, { tags: { name: "summary" } });
  check(a, { "summary 200": (r) => r.status === 200 });
  sleep(5);
}
