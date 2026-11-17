# Sealed Arena

[![CI](https://github.com/NeitLN/Sealed-Arena/actions/workflows/ci.yml/badge.svg)](https://github.com/NeitLN/Sealed-Arena/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![Avalanche L1](https://img.shields.io/badge/Avalanche-L1%20%C2%B7%20Subnet--EVM-e84142)

**An Avalanche L1 where a payment from an AI agent's key is valid only if it stays inside the mandate its owner set with a passkey.**

Give the agent a card, not the whole wallet. If the agent is tricked, or its private key leaks, a transfer outside the mandate is not a reverted transaction: it is an **invalid** transaction that no block accepted by the chain's validators can contain.

> Built for Team1 Vietnam UniHack 2026, _Build on Avalanche_, track AI agents & security. Testnet only.

> **Tóm tắt (Tiếng Việt).** Sealed Arena là một Avalanche L1 riêng. Mỗi khoản chi từ khoá của một AI agent chỉ hợp lệ khi nằm trong uỷ quyền mà chủ ví đặt bằng passkey: danh sách người nhận, hạn mức mỗi giao dịch, hạn mức mỗi ngày, hạn dùng. Quy tắc nằm trong điều kiện hợp lệ của giao dịch ở node (Subnet-EVM), nên giao dịch vượt uỷ quyền không vào được block nào, kể cả khi kẻ tấn công cầm được private key của agent. Chủ ví có thể dừng agent bất cứ lúc nào bằng passkey. Dự án chỉ chạy trên testnet; tài sản không có giá trị quy đổi.

---

## The problem

AI agents now hold wallets and pay for APIs and data on their own (for example with x402). A prompt injection, a poisoned tool, or a leaked key can make the agent send money anywhere. Today's spending limits live in a server or in a smart-contract wallet that the agent calls, so whoever controls the agent's key can often reach around them.

## How it works

```mermaid
flowchart LR
    owner["Owner<br/>(passkey on phone/laptop)"] -- "WebAuthn proof<br/>setMandate / freeze" --> relayer["Relayer"]
    relayer --> policy["AgentPolicy precompile<br/>0x0300…01<br/>payees · perTxCap · dailyCap · expiry · frozen"]
    agent["AI agent key<br/>(may leak)"] -- "signed transaction" --> node
    subgraph node["Sealed L1 node (patched Subnet-EVM)"]
      pool["txpool check<br/>(read-only)"] --> pre["preCheck<br/>validity rule"]
    end
    pre -- "reads mandate,<br/>records spend" --> policy
    pre -- "inside mandate" --> block["Block"]
    pre -- "outside mandate" --> reject["Invalid: rejected,<br/>never in a block"]
```

1. The owner registers an agent key with a P-256 **passkey** and sets a **mandate**: allowed payees (up to 16), a per-transaction cap, a daily cap and an expiry. Every change needs a fresh WebAuthn proof from that passkey, bound to the chain id, the agent and a nonce, so the agent key alone can never change it.
2. For every transaction **sent by a registered agent**, the node checks, in the transaction pool and again in `preCheck` (the step that decides whether a transaction can be part of a block):
   no contract creation · payee in the mandate · payee has no code · agent not frozen · `block.timestamp < expiry` · `value + gasLimit × gasFeeCap ≤ perTxCap` · `spentToday + charge ≤ dailyCap`.
3. A transaction that fails is rejected by the RPC and makes any block that contains it invalid. A transaction that passes is charged at its maximum cost before it executes, so the counter never falls below what actually left the account.

Transactions from other senders are not affected. Details and the exact contracts between components: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) (Vietnamese).

## Why on-chain, why Avalanche, where the money comes from

- **Why a chain rule.** A limit kept by a server, or by a contract wallet the agent calls, binds only the paths that go through it; whoever holds the agent's key can sign other transactions. A validity rule in the node binds every transaction the key signs, whatever signed it and whoever sent it, because a block that contains a forbidden one is invalid for the validators.
- **Why an Avalanche L1.** We need our own validity rule and still want to stay EVM-compatible and connected to existing assets. An Avalanche L1 runs our patched Subnet-EVM with its own validator set, keeps the C-Chain one message away (ICM), brings USDC across (ICTT), and costs a small continuous fee per validator rather than a network of our own to secure.
- **Where the money comes from.** The L1's native coin is Circle test USDC from the Fuji C-Chain, bridged with ICTT: it is locked in the home contract on the C-Chain and minted one-for-one on the L1. Nothing else mints it. Testnet only.

## Avalanche components used

| Component                                                            | Role here                                                      |
| -------------------------------------------------------------------- | -------------------------------------------------------------- |
| Avalanche L1 on Fuji (ACP-77), one validator, P-Chain continuous fee | Runs the Sealed chain; created with the Avalanche Platform CLI |
| Subnet-EVM, patched (`chain/patches/`)                               | The validity rule in `preCheck` and the transaction pool       |
| Stateful precompile `AgentPolicy` (`0x0300…01`)                      | Mandates, passkey (P-256 WebAuthn) proofs, spend counters      |
| Precompiles TxAllowList, ContractDeployerAllowList, NativeMinter     | Who may send and deploy; minting only for the ICTT remote      |
| ValidatorManager on the Fuji C-Chain (proof of authority)            | The L1's validator set                                         |
| ICTT: `ERC20TokenHome` (C-Chain), `NativeTokenRemote` (L1)           | USDC as the L1's native coin                                   |
| ICM (Teleporter) and the ICM relayer                                 | Carries the open challenge's survival record to the C-Chain    |
| ERC-8004 registries on the Fuji C-Chain                              | Public identity and reputation record of the challenge agent   |

**Size of the node change.** Two patch files on avalanchego `v1.15.3`: 1,912 lines of code added and 4 removed, plus 1,295 lines of tests. The rule itself is about 170 lines (`core/agent_rule.go` and its hooks in `core/state_transition.go` and `core/txpool/`); the rest is the `AgentPolicy` precompile, including WebAuthn verification and its ABI.

## Status

| Component                                                                                                       | Status |
| --------------------------------------------------------------------------------------------------------------- | ------ |
| Local L1 from pinned avalanchego `v1.15.3` + Subnet-EVM, built and run in Docker (1–3 nodes)                    | Done   |
| `AgentPolicy` precompile: register, mandates, freeze/unfreeze with passkey (WebAuthn) proofs, spend counters    | Done   |
| Validity rule in `preCheck` and the txpool (all seven conditions, daily budget, concurrent payments)            | Done   |
| Genesis with allow-lists, 3-node network, leaked-key attack suite                                               | Done   |
| x402 payments with a signed native transaction: facilitator, sample seller, client                              | Done   |
| `ArenaRecorder`: funding, survival score, public breach check (`balance ≥ funded − charged`)                    | Done   |
| Buying agent driven by an LLM; prompt-injection scenarios with recorded transcripts and replay                  | Done   |
| Owner console with passkeys (WebAuthn): link agent, set mandate, freeze/unfreeze; relayer; English/Vietnamese   | Done   |
| Sealed L1 on Fuji: validator, public HTTPS RPC, USDC bridged to the native coin (ICTT), owner console on Vercel | Done   |
| Survival record sent over ICM (Teleporter) to the ERC-8004 reputation registry on the Fuji C-Chain              | Done   |
| Open red-team challenge: public agent key, RPC gateway that records every attempt, challenge and rules pages    | Done   |
| Comparison on Fuji with a plain wallet (P) and a spending-limit contract wallet built by the team (O)           | Done   |

Each design decision is recorded with its evidence (source lines, commands, results) in [`docs/decisions/`](docs/decisions):
[D1](docs/decisions/D1.md) a failing `preCheck` keeps a transaction out of every block ·
[D2](docs/decisions/D2.md) the rule stays in the node (tier 1) ·
[D3](docs/decisions/D3.md) how the local L1 is built ·
[D4](docs/decisions/D4.md) precompile address and P-256 support ·
[D5](docs/decisions/D5.md) x402 payment method `signed-native-tx` ·
[D7](docs/decisions/D7.md) survival records in ERC-8004.

## Evaluation

Nine attack classes on three groups with the same reference mandate (two sellers, 0.02 USDC per payment, 0.05 per day): **P** a plain wallet, **O** a spending-limit contract wallet the team built, **S** Sealed. Full report with 95% Wilson intervals, every case and its limits: [`docs/EVALUATION.md`](docs/EVALUATION.md), generated from the raw results.

| Group                 | Coins left outside the mandate (T0) | Unwanted payments inside the mandate (T1) | Benign purchases completed |
| --------------------- | ----------------------------------- | ----------------------------------------- | -------------------------- |
| P plain wallet (Fuji) | 36/45 cases                         | 9/45                                      | 10/10                      |
| O limit wallet (Fuji) | 16/45                               | 16/45                                     | 10/10                      |
| S Sealed (local L1)   | 0/69                                | 9/69                                      | 10/10                      |

With a live model, the buying agent ignored the injected pages (0/5 for each of three pages). It followed a note planted in its memory in 5/5 runs when its owner's task told it to read its notes; the node refused all fifteen payments to the attacker. S does not stop T1: the rule limits where and how much, not what the owner wanted.

## Try it on Fuji (testnet)

- RPC: `https://sealed-arena.duckdns.org/rpc` (chain id `261126`, native coin: USDC bridged from Fuji with ICTT)
- Owner console: https://sealed-arena.vercel.app
- Open red-team challenge: https://sealed-arena.vercel.app/arena (rules: [/arena/rules](https://sealed-arena.vercel.app/arena/rules))
- Comparison of P, O and S: https://sealed-arena.vercel.app/compare
- Every address and transaction: [`services/fuji-ops/deployments/fuji.json`](services/fuji-ops/deployments/fuji.json)

| What                                    | Where                       | Address or ID                                                                                             |
| --------------------------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------- |
| Sealed L1                               | P-Chain subnet / blockchain | `xeBXaUqytA93ZuEKUm34LaYEy4UVqAGGrD6LCwNS8TWmCrJkG` / `UFo3xChM9b9efQkg93qPnswkJi7VR1XW7KQg9wE7gnCULfbYo` |
| Validator                               | L1                          | `NodeID-6TgSfU7azciZHPtkWZ6qnc8wsqMHyTTGL`                                                                |
| ValidatorManager                        | C-Chain                     | [`0x6911…6676`](https://testnet.snowtrace.io/address/0x69112c469092fed092d958d42a2c0f4fe16e6676)          |
| ICTT home (USDC)                        | C-Chain                     | [`0x9806…6d2d`](https://testnet.snowtrace.io/address/0x980619791b89410b03ce02a479b032bddfe46d2d)          |
| ICTT remote (native coin)               | L1                          | `0x0fb5053b11fefc69ac31e3e87f60ce8677f6483e`                                                              |
| ArenaRecorder                           | L1                          | `0x60d046fa32a101229f78d69b655a91193cdf4f77`                                                              |
| ReputationReceiver (ERC-8004 writer)    | C-Chain                     | [`0x3c99…6fda`](https://testnet.snowtrace.io/address/0x3c99b37bf7279220ae2f09f12bbdc0742b056fda)          |
| ERC-8004 Reputation registry, agent 303 | C-Chain                     | [`0x8004…8713`](https://testnet.snowtrace.io/address/0x8004B663056A597Dffe9eCcC1965A193B7388713)          |

The L1 has no public block explorer; read it through the RPC above. The operator runs the only validator. See "Security model and limitations" below.

## Quick start

Requirements: Docker (running), Node.js 24, pnpm 11, Git, and bash (Git Bash on Windows). Go and Foundry are not needed on the host; they run in pinned containers.

After `git clone --recursive` and `pnpm install`, three commands build the node, start a local L1 and run the leaked-key attack suite:

```bash
bash chain/scripts/fetch.sh && bash chain/scripts/build.sh
bash scripts/localnet.sh up && bash scripts/localnet.sh seed
pnpm --filter attacks leaked-key
```

Step by step, with the other suites:

```bash
git clone --recursive https://github.com/NeitLN/Sealed-Arena.git
cd Sealed-Arena
pnpm install

bash scripts/check.sh            # typecheck, lint, TS tests, Foundry, Go tests of the node patches

bash chain/scripts/fetch.sh      # avalanchego v1.15.3 at the pinned commit, patches applied
bash chain/scripts/build.sh      # node image sealed-node:dev
bash scripts/localnet.sh up      # local Sealed L1 with three validators
bash scripts/localnet.sh seed    # test agent with a sample mandate
bash chain/scripts/smoke.sh      # chain id 261126 and a test transfer
bash chain/tests/rule/run.sh     # mandate, rejected payments, freeze, concurrent payments
pnpm --filter attacks leaked-key # someone holding the agent's key tries every way out
pnpm --filter attacks x402       # x402 purchase end to end, and the payments it must refuse
bash scripts/localnet.sh down    # stop and delete the local network
```

More, including logs and troubleshooting: [`docs/RUNBOOK.md`](docs/RUNBOOK.md).

## Repository layout

| Path                                  | Contents                                                                                                                              |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| [`chain/`](chain)                     | Patches on avalanchego (`patches/`), pinned upstream, node Dockerfile, local network launcher, Go-side tests and network test scripts |
| [`contracts/`](contracts)             | Solidity (Foundry, run in Docker)                                                                                                     |
| [`packages/shared/`](packages/shared) | Chain id, addresses, ABI, and the encoders for passkey challenges and proofs, shared by every service                                 |
| `services/`, `web/`                   | x402 facilitator, demo seller, buying agent, relayer, RPC gateway, Fuji operations, attack suites, web app                            |
| [`scripts/`](scripts)                 | `check.sh`, `check-localnet.sh`, `localnet.sh`, `forge.sh`, `submission-check.sh`                                                     |
| [`docs/`](docs)                       | Architecture, runbook, decision records, evaluation, submission checklist                                                             |

Only our changes to avalanchego live in this repository, as patch files applied to a pinned tag, so reviewers can read exactly what we wrote.

## Testing

`bash scripts/check.sh` is the single quick check and runs in CI on every pull request. Highlights:

- Go tests run against hand-built blocks: a block that contains a forbidden agent transaction must be rejected at import, for every transaction type.
- A VM-level test drives the real transaction pool and block builder: 20 payments that are each valid alone are queued at once, and only what fits the daily budget reaches a block.
- WebAuthn test vectors in [`chain/testvectors/`](chain/testvectors) are shared by the Go precompile tests and the TypeScript encoder tests, so both sides agree byte for byte.
- `chain/tests/rule/run.sh` checks the same behaviour over RPC on a running local L1 with one and three nodes.
- The x402 suite (`services/attacks/src/x402.ts`) starts the facilitator and two sample sellers, buys one dataset end to end, then sends each payment that must be refused (wrong payee, price, resource, chain id, signer, reused request id, already broadcast, seller outside the mandate) and checks the agent's balance and nonce do not move.
- `ArenaRecorder` has Foundry tests for the score, the invariant, breaches and direct deposits (with a fuzz test), and `services/attacks/src/arena.ts` runs the leaked-key suite against an agent funded only through the recorder, then checks that a checkpoint finds no breach.
- `web/e2e/owner.e2e.ts` drives the owner console in Chromium with a virtual passkey on the local network: link an agent, set a mandate, freeze and unfreeze (the agent's payment is refused while frozen), and checks that a different passkey cannot freeze the agent.
- The [leaked-key attack suite](services/attacks) plays someone who holds the agent's key: 24 ways out (every transaction type, fees, contracts, the precompiles, replay, each node directly, frozen, expired, budget, 20 at once), one positive control, then the balance invariant and agreement of the three nodes. `bash scripts/check-localnet.sh` runs it with the rest of the network checks.

## Security model and limitations

What the rule gives: on the Sealed L1, a transaction sent with an agent's key that falls outside the agent's mandate cannot be included in a block. This is enforced by the chain's validators running the patched node.

What it does not give, stated plainly:

1. **Testnet only.** Coins on the L1 have no monetary value. This is not a payment service.
2. **The team runs all validators.** The claim is "the rule is enforced by the chain's consensus", not that control is spread across independent parties. The node source and the validator set are public. Network upgrades and genesis are operator actions outside the rule; we commit to shipping no upgrade that touches agent addresses.
3. **Only assets on this L1 are protected.**
4. **A leaked key can still spend inside the mandate**: to allowed payees, up to the daily budget, until the owner freezes the agent or the mandate expires.
5. **Someone holding the key can grief**: use up the daily budget or occupy nonces.
6. **Simulation is not admission.** `eth_call` and `eth_estimateGas` do not apply the rule; services read the mandate from the precompile instead.
7. **The open challenge measures how hard the system was tried, not that it is safe.**
8. **The ERC-8004 record is only as trustworthy as its writer.** Anyone can give feedback in ERC-8004; read the survival record as feedback whose client is our ReputationReceiver (address in `services/fuji-ops/deployments/fuji.json`). ICM only carries this record; it plays no part in keeping funds safe, which is the L1 node's rule.
9. **x402 here needs our payment method.** Sellers must add the network `eip155:261126` and point `/verify` and `/settle` at this facilitator; a standard x402 client (EIP-3009 tokens) cannot pay it. The facilitator holds no keys, but a seller still has to trust it or read the chain itself (the sample seller does both).

Found a problem? See [SECURITY.md](SECURITY.md).

## Legal note

Sealed Arena runs on Avalanche's Fuji testnet. Its coins and test USDC have no monetary value, and it is not a payment or custody service. The open red-team challenge is an authorised bug-hunting program within the scope set on its rules page (the Sealed L1 on Fuji and this project's contracts and services only); attacks on anything else, including Avalanche's networks, other teams and infrastructure providers, and denial of service, are not authorised.

## License

[MIT](LICENSE) for this project's code. The patches in [`chain/patches/`](chain/patches) modify [avalanchego](https://github.com/ava-labs/avalanchego) and follow its BSD 3-Clause license.

Built on [avalanchego](https://github.com/ava-labs/avalanchego) and Subnet-EVM (Ava Labs), [Foundry](https://github.com/foundry-rs/foundry), and [viem](https://github.com/wevm/viem).
