#!/usr/bin/env bash
# One validator without the agent rule among three (local network).
#
# Builds the plugin without the rule if it is missing, starts a fresh local network where node 3
# runs it, and runs services/attacks/src/byzantine.ts. The result and the node log lines are
# written to chain/tests/byzantine/results/. The network is left down at the end.
#
# Needs the node image (bash chain/scripts/fetch.sh && bash chain/scripts/build.sh).
# Usage: bash chain/tests/byzantine/run.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
VM_ID="srEXiWaHuhNyGwPUi444Tu47ZEDwxTWrbQiuD7FmgSAQ6X7Dy"

if [ ! -f "$ROOT/chain/build/norule-plugins/$VM_ID" ]; then
  bash "$ROOT/chain/tests/byzantine/build-norule.sh"
fi

bash "$ROOT/scripts/localnet.sh" down >/dev/null 2>&1 || true
SEALED_BYZANTINE=1 bash "$ROOT/scripts/localnet.sh" up
docker logs sealed-node 2>&1 | grep "without the agent rule" || {
  echo "byzantine: node 3 does not run the plugin without the rule" >&2
  exit 1
}

path="$(docker exec sealed-node sh -c 'sed -n "s/.*\"rpcPath\": \"\(.*\)\".*/\1/p" /data/sealed.json')"
status=0
(cd "$ROOT" && SEALED_RPC_PATH="${path#/}" pnpm --filter attacks run --silent byzantine) || status=$?
# BYZANTINE_KEEP=1 leaves the network up to read the node logs.
[ "${BYZANTINE_KEEP:-0}" = "1" ] || bash "$ROOT/scripts/localnet.sh" down >/dev/null 2>&1 || true
exit "$status"
