# Verify the Sealed L1 with your own node

The Sealed L1 on Fuji has one validator, run by the team (README, limit 2). You do not have to trust our RPC to see whether its blocks follow the agent rule: run a node of your own that tracks the L1 without validating. It downloads every block from the validator and executes it again with the same rule. A block that breaks the rule as written in this repository (for example a payment from an agent to an address outside its mandate) is invalid for your node: it refuses the block and stops following the chain there, so its block hashes stop matching the public RPC.

What this shows and what it does not:

- It shows that every block your node accepted follows the rule **as implemented in this repository at the commit you built**. A bug in the rule would be accepted by your node too, since it runs the same code.
- It does not show who controls the chain. The team still runs the only validator, holds the admin keys and can ship network upgrades (README, limit 2). Your node only tells you whether what the validator produced is valid under the rules you built.
- Your node does not validate and has no stake: it cannot stop a bad block from being produced, it can only refuse to follow it.

## 1. Build the node image

Needs Docker, Git Bash (on Windows) and about 10 minutes for a first build.

```bash
bash chain/scripts/fetch.sh          # avalanchego v1.15.3 at the pinned commit + chain/patches
SEALED_IMAGE=sealed-verifier:local bash chain/scripts/build.sh
```

`fetch.sh` stops if the tag does not resolve to the commit pinned in `chain/UPSTREAM`. The image holds avalanchego and the patched Subnet-EVM plugin (VM ID `srEXiWaHuhNyGwPUi444Tu47ZEDwxTWrbQiuD7FmgSAQ6X7Dy`).

## 2. Run it

```bash
SEALED_IMAGE=sealed-verifier:local bash chain/scripts/verifier.sh up
bash chain/scripts/verifier.sh status      # P-Chain and L1 bootstrapped? latest L1 block
bash chain/scripts/verifier.sh down        # stop; the volume sealed-verifier-data stays
```

`verifier.sh up` creates the volume `sealed-verifier-data`, writes the chain's configuration files into it and starts the container `sealed-verifier` with the node's HTTP API on `127.0.0.1:19750` only (the container's 9650; nothing is exposed to the network). Equivalent by hand:

```bash
# in the data volume, at /data/configs/chains/UFo3xChM9b9efQkg93qPnswkJi7VR1XW7KQg9wE7gnCULfbYo/
upgrade.json   {"precompileUpgrades":[{"agentRuleV2Config":{"blockTimestamp":1795086000}}]}
config.json    {"state-sync-enabled":false}

docker run -d --name sealed-verifier -v sealed-verifier-data:/data -p 127.0.0.1:19750:9650 \
  --entrypoint /avalanchego/avalanchego sealed-verifier:local \
  --network-id=fuji --partial-sync-primary-network=true \
  --track-subnets=xeBXaUqytA93ZuEKUm34LaYEy4UVqAGGrD6LCwNS8TWmCrJkG \
  --data-dir=/data --plugin-dir=/avalanchego/plugins --http-host=0.0.0.0 --http-allowed-hosts='*'
```

- `--partial-sync-primary-network=true`: the node syncs only the Fuji P-Chain (where the L1, its genesis and its validator set are recorded), not the C-Chain or X-Chain.
- `--track-subnets`: the Sealed subnet `xeBXaUqytA93ZuEKUm34LaYEy4UVqAGGrD6LCwNS8TWmCrJkG`, blockchain `UFo3xChM9b9efQkg93qPnswkJi7VR1XW7KQg9wE7gnCULfbYo`, EVM chain id 261126. The genesis comes from the P-Chain; ids in `services/fuji-ops/deployments/fuji.json`.
- **`upgrade.json` is required and must be exactly the validator's.** Agent rule v2 (docs/ARCHITECTURE.md 3.5) is switched on by this network upgrade from timestamp 1795086000 (19/11/2026 11:00 UTC, block 491 on Fuji). It is not in the genesis. A node without it, or with another time, applies different rules from that block on; expect it to stop following the chain at the first block whose result differs (for example the first `setMandateV2` call). We have not run that case on Fuji.
- `config.json` turns state sync off (it is off by default in Subnet-EVM; set here to be explicit), so the node executes every block from genesis instead of downloading a state snapshot.
- The chain config your node reports (`eth_getChainConfig`) lists `agentRuleV2Config` under `upgrades.precompileUpgrades`. Tools built for upstream Subnet-EVM may fail to decode that entry; the ICM relayer v1.8.4 does, which is why the bridge relayer reads the config through a filter (README, limit 15). Your node does not need any filter.

## 3. Compare with the public RPC

```bash
pnpm install
pnpm --filter fuji-ops verify-agree                         # every height both sides have
pnpm --filter fuji-ops verify-agree -- --from 480 --to 520  # a range (also --step N)
```

`services/fuji-ops/src/verify-agree.ts` reads only. It checks that your node has finished bootstrapping, reports chain id 261126 and the same `agentRuleV2Config` time, that both tips are within 5 blocks, and then compares the block hash and the state root at each height with `https://sealed-arena.duckdns.org/rpc`. It prints `PASS` or `FAIL` per check and exits non-zero on any `FAIL`. Other endpoints: `VERIFIER_URL`, `VERIFIER_RPC`, `PUBLIC_RPC`. The block hash covers the whole header (state root, transactions root, receipts root), and your node only accepts a block whose state root it computed itself, so equal hashes mean your node reached the same state by executing the same transactions under the rule.

## 4. Checking a breach claim

The open challenge (`/arena`) counts a breach when the challenge agent `0x30b01562945BB3cE72241b0EaaEB3F41660982F6` holds less than `funded − charged` (`ArenaRecorder`, `0x60d046fa32a101229f78d69b655a91193cdf4f77`). Anyone can report one on-chain with `reportBreach(agent)`. To check a claim (ours or someone else's) without trusting our RPC or our pages:

1. Run your node (sections 1 and 2) and `verify-agree`. If it is `PASS`, the public RPC shows the same chain your node executed.
2. Read the challenge from your own node: `FUJI_L1_RPC=http://127.0.0.1:19750/ext/bc/UFo3xChM9b9efQkg93qPnswkJi7VR1XW7KQg9wE7gnCULfbYo/rpc pnpm --filter fuji-ops health`. The `arena agent` line shows `breached`, the balance and the required balance read from your node (the other lines check our infrastructure and can be ignored here).
3. For a claimed transaction, look it up on your node (`eth_getTransactionByHash`, `eth_getTransactionReceipt` on the URL above) and compare its recipient with the agent's mandate (`getMandateV2(agent)` on the AgentPolicy precompile `0x0300000000000000000000000000000000000001`, ABI in `packages/shared/src/agentPolicyAbi.ts`).

How to read the result:

- The transaction is not in a block on your node, or it is and the recipient is in the mandate and within the caps: the claim does not hold.
- `verify-agree` is `FAIL` because your node stopped at some height while the public RPC went on: the validator produced a block your node refused. Report it (SECURITY.md) with the height and your node's log (`docker logs sealed-verifier`).
- Your node accepted a block with a payment outside the mandate: the rule as implemented has a bug. That is a real breach; report it the same way.

## 5. Recorded run

Run on the team's Windows 11 machine (Docker Desktop), by the team, on 20/11/2026, from this repository (the commit that adds this file, on top of `81657bc`), against the Sealed L1 on Fuji. This is one run on our own machine; run it yourself rather than trusting this record.

| Step | Command | Result |
| --- | --- | --- |
| Build | `bash chain/scripts/fetch.sh`, `SEALED_IMAGE=sealed-verifier:v09 bash chain/scripts/build.sh` | `PASS`: upstream commit matched `chain/UPSTREAM`, patches applied; image built in 19 s from Docker's cache of an earlier build of the same sources (a cold build takes about 10 minutes) |
| Start | `SEALED_IMAGE=sealed-verifier:v09 bash chain/scripts/verifier.sh up` | container started 13:25:02 UTC |
| P-Chain sync | (partial sync, automatic) | `PASS`: 306,917 Fuji P-Chain blocks fetched and executed, bootstrapped 13:33:20 UTC (about 8 minutes); volume 2.0 GB |
| L1 sync | (automatic) | `PASS`: 556 L1 blocks executed from genesis in 1.9 s; the log shows `Activating new precompile name=agentRuleV2Config config={"blockTimestamp":1795086000}` during execution |
| Agreement | `pnpm --filter fuji-ops verify-agree` at 13:34:48 UTC | `PASS` on all 5 checks: bootstrapped, chain id 261126 on both, `agentRuleV2Config` 1795086000, tips 556 and 556, **557 heights (0 to 556, every block) checked, 0 differ** in block hash and state root |
| Rule on your node | `CANARY_NODE_URL=http://127.0.0.1:19750 pnpm --filter fuji-ops canary` at 13:35:00 UTC | `PASS`: the verifier's own transaction pool refused the canary agent's payment to a new address with `agent: payee not allowed`; the 1-wei payment to the canary's payee, sent to the verifier, was passed on to the validator and included in block 557 |

The canary agent (`0xDbd4d8c127978762d2AE08b5F1F60F373f3fBD26`, payee `0xc4853b2e5311FfF3871eeAF30FA66C66C6BDf942`) is a team-held agent with a tiny mandate used to check the live chain each run (docs/RUNBOOK.md §8). Its key is not public.
