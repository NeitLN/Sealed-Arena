#!/usr/bin/env bash
# Checks that need a running local network (the quick check, scripts/check.sh, does not).
# Builds nothing: run chain/scripts/fetch.sh and chain/scripts/build.sh first.
#   1. fresh 3-node network (down, then up)
#   2. smoke test, seed the test agent
#   3. leaked-key attack suite (services/attacks)
#   4. x402 signed-native-tx end to end (services/attacks/src/x402.ts)
#   5. buying agent, replayed from recorded transcripts without an LLM: one live run that ignored the
#      injected instruction, and the scripted run that obeys it (services/agent/transcripts)
#   6. ArenaRecorder: deploy, fund a fresh agent through it, leaked-key suite on it, checkpoint (services/attacks/src/arena.ts)
#   7. owner console in Chromium with a virtual passkey (web/e2e/owner.e2e.ts)
#   8. RPC gateway: forbidden payment recorded with its reason (services/rpc-gateway)
#   9. rule script (chain/tests/rule/run.sh)
# Leaves the network running; stop it with `bash scripts/localnet.sh down`.
# Usage: bash scripts/check-localnet.sh
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT" || exit 1

STEPS=(
  "fresh-network|bash scripts/localnet.sh down >/dev/null 2>&1; bash scripts/localnet.sh up"
  "smoke|bash chain/scripts/smoke.sh"
  "seed|bash scripts/localnet.sh seed"
  "leaked-key|pnpm --filter attacks run --silent leaked-key"
  "x402|pnpm --filter attacks run --silent x402"
  "agent-replay|pnpm --filter agent run --silent scenario --replay transcripts/injection-strong-2026-11-16T22-54-40-264Z.json && pnpm --filter agent run --silent scenario --replay transcripts/scripted-obeys-injection.json"
  "arena|bash scripts/forge.sh build >/dev/null && pnpm --filter attacks run --silent arena"
  "owner-web|pnpm --filter web run --silent e2e"
  "gateway|pnpm --filter rpc-gateway run --silent localnet-check"
  "rule|bash chain/tests/rule/run.sh"
)

declare -a RESULTS=()
failed=0
for entry in "${STEPS[@]}"; do
  name="${entry%%|*}"
  cmd="${entry#*|}"
  if [ "$failed" -ne 0 ]; then
    RESULTS+=("$name|NOT RUN (stopped after first failure)")
    continue
  fi
  echo "==> $name"
  if bash -c "$cmd"; then
    RESULTS+=("$name|PASS")
  else
    RESULTS+=("$name|FAIL")
    failed=1
  fi
done

echo
echo "Summary"
for r in "${RESULTS[@]}"; do
  printf '  %-14s %s\n' "${r%%|*}" "${r#*|}"
done
exit "$failed"
