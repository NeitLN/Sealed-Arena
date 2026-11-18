#!/usr/bin/env bash
# Build a Subnet-EVM plugin WITHOUT the agent rule, for the test in this directory.
#
# Same pinned avalanchego tag, with chain/patches/0002 (the AgentPolicy precompile, so the node
# accepts the genesis and the mandates) but not 0003 (the validity rule). A node running this
# plugin takes an agent's forbidden transaction into its pool and puts it in the blocks it builds;
# the point of the test is that the nodes running the rule reject those blocks.
#
# Output: chain/build/norule-plugins/<Subnet-EVM VM ID>
# Usage:  bash chain/tests/byzantine/build-norule.sh
set -euo pipefail

CHAIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=../../UPSTREAM
source "$CHAIN_DIR/UPSTREAM"
SRC="$CHAIN_DIR/.work/avalanchego-norule"
OUT="$CHAIN_DIR/build/norule-plugins"
VM_ID="srEXiWaHuhNyGwPUi444Tu47ZEDwxTWrbQiuD7FmgSAQ6X7Dy"

rm -rf "$SRC"
mkdir -p "$CHAIN_DIR/.work" "$OUT"
echo "==> cloning $AVALANCHEGO_REPO @ $AVALANCHEGO_TAG"
git -c advice.detachedHead=false clone --quiet --depth 1 --branch "$AVALANCHEGO_TAG" \
  --config core.autocrlf=false "$AVALANCHEGO_REPO" "$SRC"
actual="$(git -C "$SRC" rev-parse HEAD)"
if [ "$actual" != "$AVALANCHEGO_COMMIT" ]; then
  echo "build-norule: tag $AVALANCHEGO_TAG resolves to $actual, expected $AVALANCHEGO_COMMIT" >&2
  exit 1
fi
echo "==> applying 0002-agentpolicy-precompile.patch only (no agent rule)"
git -C "$SRC" apply --whitespace=nowarn "$CHAIN_DIR/patches/0002-agentpolicy-precompile.patch"
if grep -q "CheckAgentTx" "$SRC/graft/subnet-evm/core/state_transition.go"; then
  echo "build-norule: the agent rule is present; this build must not have it" >&2
  exit 1
fi

if command -v cygpath >/dev/null 2>&1; then
  HOST_SRC="$(cygpath -w "$SRC")"
  HOST_OUT="$(cygpath -w "$OUT")"
else
  HOST_SRC="$SRC"
  HOST_OUT="$OUT"
fi

echo "==> building the plugin"
MSYS_NO_PATHCONV=1 docker run --rm \
  -v "$HOST_SRC:/src" \
  -v "$HOST_OUT:/out" \
  -v sealed-arena-gomod:/go/pkg/mod \
  -v sealed-arena-gocache:/root/.cache/go-build \
  -w /src \
  -e CGO_CFLAGS="-O2 -D__BLST_PORTABLE__" \
  "golang:${GO_VERSION}-bookworm" \
  ./graft/subnet-evm/scripts/build.sh "/out/$VM_ID"
echo "==> built $OUT/$VM_ID"
