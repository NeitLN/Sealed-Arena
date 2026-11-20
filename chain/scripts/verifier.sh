#!/usr/bin/env bash
# Run a non-validator node for the Sealed L1 on Fuji (docs/VERIFY.md). It syncs the Fuji P-Chain
# (partial sync) and the Sealed L1, re-executing every L1 block with the agent rule.
# Usage: bash chain/scripts/verifier.sh up       start (or restart) the node
#        bash chain/scripts/verifier.sh status   bootstrap state and latest L1 block
#        bash chain/scripts/verifier.sh down     stop and remove the container (keeps the volume)
# Image: build it first with chain/scripts/fetch.sh + chain/scripts/build.sh.
# Env:   SEALED_IMAGE (default sealed-node:dev), VERIFIER_NAME (sealed-verifier),
#        VERIFIER_VOLUME (sealed-verifier-data), VERIFIER_PORT (19750, bound to 127.0.0.1 only).
set -euo pipefail

IMAGE="${SEALED_IMAGE:-sealed-node:dev}"
NAME="${VERIFIER_NAME:-sealed-verifier}"
VOLUME="${VERIFIER_VOLUME:-sealed-verifier-data}"
PORT="${VERIFIER_PORT:-19750}"

# Sealed L1 on Fuji (services/fuji-ops/deployments/fuji.json).
SUBNET_ID=xeBXaUqytA93ZuEKUm34LaYEy4UVqAGGrD6LCwNS8TWmCrJkG
BLOCKCHAIN_ID=UFo3xChM9b9efQkg93qPnswkJi7VR1XW7KQg9wE7gnCULfbYo
# The network upgrade the validator runs with (docs/RUNBOOK.md 7.1). A node without it, or with a
# different time, applies different rules from block 491 on and stops following the chain.
UPGRADE_JSON='{"precompileUpgrades":[{"agentRuleV2Config":{"blockTimestamp":1795086000}}]}'
# Re-execute every block from genesis instead of downloading a state snapshot.
CHAIN_CONFIG_JSON='{"state-sync-enabled":false}'

export MSYS_NO_PATHCONV=1

case "${1:-}" in
  up)
    docker volume create "$VOLUME" >/dev/null
    docker run --rm -v "$VOLUME:/data" --entrypoint sh "$IMAGE" -c "
      mkdir -p /data/configs/chains/$BLOCKCHAIN_ID &&
      printf '%s\n' '$UPGRADE_JSON' > /data/configs/chains/$BLOCKCHAIN_ID/upgrade.json &&
      printf '%s\n' '$CHAIN_CONFIG_JSON' > /data/configs/chains/$BLOCKCHAIN_ID/config.json &&
      cat /data/configs/chains/$BLOCKCHAIN_ID/upgrade.json"
    docker rm -f "$NAME" >/dev/null 2>&1 || true
    docker run -d --name "$NAME" --restart unless-stopped \
      -v "$VOLUME:/data" -p "127.0.0.1:$PORT:9650" \
      --entrypoint /avalanchego/avalanchego "$IMAGE" \
      --network-id=fuji \
      --partial-sync-primary-network=true \
      --track-subnets="$SUBNET_ID" \
      --data-dir=/data \
      --plugin-dir=/avalanchego/plugins \
      --http-host=0.0.0.0 \
      --http-allowed-hosts='*'
    echo "started $NAME; RPC http://127.0.0.1:$PORT/ext/bc/$BLOCKCHAIN_ID/rpc"
    ;;
  status)
    for chain in P "$BLOCKCHAIN_ID"; do
      printf '%s bootstrapped: ' "$chain"
      curl -s -X POST -H 'content-type: application/json' \
        --data "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"info.isBootstrapped\",\"params\":{\"chain\":\"$chain\"}}" \
        "http://127.0.0.1:$PORT/ext/info" || printf 'no answer'
      echo
    done
    printf 'L1 latest block: '
    curl -s -X POST -H 'content-type: application/json' \
      --data '{"jsonrpc":"2.0","id":1,"method":"eth_blockNumber","params":[]}' \
      "http://127.0.0.1:$PORT/ext/bc/$BLOCKCHAIN_ID/rpc" || printf 'no answer'
    echo
    ;;
  down)
    docker rm -f "$NAME"
    ;;
  *)
    echo "usage: bash chain/scripts/verifier.sh up|status|down" >&2
    exit 2
    ;;
esac
