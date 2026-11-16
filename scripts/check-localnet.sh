#!/usr/bin/env bash
# Checks that need a running local network (the quick check, scripts/check.sh, does not).
# Builds nothing: run chain/scripts/fetch.sh and chain/scripts/build.sh first.
#   1. fresh 3-node network (down, then up)
#   2. smoke test, seed the test agent
#   3. leaked-key attack suite (services/attacks)
#   4. x402 signed-native-tx end to end (services/attacks/src/x402.ts)
#   5. ArenaRecorder: deploy, fund a fresh agent through it, leaked-key suite on it, checkpoint (services/attacks/src/arena.ts)
#   6. rule script (chain/tests/rule/run.sh)
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
  "arena|bash scripts/forge.sh build >/dev/null && pnpm --filter attacks run --silent arena"
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
