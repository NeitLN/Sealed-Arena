#!/usr/bin/env bash
# Build the node image (avalanchego + Subnet-EVM plugin + sealed-localnet) from
# chain/.work/avalanchego. Run chain/scripts/fetch.sh first.
# Usage: bash chain/scripts/build.sh            -> image sealed-node:dev
#        SEALED_IMAGE=name:tag bash chain/scripts/build.sh
#        bash chain/scripts/build.sh --no-cache   (extra arguments go to docker build)
set -euo pipefail

CHAIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=../UPSTREAM
source "$CHAIN_DIR/UPSTREAM"
IMAGE="${SEALED_IMAGE:-sealed-node:dev}"

if [ ! -f "$CHAIN_DIR/.work/avalanchego/go.mod" ]; then
  echo "build: chain/.work/avalanchego is missing, run chain/scripts/fetch.sh first" >&2
  exit 1
fi

start=$(date +%s)
DOCKER_BUILDKIT=1 docker build \
  --build-arg "GO_VERSION=$GO_VERSION" \
  --build-arg "AVALANCHEGO_COMMIT=$AVALANCHEGO_COMMIT" \
  -t "$IMAGE" \
  -f "$CHAIN_DIR/Dockerfile" \
  "$@" \
  "$CHAIN_DIR"
echo "==> built $IMAGE in $(( $(date +%s) - start ))s"
