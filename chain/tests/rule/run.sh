#!/usr/bin/env bash
# T05 check of the agent rule on a running local network (patched image, genesis with
# AgentPolicy enabled):
#   bash chain/scripts/fetch.sh && bash chain/scripts/build.sh
#   bash scripts/localnet.sh up && bash chain/tests/rule/run.sh
#
# A fresh random agent is registered and given a mandate each run, then:
#   1. a payment inside the mandate is included and charged value + gasLimit * gasPrice;
#   2. stranger, contract creation, over perTxCap and a precompile payee are rejected
#      by the RPC with the rule's error;
#   3. freeze makes the next payment fail; unfreeze lets it through again;
#   4. 8 payments sent at once, more than the daily budget: only what fits is included;
#   5. invariant balance(agent) >= funded - totalCharged holds.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
FOUNDRY_IMAGE="ghcr.io/foundry-rs/foundry:v1.9.0@sha256:3a392c18f9b16e665e932de159fb6fa9ed972c4b4352f2f76a1a8c7ca9b57d39"
DOCKER_NETWORK="sealed-localnet_default"
ADMIN="$ROOT/packages/shared/scripts/agent-admin.mjs"

# Local-only keys. ewoq funds the test and relays owner actions.
DEV_KEY="0x56289e99c94b6912bfc12adc093c9b51124f0dc54ac7a766b2bc5ccf558d8027"
rand32() { echo "0x$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')"; }
rand20() { echo "0x$(head -c 20 /dev/urandom | od -An -tx1 | tr -d ' \n')"; }

HOST_RPC="$(bash "$ROOT/scripts/localnet.sh" rpc)"
RPC="http://sealed-node:9650${HOST_RPC#http://127.0.0.1:9650}"
cast() { MSYS_NO_PATHCONV=1 docker run --rm --network "$DOCKER_NETWORK" --entrypoint cast "$FOUNDRY_IMAGE" "$@"; }

export RPC_URL="$HOST_RPC" RELAYER_KEY="$DEV_KEY" AGENT_KEY OWNER_P256_KEY
AGENT_KEY="$(rand32)"
OWNER_P256_KEY="$(rand32)"
AGENT="$(cast wallet address --private-key "$AGENT_KEY")"
PAYEE="$(rand20)"
STRANGER="$(rand20)"
admin() { node "$ADMIN" "$@"; }
field() { sed -n "s/.*\"$1\":\"\{0,1\}\([^\",]*\)\"\{0,1\}.*/\1/p"; }

# EIP-1559 payments with a 50 gwei fee cap and a 1 gwei tip: the charge (value + gasLimit x fee
# cap) is exact, and the tip is within agent rule v2's cap, so the script runs under v1 and v2.
GAS_PRICE=50000000000
TIP=1000000000
VALUE=1000
CHARGE=$((VALUE + 21000 * GAS_PRICE))
FUNDED=10000000000000000000 # 10 coins

failures=0
pass() { echo "  PASS  $*"; }
fail() { echo "  FAIL  $*"; failures=$((failures + 1)); }

pay() { # pay <to> <value> [nonce] -> prints receipt status or the RPC error
  local args=(--gas-price "$GAS_PRICE" --priority-gas-price "$TIP" --gas-limit "${GAS:-21000}" --private-key "$AGENT_KEY" --rpc-url "$RPC")
  [ -n "${3:-}" ] && args+=(--nonce "$3")
  cast send "$1" --value "$2" "${args[@]}" --json 2>&1 | sed -n 's/.*"status":"\([^"]*\)".*/\1/p; s/.*\(agent: [a-z ]*\).*/\1/p' | head -n1
}
expect_reject() { # expect_reject <label> <error> <output>
  if [ "$3" = "$2" ]; then pass "$1: rejected ($2)"; else fail "$1: got '$3', want '$2'"; fi
}

echo "==> rpc $HOST_RPC, agent $AGENT"
[ "$(cast chain-id --rpc-url "$RPC")" = "261126" ] || { echo "rule: wrong chain id"; exit 1; }
cast send "$AGENT" --value "$FUNDED" --private-key "$DEV_KEY" --rpc-url "$RPC" >/dev/null
# The genesis enables TxAllowList; the admin (DEV_KEY) lets the new agent send.
cast send 0x0200000000000000000000000000000000000002 "setEnabled(address)" "$AGENT" --private-key "$DEV_KEY" --rpc-url "$RPC" >/dev/null
admin register >/dev/null
admin set-mandate "{\"payees\":[\"$PAYEE\"],\"perTxCap\":\"$((2 * CHARGE))\",\"dailyCap\":\"$((5 * CHARGE))\",\"expiry\":\"4102444800\"}" >/dev/null
[ "$(admin show | field registered)" = "true" ] && pass "agent registered with a mandate" || fail "agent not registered"

echo "==> 1. payment inside the mandate"
status="$(pay "$PAYEE" "$VALUE")"
spent="$(admin show | field spentToday)"
[ "$status" = "0x1" ] && [ "$spent" = "$CHARGE" ] && pass "included, spentToday = value + 21000 x gasPrice = $CHARGE" \
  || fail "status '$status', spentToday '$spent', want $CHARGE"

echo "==> 2. forbidden payments"
expect_reject "stranger" "agent: payee not allowed" "$(pay "$STRANGER" "$VALUE")"
expect_reject "over perTxCap" "agent: budget exceeded" "$(pay "$PAYEE" "$((2 * CHARGE))")"
expect_reject "precompile as payee" "agent: payee not allowed" "$(pay 0x0300000000000000000000000000000000000001 0)"
# cast wants --create after every other option
raw="$(cast mktx --gas-price "$GAS_PRICE" --priority-gas-price "$TIP" --gas-limit 100000 \
  --private-key "$AGENT_KEY" --rpc-url "$RPC" --create 0x600060005360016000f3)"
out="$(cast publish --async --rpc-url "$RPC" "$raw" 2>&1 | grep -o 'agent: [a-z ]*' | head -n1 || true)"
expect_reject "contract creation" "agent: contract creation not allowed" "$out"

echo "==> 3. freeze and unfreeze"
admin freeze >/dev/null
expect_reject "payment while frozen" "agent: frozen" "$(pay "$PAYEE" "$VALUE")"
admin unfreeze >/dev/null
[ "$(pay "$PAYEE" "$VALUE")" = "0x1" ] && pass "payment after unfreeze included" || fail "payment after unfreeze"

echo "==> 4. 8 payments at once, daily budget left for 3"
nonce="$(cast nonce "$AGENT" --rpc-url "$RPC")"
accepted=0
for i in 0 1 2 3 4 5 6 7; do
  raw="$(cast mktx "$PAYEE" --value "$VALUE" --gas-price "$GAS_PRICE" --priority-gas-price "$TIP" --gas-limit 21000 \
    --nonce "$((nonce + i))" --private-key "$AGENT_KEY" --rpc-url "$RPC")"
  if out="$(cast publish --async --rpc-url "$RPC" "$raw" 2>&1)"; then
    accepted=$((accepted + 1))
  elif ! grep -q 'agent: budget exceeded' <<<"$out"; then
    fail "payment $i rejected for another reason: $(tail -n1 <<<"$out")"
  fi
done
echo "  pool accepted $accepted of 8"
for _ in 1 2 3; do cast send "$(rand20)" --value 1 --private-key "$DEV_KEY" --rpc-url "$RPC" >/dev/null; done
included=$(( $(cast nonce "$AGENT" --rpc-url "$RPC") - nonce ))
spent="$(admin show | field spentToday)"
[ "$included" = 3 ] && pass "3 of 8 included" || fail "$included of 8 included, want 3"
[ "$spent" = "$((5 * CHARGE))" ] && pass "spentToday = dailyCap" || fail "spentToday $spent, dailyCap $((5 * CHARGE))"

echo "==> 5. invariant"
balance="$(cast balance "$AGENT" --rpc-url "$RPC")"
total="$(admin show | field totalCharged)"
node -e 'process.exit(BigInt(process.argv[1]) >= BigInt(process.argv[2]) - BigInt(process.argv[3]) ? 0 : 1)' "$balance" "$FUNDED" "$total" \
  && pass "balance $balance >= funded - totalCharged ($total)" || fail "invariant broken: balance $balance, totalCharged $total"
[ "$(cast balance "$STRANGER" --rpc-url "$RPC")" = "0" ] && pass "stranger received nothing" || fail "stranger received funds"

if [ "$failures" -eq 0 ]; then
  echo "rule: PASS"
else
  echo "rule: FAIL ($failures failures)"
  exit 1
fi
