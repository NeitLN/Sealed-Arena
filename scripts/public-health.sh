#!/usr/bin/env bash
# Checks the public endpoints of the Fuji deployment from outside, one line per check (PASS/FAIL).
# No keys. Run by .github/workflows/health.yml on a schedule: a failing run is the alert.
# Usage: bash scripts/public-health.sh
set -u
RPC="${HEALTH_RPC:-https://sealed-arena.duckdns.org/rpc}"
RELAYER="${HEALTH_RELAYER:-https://sealed-arena.duckdns.org/relayer/info}"
GATEWAY="${HEALTH_GATEWAY:-https://sealed-arena.duckdns.org}"
SITE="${HEALTH_SITE:-https://sealed-arena.vercel.app}"
fails=0
check() { # check <name> <ok 0|1> <detail>
  if [ "$2" = 0 ]; then echo "PASS  $1: $3"; else echo "FAIL  $1: $3"; fails=$((fails + 1)); fi
}
post() { curl -s -m 15 -X POST -H 'content-type: application/json' --data "$1" "$RPC"; }

id="$(post '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' | sed -n 's/.*"result":"\([^"]*\)".*/\1/p')"
[ "$id" = "0x3fc06" ]; check rpc $? "eth_chainId ${id:-none}"

# A block in the last 24 hours would be too strict (the chain is idle when nobody pays), so only
# check that the head is readable and has a timestamp.
ts="$(post '{"jsonrpc":"2.0","id":2,"method":"eth_getBlockByNumber","params":["latest",false]}' | sed -n 's/.*"timestamp":"\(0x[0-9a-f]*\)".*/\1/p')"
[ -n "$ts" ]; check head $? "latest block timestamp ${ts:-none}"

info="$(curl -s -m 15 "$RELAYER")"
grep -q '"chainId":261126' <<<"$info"; check relayer $? "$(sed -n 's/.*"ruleVersion":\([0-9]*\).*/ruleVersion \1/p' <<<"$info")"

state="$(curl -s -m 15 "$GATEWAY/state")"
if grep -q '"registered":true' <<<"$state"; then
  grep -q '"breached":false' <<<"$state"; check challenge $? "registered, breached $(grep -o '"breached":[a-z]*' <<<"$state")"
else
  sum="$(curl -s -m 15 "$GATEWAY/attempts/summary")"
  grep -q '"total"' <<<"$sum"; check gateway $? "attempts summary readable (no /state yet)"
fi

code="$(curl -s -o /dev/null -m 20 -w '%{http_code}' "$SITE/")"
[ "$code" = 200 ]; check site $? "$SITE/ HTTP $code"

echo "public-health: $([ $fails = 0 ] && echo PASS || echo "FAIL ($fails)")"
exit $fails
