#!/usr/bin/env bash
# Mutation check of the agent rule: each mutation switches off (or weakens) one condition of
# core.CheckAgentTx / checkAgentTxV2, one step of the spend accounting, or one check of rule v3
# (activation, strict owner proofs, mandate timelock, guardian, sweep), runs the agent tests, and
# must make at least one of them fail. The source is restored after each mutation.
# Needs chain/.work from chain/scripts/fetch.sh with no edits outside chain/patches/.
# Usage: bash chain/tests/mutation/run.sh
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
EVM="$ROOT/chain/.work/avalanchego/graft/subnet-evm"
bash "$ROOT/chain/scripts/make-patch.sh" --check || {
  echo "mutation: chain/.work has edits outside chain/patches/; run fetch.sh first" >&2
  exit 1
}

# name|file (in graft/subnet-evm/)|exact text|replacement (no "|" in the texts)
MUTATIONS=(
  "transaction type|core/agent_rule.go|if !tx.Plain {|if false \&\& !tx.Plain {"
  "contract creation|core/agent_rule.go|if tx.To == nil {\n\t\treturn nil, true, ErrAgentContractCreation|if false \&\& tx.To == nil {\n\t\treturn nil, true, ErrAgentContractCreation"
  "payee list|core/agent_rule.go|if !slices.Contains(m.Payees, *tx.To) {|if false \&\& !slices.Contains(m.Payees, *tx.To) {"
  "payee has code|core/agent_rule.go|if state.GetCodeSize(*tx.To) > 0 {|if false \&\& state.GetCodeSize(*tx.To) > 0 {"
  "frozen|core/agent_rule.go|if frozen {\n\t\treturn nil, true, ErrAgentFrozen|if false \&\& frozen {\n\t\treturn nil, true, ErrAgentFrozen"
  "expiry|core/agent_rule.go|if timestamp >= m.Expiry {|if timestamp > m.Expiry {"
  "perTxCap|core/agent_rule.go|if charge.Cmp(m.PerTxCap) > 0 {|if false \&\& charge.Cmp(m.PerTxCap) > 0 {"
  "dailyCap|core/agent_rule.go|if total := new(big.Int).Add(spent, charge); total.Cmp(m.DailyCap) > 0 {|if total := new(big.Int).Add(spent, charge); total.Cmp(m.DailyCap) > 0 \&\& false {"
  "pooled budget|core/agent_rule.go|if res.Charge.Sign() > 0 {|if false \&\& res.Charge.Sign() > 0 {"
  "charge counts gas|core/agent_rule.go|\t\tcharge.Mul(charge, tx.GasFeeCap)|\t\tcharge.SetUint64(0)"
  "max fee counts gas|core/agent_rule.go|new(big.Int).Mul(new(big.Int).SetUint64(tx.GasLimit), tx.GasFeeCap)|new(big.Int)"
  "v2 gas equals intrinsic|core/agent_rule.go|tx.GasLimit != want {|tx.GasLimit < want {"
  "v2 tip cap|core/agent_rule.go|tip.Cmp(AgentMaxTip) > 0 {|tip.Cmp(AgentMaxTip) > 0 \&\& false {"
  "v2 daily fee cap|core/agent_rule.go|total.Cmp(m.DailyFeeCap) > 0 {|total.Cmp(m.DailyFeeCap) > 0 \&\& false {"
  # rule v3
  "v3 needs v2 enabled too|core/agent_rule.go|case x.IsPrecompileEnabled(agentrulev3.ContractAddress, time) \&\& x.IsPrecompileEnabled(agentrulev2.ContractAddress, time):|case x.IsPrecompileEnabled(agentrulev3.ContractAddress, time):"
  "v3 configure needs marker 2|precompile/contracts/agentrulev3/module.go|if agentpolicy.RuleVersion(state) != 2 {|if false {"
  "v3 config order|params/extras/agent_rule_order.go|*t3 < *t2 {|false {"
  "v3 selectors gated|precompile/contracts/agentpolicy/storage_v3.go|bool { return isV3(as.GetStateDB()) }|bool { return true }"
  "strict gate is the marker|precompile/contracts/agentpolicy/webauthn.go|if !isV3(st) {\n\t\treturn proofPolicy{}|if false {\n\t\treturn proofPolicy{}"
  "strict duplicate key|precompile/contracts/agentpolicy/clientdata_v3.go|containsKey(seen[:n], k) {|false {"
  "strict trailing bytes|precompile/contracts/agentpolicy/clientdata_v3.go|!p.atEnd()|false"
  "UV mask|precompile/contracts/agentpolicy/webauthn.go|p.requireUV \&\& authData[32]\&0x04 == 0|p.requireUV \&\& authData[32]\&0x01 == 0"
  "freeze without UV|precompile/contracts/agentpolicy/webauthn.go|requireUV: !freeze}|requireUV: true}"
  "P-256 low s|precompile/contracts/agentpolicy/webauthn.go|if s.Cmp(p256HalfN) > 0 {\n\t\treturn ErrHighS|if false {\n\t\treturn ErrHighS"
  "setMandateV2 refused under v3|precompile/contracts/agentpolicy/v2.go|if isV3(as.GetStateDB()) {\n\t\treturn ErrUseSetMandateV3|if false {\n\t\treturn ErrUseSetMandateV3"
  "meet payee intersection|precompile/contracts/agentpolicy/mandate_v3.go|\t\tif !inE {\n\t\t\tcontinue\n\t\t}\n\t\tcapN|\t\tif !inE {\n\t\t\tcapE = NoPayeeCap\n\t\t}\n\t\tcapN"
  "meet dailyCap minimum|precompile/contracts/agentpolicy/mandate_v3.go|minBig(e.DailyCap, n.DailyCap),|new(big.Int).Set(n.DailyCap),"
  "derived mandateEver|precompile/contracts/agentpolicy/storage_v3.go|func mandateEver(s contract.StateReader, agent common.Address, flags uint64) bool {|func mandateEver(s contract.StateReader, agent common.Address, flags uint64) bool {\n\tif flags\&flagMandateEver == 0 {\n\t\treturn false\n\t}"
  "tightening clears pending|precompile/contracts/agentpolicy/v3.go|\twriteLifecycle(st, in.Agent, eta, active) // eta 0 clears any earlier scheduled mandate|\tif pending {\n\t\twriteLifecycle(st, in.Agent, eta, active)\n\t}"
  "pending applies at eta|precompile/contracts/agentpolicy/storage_v3.go|if eta != 0 \&\& ts >= eta {|if eta != 0 \&\& ts > eta {"
  "v3 payment count check|core/agent_rule.go|n >= uint64(limit) {|n > uint64(limit) {"
  "v3 payee cap check|core/agent_rule.go|total.Cmp(c) > 0 {|total.Cmp(c) > 0 \&\& false {"
  "ChargeV3 counts|precompile/contracts/agentpolicy/storage_v3.go|binary.BigEndian.PutUint64(h[24:], n+1)|binary.BigEndian.PutUint64(h[24:], n)"
  "payee counter is value only|core/state_transition.go|*st.msg.To, st.msg.Value, st.evm.Context.Time|*st.msg.To, new(big.Int).Add(st.msg.Value, st.agentFee), st.evm.Context.Time"
  "guardian freeze epoch|precompile/contracts/agentpolicy/v3.go|in.Epoch.Uint64() != FreezeEpoch(st, in.Agent) {|false {"
  "sweep timelock|precompile/contracts/agentpolicy/v3.go|case now < eta:|case now < eta \&\& false:"
  "sweep needs frozen|precompile/contracts/agentpolicy/v3.go|case !isFrozen(st, agent):|case false:"
  "unfreeze clears sweep|precompile/contracts/agentpolicy/v2.go|clearPendingSweep(st, agent) // resuming|// clearPendingSweep(st, agent) // resuming"
  "getSpend adds swept|precompile/contracts/agentpolicy/logic.go|total := new(big.Int).Add(sp.TotalCharged, TotalSwept(st, agent))|total := new(big.Int).Set(sp.TotalCharged)"
  "pool counts lower nonces only|core/txpool/legacypool/legacypool.go|if tx.Nonce() < nonce {\n\t\t\t\t\t\taddReserved|if tx.Nonce() <= nonce {\n\t\t\t\t\t\taddReserved"
  "legacy parser trailing data|precompile/contracts/agentpolicy/webauthn_legacy.go|if _, err := dec.Token(); err != io.EOF {|if _, err := dec.Token(); err != io.EOF \&\& false {"
)

survived=0
LOG="$(mktemp)"
for entry in "${MUTATIONS[@]}"; do
  IFS='|' read -r name file from to <<<"$entry"
  f="$EVM/$file"
  cp "$f" "$f.orig"
  if ! node "$ROOT/chain/tests/mutation/apply.mjs" "$f" "$from" "$to"; then
    echo "ERROR  $name: mutation does not apply"
    mv "$f.orig" "$f"
    survived=$((survived + 1))
    continue
  fi
  if SEALED_TEST_NO_FETCH=1 SEALED_FUZZTIME=0 SEALED_TEST_RUN='AgentRule|AgentPolicy' bash "$ROOT/chain/scripts/test.sh" >"$LOG" 2>&1; then
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
