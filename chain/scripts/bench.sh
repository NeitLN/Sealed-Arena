#!/usr/bin/env bash
# Benchmarks of the agent rule (core.BenchmarkCheckAgentTx) inside the pinned golang image, on the
# working tree as it is (run chain/scripts/fetch.sh first).
# Usage: bash chain/scripts/bench.sh [benchtime, default 2s]
set -euo pipefail
CHAIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=../UPSTREAM
source "$CHAIN_DIR/UPSTREAM"
SRC="$CHAIN_DIR/.work/avalanchego"
[ -d "$SRC" ] || { echo "bench: run chain/scripts/fetch.sh first" >&2; exit 1; }
HOST_SRC="$SRC"
command -v cygpath >/dev/null 2>&1 && HOST_SRC="$(cygpath -w "$SRC")"
MSYS_NO_PATHCONV=1 docker run --rm \
  -v "$HOST_SRC:/src" \
  -v sealed-arena-gomod:/go/pkg/mod \
  -v sealed-arena-gocache:/root/.cache/go-build \
  -w /src/graft/subnet-evm \
  -e CGO_CFLAGS="-O2 -D__BLST_PORTABLE__" \
  "golang:${GO_VERSION}-bookworm" \
  go test -count=1 -run '^$' -bench 'CheckAgentTx' -benchtime "${1:-2s}" ./core/
