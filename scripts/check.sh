#!/usr/bin/env bash
# Quick check for the whole repo. Runs every step in order, stops at the first failure,
# and prints one summary line per step. Exit code is 0 only when every step that ran passed.
# Usage: bash scripts/check.sh
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT" || exit 1

STEPS=(
  "typecheck|pnpm run --silent typecheck"
  "lint|pnpm run --silent lint"
  "test-ts|pnpm run --silent test"
  "forge-build|bash scripts/forge.sh build"
  "forge-test|bash scripts/forge.sh test"
  "chain-test|bash chain/scripts/test.sh"
)

declare -a RESULTS=()
failed=0

prepare() {
  if [ ! -d node_modules ]; then
    echo "==> pnpm install --frozen-lockfile"
    pnpm install --frozen-lockfile || return 1
  fi
  if [ ! -f contracts/lib/forge-std/src/Test.sol ]; then
    echo "==> git submodule update --init --recursive"
    git submodule update --init --recursive || return 1
  fi
}

if ! prepare; then
  echo "check: preparing dependencies failed" >&2
  exit 1
fi

for entry in "${STEPS[@]}"; do
  name="${entry%%|*}"
  cmd="${entry#*|}"

  if [ "$failed" -ne 0 ]; then
    RESULTS+=("$name|NOT RUN (stopped after first failure)")
    continue
  fi

  if [ "$name" = "chain-test" ] && [ ! -f chain/scripts/test.sh ]; then
    RESULTS+=("$name|N/A (chain/scripts/test.sh does not exist yet)")
    continue
  fi

  echo "==> $name: $cmd"
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
  printf '  %-12s %s\n' "${r%%|*}" "${r#*|}"
done

exit "$failed"
