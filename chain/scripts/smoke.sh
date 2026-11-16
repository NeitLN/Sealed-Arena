#!/usr/bin/env bash
# Smoke test against the running local network (scripts/localnet.sh up):
#   1. eth_chainId is 0x3fc06 (261126)
#   2. the dev account sends 1 native coin to a fresh random address and the receipt succeeds
#   3. the recipient balance is exactly 1 coin (10^18 wei)
# Uses `cast` from the same pinned Foundry image as scripts/forge.sh, on the compose network.
# Usage: bash chain/scripts/smoke.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
FOUNDRY_IMAGE="ghcr.io/foundry-rs/foundry:v1.9.0@sha256:3a392c18f9b16e665e932de159fb6fa9ed972c4b4352f2f76a1a8c7ca9b57d39"
DOCKER_NETWORK="sealed-localnet_default"

# Well-known local development key (the "ewoq" key published in avalanchego).
# Admin of the allow-lists in chain/genesis/sealed-local.json. Never use it on any public network.
DEV_KEY="0x56289e99c94b6912bfc12adc093c9b51124f0dc54ac7a766b2bc5ccf558d8027"
AMOUNT_WEI="1000000000000000000"

host_url="$(bash "$ROOT/scripts/localnet.sh" rpc)"
rpc="http://sealed-node:9650${host_url#http://127.0.0.1:9650}"

cast() {
  MSYS_NO_PATHCONV=1 docker run --rm --network "$DOCKER_NETWORK" --entrypoint cast "$FOUNDRY_IMAGE" "$@"
}

fail() { echo "smoke: FAIL: $*" >&2; exit 1; }

chain_id="$(cast chain-id --rpc-url "$rpc")"
[ "$chain_id" = "261126" ] || fail "chain id is $chain_id, expected 261126"
echo "==> chain id $chain_id"

recipient="0x$(head -c 20 /dev/urandom | od -An -tx1 | tr -d ' \n')"
before="$(cast balance "$recipient" --rpc-url "$rpc")"
[ "$before" = "0" ] || fail "fresh recipient $recipient already has balance $before"

echo "==> sending $AMOUNT_WEI wei to $recipient"
status="$(cast send "$recipient" --value "$AMOUNT_WEI" --private-key "$DEV_KEY" \
  --rpc-url "$rpc" --json | sed -n 's/.*"status":"\([^"]*\)".*/\1/p')"
[ "$status" = "0x1" ] || fail "receipt status is '$status', expected 0x1"

after="$(cast balance "$recipient" --rpc-url "$rpc")"
[ "$after" = "$AMOUNT_WEI" ] || fail "recipient balance is $after, expected $AMOUNT_WEI"

echo "smoke: PASS (chain id 261126, transfer included, recipient balance $after wei)"
