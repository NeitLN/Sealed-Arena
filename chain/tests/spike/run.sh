#!/usr/bin/env bash
# T02 spike check on a running local network built from the patched image:
#   bash chain/scripts/fetch.sh && bash chain/scripts/build.sh
#   bash scripts/localnet.sh up && bash chain/tests/spike/run.sh
#
# 1. The spike agent pays the allowed payee: included, payee balance grows.
# 2. Every forbidden variant is rejected by the RPC with the spike error:
#    legacy, access-list (EIP-2930), dynamic-fee (EIP-1559), contract creation,
#    a very high fee, several transactions sharing one nonce, and a future nonce.
#    Blob (EIP-4844) and set-code (EIP-7702) types are also tried; they must be
#    rejected for some reason and never included.
# 3. More blocks are produced; none of the forbidden hashes is found on chain,
#    the agent nonce only counts the allowed payments, and no stranger got funds.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
FOUNDRY_IMAGE="ghcr.io/foundry-rs/foundry:v1.9.0@sha256:3a392c18f9b16e665e932de159fb6fa9ed972c4b4352f2f76a1a8c7ca9b57d39"
DOCKER_NETWORK="sealed-localnet_default"

# Local-only keys. ewoq funds the test; 0x...01 is the spike agent hard-coded in the patch.
DEV_KEY="0x56289e99c94b6912bfc12adc093c9b51124f0dc54ac7a766b2bc5ccf558d8027"
AGENT_KEY="0x0000000000000000000000000000000000000000000000000000000000000001"
AGENT="0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf"
PAYEE="0x2B5AD5c4795c026514f8317c7a215E218DcCD6cF"
SPIKE_ERR="spike agent: payee not allowed"

host_url="$(bash "$ROOT/scripts/localnet.sh" rpc)"
RPC="http://sealed-node:9650${host_url#http://127.0.0.1:9650}"

cast() {
  MSYS_NO_PATHCONV=1 docker run --rm --network "$DOCKER_NETWORK" --entrypoint cast "$FOUNDRY_IMAGE" "$@"
}

failures=0
pass() { echo "  PASS  $*"; }
fail() { echo "  FAIL  $*"; failures=$((failures + 1)); }

random_addr() { echo "0x$(head -c 20 /dev/urandom | od -An -tx1 | tr -d ' \n')"; }

# send_raw <label> <expect: spike|any> <raw tx> : the RPC must refuse the transaction.
FORBIDDEN_HASHES=()
send_raw() {
  local label="$1" expect="$2" raw="$3" out hash
  hash="$(cast keccak "$raw")"
  FORBIDDEN_HASHES+=("$hash")
  if out="$(cast publish --async --rpc-url "$RPC" "$raw" 2>&1)"; then
    fail "$label: RPC accepted it ($out)"
  elif [ "$expect" = "spike" ] && ! grep -q "$SPIKE_ERR" <<<"$out"; then
    fail "$label: rejected for another reason: $(tail -n1 <<<"$out")"
  else
    pass "$label: rejected ($(grep -o "$SPIKE_ERR[^\"]*" <<<"$out" | head -n1 || tail -n1 <<<"$out"))"
  fi
}

mktx() { cast mktx --rpc-url "$RPC" --private-key "$AGENT_KEY" "$@"; }

# typed <want: 0|1|2> <raw>: echo raw after checking its EIP-2718 type (legacy = RLP list, 0xc0..0xff).
typed() {
  local want="$1" raw="$2" first="${2:2:2}"
  case "$want" in
    0) [[ "$first" =~ ^[c-f][0-9a-f]$ ]] ;;
    *) [ "$first" = "0$want" ] ;;
  esac || { echo "spike: built tx has type byte $first, expected type $want" >&2; exit 1; }
  echo "$raw"
}

echo "==> rpc $RPC"
[ "$(cast chain-id --rpc-url "$RPC")" = "261126" ] || { echo "spike: wrong chain id"; exit 1; }

echo "==> funding the agent"
cast send "$AGENT" --value 10ether --private-key "$DEV_KEY" --rpc-url "$RPC" >/dev/null

echo "==> allowed: agent pays the payee"
payee_before="$(cast balance "$PAYEE" --rpc-url "$RPC")"
status="$(cast send "$PAYEE" --value 1000 --private-key "$AGENT_KEY" --rpc-url "$RPC" --json |
  sed -n 's/.*"status":"\([^"]*\)".*/\1/p')"
payee_after="$(cast balance "$PAYEE" --rpc-url "$RPC")"
if [ "$status" = "0x1" ] && [ "$payee_after" = "$((payee_before + 1000))" ]; then
  pass "allowed payment included, payee +1000 wei"
else
  fail "allowed payment: status '$status', payee $payee_before -> $payee_after"
fi

agent_nonce="$(cast nonce "$AGENT" --rpc-url "$RPC")"
agent_balance="$(cast balance "$AGENT" --rpc-url "$RPC")"
latest_before="$(cast block-number --rpc-url "$RPC")"

echo "==> forbidden transactions (nonce $agent_nonce)"
S1="$(random_addr)"; S2="$(random_addr)"; S3="$(random_addr)"; S4="$(random_addr)"
STRANGERS=("$S1" "$S2" "$S3" "$S4")
send_raw "legacy (type 0) to stranger" spike "$(typed 0 "$(mktx --legacy --nonce "$agent_nonce" --value 1 "$S1")")"
send_raw "access-list (EIP-2930, type 1) to stranger" spike "$(typed 1 "$(mktx --legacy --access-list '[]' --nonce "$agent_nonce" --gas-price 30gwei --value 1 "$S1")")"
send_raw "dynamic-fee (EIP-1559, type 2) to stranger" spike "$(typed 2 "$(mktx --nonce "$agent_nonce" --value 1 "$S1")")"
send_raw "contract creation" spike "$(mktx --nonce "$agent_nonce" --create 0x600060005360016000f3)"
send_raw "very high fee (500 gwei, 50 gwei tip)" spike "$(mktx --nonce "$agent_nonce" --gas-price 500gwei --priority-gas-price 50gwei --value 1 "$S2")"
send_raw "same nonce, copy 1" spike "$(mktx --nonce "$agent_nonce" --value 2 "$S3")"
send_raw "same nonce, copy 2" spike "$(mktx --nonce "$agent_nonce" --value 3 "$S4")"
send_raw "future nonce (queued slot)" spike "$(mktx --nonce "$((agent_nonce + 5))" --value 1 "$S1")"

if raw="$(mktx --blob --nonce "$agent_nonce" --value 1 "$S1" 2>/dev/null)"; then
  send_raw "blob (EIP-4844) to stranger" any "$raw"
else
  pass "blob (EIP-4844): could not even be built against this chain"
fi
if raw="$(mktx --auth "$S2" --nonce "$agent_nonce" --value 1 "$S1" 2>/dev/null)"; then
  send_raw "set-code (EIP-7702) to stranger" any "$raw"
else
  pass "set-code (EIP-7702): could not even be built against this chain"
fi

echo "==> producing more blocks with unrelated transfers"
for _ in 1 2 3; do
  cast send "$(random_addr)" --value 1 --private-key "$DEV_KEY" --rpc-url "$RPC" >/dev/null
done
latest_after="$(cast block-number --rpc-url "$RPC")"
[ "$latest_after" -ge "$((latest_before + 3))" ] && pass "chain advanced $latest_before -> $latest_after" \
  || fail "chain did not advance ($latest_before -> $latest_after)"

echo "==> nothing forbidden reached the chain"
known=0
for h in "${FORBIDDEN_HASHES[@]}"; do
  if cast tx "$h" --rpc-url "$RPC" >/dev/null 2>&1; then
    known=1; fail "transaction $h is known to the node"
  fi
done
[ "$known" = 0 ] && pass "none of ${#FORBIDDEN_HASHES[@]} forbidden hashes is known to the node"

# Scan every block since the allowed payment for transactions sent by the agent.
found=0
for ((n = latest_before + 1; n <= latest_after; n++)); do
  if cast block "$n" --full --json --rpc-url "$RPC" | grep -qi "\"from\":\"$AGENT\""; then
    found=1; fail "block $n contains a transaction from the agent"
  fi
done
[ "$found" = 0 ] && pass "blocks $((latest_before + 1))..$latest_after hold no agent transaction"

[ "$(cast nonce "$AGENT" --rpc-url "$RPC")" = "$agent_nonce" ] && pass "agent nonce unchanged ($agent_nonce)" \
  || fail "agent nonce changed"
[ "$(cast balance "$AGENT" --rpc-url "$RPC")" = "$agent_balance" ] && pass "agent balance unchanged" \
  || fail "agent balance changed"
for s in "${STRANGERS[@]}"; do
  [ "$(cast balance "$s" --rpc-url "$RPC")" = "0" ] || fail "stranger $s received funds"
done
pass "no stranger received funds"

if [ "$failures" -eq 0 ]; then
  echo "spike: PASS"
else
  echo "spike: FAIL ($failures failures)"
  exit 1
fi
