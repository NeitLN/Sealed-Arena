#!/usr/bin/env bash
# Manage the local Sealed L1 network (one container running tmpnet nodes).
# Usage: bash scripts/localnet.sh up|down|status|rpc|seed
#   up      start the network and wait until the Sealed chain answers eth_chainId
#   down    stop the container and delete all network data
#   status  show container state and the chain id reported by the RPC
#   rpc     print the RPC URL of the Sealed chain on the host (node 1; nodes 2 and 3 use ports 9652, 9654)
#   seed    register the local test agent, give it a sample mandate and coins (services/attacks)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE=(docker compose -f "$ROOT/infra/local/docker-compose.yml")
# SEALED_BYZANTINE=1: node 3 runs a plugin without the agent rule (chain/tests/byzantine).
if [ "${SEALED_BYZANTINE:-0}" = "1" ]; then
  COMPOSE+=(-f "$ROOT/infra/local/docker-compose.byzantine.yml")
fi
CONTAINER=sealed-node
HOST_URL="http://127.0.0.1:9650"
UP_TIMEOUT="${SEALED_UP_TIMEOUT:-600}"

rpc_path() {
  docker exec "$CONTAINER" sh -c 'test -f /data/ready && sed -n "s/.*\"rpcPath\": \"\(.*\)\".*/\1/p" /data/sealed.json'
}

rpc_url() {
  local path
  path="$(rpc_path)" || return 1
  [ -n "$path" ] || return 1
  echo "$HOST_URL$path"
}

chain_id() {
  curl -fsS -m 5 -H 'content-type: application/json' \
    -d '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' "$1" |
    sed -n 's/.*"result":"\([^"]*\)".*/\1/p'
}

cmd_up() {
  "${COMPOSE[@]}" up -d
  echo "==> waiting for the Sealed chain (timeout ${UP_TIMEOUT}s)"
  local start url id
  start=$(date +%s)
  while :; do
    if url="$(rpc_url 2>/dev/null)" && id="$(chain_id "$url" 2>/dev/null)" && [ -n "$id" ]; then
      echo "==> up: $url (eth_chainId $id)"
      return 0
    fi
    if ! docker ps -q -f "name=^${CONTAINER}$" -f status=running | grep -q .; then
      echo "localnet: container stopped; last log lines:" >&2
      docker logs --tail 40 "$CONTAINER" >&2 || true
      return 1
    fi
    if [ $(( $(date +%s) - start )) -ge "$UP_TIMEOUT" ]; then
      echo "localnet: timed out waiting for the chain; last log lines:" >&2
      docker logs --tail 40 "$CONTAINER" >&2 || true
      return 1
    fi
    sleep 3
  done
}

cmd_down() {
  "${COMPOSE[@]}" down -v --remove-orphans
}

cmd_status() {
  "${COMPOSE[@]}" ps
  local url
  if url="$(rpc_url 2>/dev/null)"; then
    echo "rpc: $url"
    echo "eth_chainId: $(chain_id "$url" || echo unreachable)"
  else
    echo "rpc: not ready"
  fi
}

cmd_seed() {
  local path
  path="$(rpc_path)" || { echo "localnet: network is not up" >&2; return 1; }
  # Pass the path without its leading slash so Git Bash does not rewrite it.
  (cd "$ROOT" && SEALED_RPC_PATH="${path#/}" pnpm --filter attacks run --silent seed)
}

cmd_rpc() {
  rpc_url || { echo "localnet: network is not up" >&2; return 1; }
}

case "${1:-}" in
  up) cmd_up ;;
  down) cmd_down ;;
  status) cmd_status ;;
  rpc) cmd_rpc ;;
  seed) cmd_seed ;;
  *) echo "usage: $0 up|down|status|rpc|seed" >&2; exit 2 ;;
esac
