# Measurements

Costs and timings of the Sealed L1 and of the agent rule, with the command, revision and environment of each run. Raw results are committed next to the scripts.

## Fees and timings on the Sealed L1 on Fuji

Command: `pnpm --filter attacks measure` with the `SEALED_*` settings of the Fuji L1 (RUNBOOK §7), revision `b3c50ee` of `main` plus this script, 20/11/2026 13:10 UTC, agent rule v2 in force. A fresh agent (0.3 test USDC, mandate 0.1 per payment and 0.2 per day) made 10 plain payments and 10 payments carrying the 32-byte x402 reference, one after another, then its owner froze it. Raw file: [`services/attacks/results/measure-fuji-2026-11-20T13-10-05-792Z.json`](../services/attacks/results/measure-fuji-2026-11-20T13-10-05-792Z.json).

| What | Result |
|---|---|
| Fee of a plain agent payment (21000 gas × effective gas price) | 0.000021 test USDC (every one of the 10) |
| Fee of a payment with the x402 reference (21512 gas) | 0.0000215 test USDC (every one of the 10) |
| Send to receipt, 20 payments (client polling every 100 ms through an SSH tunnel) | median 1.90 s, 90th percentile 1.94 s, fastest 0.20 s, slowest 1.96 s |
| Owner freeze: read the nonce, sign with the owner key, send through the relayer key, wait for the receipt | 4.7 s |
| The agent's next payment, sent right after the freeze receipt | refused by the node: `agent: frozen` |

The effective gas price was the minimum base fee (1 gwei) plus a 1 wei tip. The send-to-receipt times are mostly the chain's block rate (`targetBlockRate` 2 s) and are measured from one client; they are not a throughput figure. One run, one validator.

## Cost of the rule check

Command: `bash chain/scripts/bench.sh 2s` (`core.BenchmarkCheckAgentTx`, Go 1.26.10 in the pinned golang image, Docker on Windows 11, Intel Core Ultra 9 285H).

| Transaction | Time per check | Memory |
|---|---|---|
| Sender is not an agent (one storage read) | 343 ns | 128 B, 4 allocations |
| Agent payment inside its mandate, rule v1 | 5.8 µs | 888 B, 21 allocations |
| Agent payment inside its mandate, rule v2 | 6.6 µs | 1120 B, 29 allocations |

The check runs in the pool when a transaction arrives and again in `preCheck` when a block is built or verified. It reads the state of the block it is checked against.

## Do the tests catch a weakened rule?

Command: `bash chain/tests/mutation/run.sh` (same environment as above). Each mutation switches off or weakens one condition of `core.CheckAgentTx` / `checkAgentTxV2` or one step of the spend accounting, then runs the agent tests (`chain/scripts/test.sh`, pattern `AgentRule|AgentPolicy`). A mutation counts as caught only when a test fails; one that does not compile is reported as an error. The source is restored and checked against `chain/patches/` at the end.

| Condition weakened | Caught by |
|---|---|
| transaction type 0, 1, 2 only | `TestAgentRuleConditions` |
| no contract creation | `TestAgentRuleRegisteredWithoutMandateRejectsEverything` |
| payee in the mandate's list | `TestAgentRuleRegisteredWithoutMandateRejectsEverything` |
| payee has no code | `TestAgentRuleConditions` |
| agent not frozen | `TestAgentPolicyV2PreSignedFreeze` |
| mandate not expired (`>=` made `>`) | `TestAgentRuleConditions` |
| charge within perTxCap | `TestAgentRuleConditions` |
| spentToday + charge within dailyCap | `TestAgentRuleConditions` |
| pooled payments counted toward the daily cap | `TestAgentRuleConcurrentPaymentsThroughPoolAndBuilder` |
| the charge includes gasLimit × fee cap | `TestAgentPolicyV2DailyFeeCap` |
| the fee counted is gasLimit × fee cap | `TestAgentPolicyV2DailyFeeCap` |
| v2: gas limit equals the intrinsic gas (`!=` made `<`) | `TestAgentRuleV2GasDataAndAccessList` |
| v2: tip at most 1 gwei | `TestAgentRuleV2ActivationBoundary` |
| v2: fees today within dailyFeeCap | `TestAgentPolicyV2DailyFeeCap` |

Result: 14 of 14 caught, on 20/11/2026. This shows the tests notice each of these changes; it does not show the list of conditions is complete.

