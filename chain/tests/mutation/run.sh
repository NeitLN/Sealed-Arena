#!/usr/bin/env bash
# Mutation check of the agent rule: each mutation switches off (or weakens) one condition of
# core.CheckAgentTx / checkAgentTxV2 or one step of the spend accounting, runs the agent tests, and
# must make at least one of them fail. The source is restored after each mutation.
# Needs chain/.work from chain/scripts/fetch.sh with no edits outside chain/patches/.
# Usage: bash chain/tests/mutation/run.sh
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
CORE="$ROOT/chain/.work/avalanchego/graft/subnet-evm/core"
bash "$ROOT/chain/scripts/make-patch.sh" --check || {
  echo "mutation: chain/.work has edits outside chain/patches/; run fetch.sh first" >&2
  exit 1
}

# name|file (in core/)|exact text|replacement
MUTATIONS=(
  "transaction type|agent_rule.go|if !tx.Plain {|if false \&\& !tx.Plain {"
  "contract creation|agent_rule.go|if tx.To == nil {\n\t\treturn nil, true, ErrAgentContractCreation|if false \&\& tx.To == nil {\n\t\treturn nil, true, ErrAgentContractCreation"
  "payee list|agent_rule.go|if !slices.Contains(m.Payees, *tx.To) {|if false \&\& !slices.Contains(m.Payees, *tx.To) {"
  "payee has code|agent_rule.go|if state.GetCodeSize(*tx.To) > 0 {|if false \&\& state.GetCodeSize(*tx.To) > 0 {"
  "frozen|agent_rule.go|if frozen {\n\t\treturn nil, true, ErrAgentFrozen|if false \&\& frozen {\n\t\treturn nil, true, ErrAgentFrozen"
  "expiry|agent_rule.go|if timestamp >= m.Expiry {|if timestamp > m.Expiry {"
  "perTxCap|agent_rule.go|if charge.Cmp(m.PerTxCap) > 0 {|if false \&\& charge.Cmp(m.PerTxCap) > 0 {"
  "dailyCap|agent_rule.go|if total := new(big.Int).Add(spent, charge); total.Cmp(m.DailyCap) > 0 {|if total := new(big.Int).Add(spent, charge); total.Cmp(m.DailyCap) > 0 \&\& false {"
  "pooled budget|agent_rule.go|if tx.Reserved != nil \&\& tx.Reserved.Sign() > 0 {|if false \&\& tx.Reserved != nil \&\& tx.Reserved.Sign() > 0 {"
  "charge counts gas|agent_rule.go|\t\tcharge.Mul(charge, tx.GasFeeCap)|\t\tcharge.SetUint64(0)"
  "max fee counts gas|agent_rule.go|new(big.Int).Mul(new(big.Int).SetUint64(tx.GasLimit), tx.GasFeeCap)|new(big.Int)"
  "v2 gas equals intrinsic|agent_rule.go|tx.GasLimit != want {|tx.GasLimit < want {"
  "v2 tip cap|agent_rule.go|tip.Cmp(AgentMaxTip) > 0 {|tip.Cmp(AgentMaxTip) > 0 \&\& false {"
  "v2 daily fee cap|agent_rule.go|total.Cmp(m.DailyFeeCap) > 0 {|total.Cmp(m.DailyFeeCap) > 0 \&\& false {"
)

survived=0
LOG="$(mktemp)"
for entry in "${MUTATIONS[@]}"; do
  IFS='|' read -r name file from to <<<"$entry"
  f="$CORE/$file"
  cp "$f" "$f.orig"
  if ! node "$ROOT/chain/tests/mutation/apply.mjs" "$f" "$from" "$to"; then
    echo "ERROR  $name: mutation does not apply"
    mv "$f.orig" "$f"
    survived=$((survived + 1))
    continue
  fi
  if SEALED_TEST_NO_FETCH=1 SEALED_TEST_RUN='AgentRule|AgentPolicy' bash "$ROOT/chain/scripts/test.sh" >"$LOG" 2>&1; then
    echo "SURVIVED  $name"
    survived=$((survived + 1))
  else
    if grep -q -- '--- FAIL:' "$LOG"; then
      echo "caught    $name ($(grep -m1 -o -- '--- FAIL: [A-Za-z0-9_/]*' "$LOG"))"
    else
      echo "ERROR     $name: no test failed (does the mutation compile?)"
      survived=$((survived + 1))
    fi
  fi
  mv "$f.orig" "$f"
done
bash "$ROOT/chain/scripts/make-patch.sh" --check || { echo "mutation: source not restored" >&2; exit 1; }
echo "mutation: $([ "$survived" = 0 ] && echo PASS || echo "FAIL ($survived survived)") (${#MUTATIONS[@]} mutations)"
exit "$survived"
