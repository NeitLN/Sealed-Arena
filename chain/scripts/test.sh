#!/usr/bin/env bash
# Run the Go tests of the patched code inside the pinned golang image.
#
# By default the source is re-fetched and chain/patches/ re-applied first, so the
# tests always run against exactly what is committed. Before re-fetching, the script
# refuses to continue if chain/.work/avalanchego holds edits that are not captured
# in chain/patches/ (run chain/scripts/make-patch.sh first).
#
# After the tests, each fuzz target of the agent rule runs for SEALED_FUZZTIME (default 60s;
# 0 skips fuzzing, as the mutation check does). The seed corpus also runs inside go test.
#
# Usage: bash chain/scripts/test.sh
#        SEALED_TEST_NO_FETCH=1 bash chain/scripts/test.sh   # test the working tree as is
#        SEALED_FUZZTIME=30m bash chain/scripts/test.sh      # longer fuzzing (nightly)
set -euo pipefail

CHAIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=../UPSTREAM
source "$CHAIN_DIR/UPSTREAM"
SRC="$CHAIN_DIR/.work/avalanchego"

# Packages and test name pattern covered by the Sealed Arena patches.
PACKAGES=(./core/ ./core/txpool/legacypool/ ./precompile/contracts/agentpolicy/ ./plugin/evm/ ./params/extras/ ./precompile/contracts/agentrulev2/ ./precompile/contracts/agentrulev3/)
RUN_PATTERN="${SEALED_TEST_RUN:-AgentRule|AgentPolicy}"
# Shared WebAuthn vectors, read by the AgentPolicy tests.
VECTORS="$CHAIN_DIR/testvectors"

if [ "${SEALED_TEST_NO_FETCH:-0}" != "1" ]; then
  if [ -d "$SRC/.git" ]; then
    if ! bash "$CHAIN_DIR/scripts/make-patch.sh" --check; then
      echo "test: chain/.work/avalanchego has edits not in chain/patches/." >&2
      echo "      Run chain/scripts/make-patch.sh, or SEALED_TEST_NO_FETCH=1 to test the tree as is." >&2
      exit 1
    fi
  fi
  bash "$CHAIN_DIR/scripts/fetch.sh"
fi

if command -v cygpath >/dev/null 2>&1; then
  HOST_SRC="$(cygpath -w "$SRC")"
  HOST_VECTORS="$(cygpath -w "$VECTORS")"
else
  HOST_SRC="$SRC"
  HOST_VECTORS="$VECTORS"
fi

# Fuzz targets (Go accepts one -fuzz target per invocation).
FUZZ_PACKAGE=./precompile/contracts/agentpolicy/
FUZZ_TARGETS=(FuzzAgentPolicyClientDataDifferential FuzzAgentPolicyVerifyWebAuthn FuzzAgentPolicyAuthDecode FuzzAgentPolicyMeet)
FUZZTIME="${SEALED_FUZZTIME:-60s}"

run_go() {
  MSYS_NO_PATHCONV=1 docker run --rm \
    -v "$HOST_SRC:/src" \
    -v "$HOST_VECTORS:/vectors:ro" \
    -e SEALED_TESTVECTORS=/vectors/webauthn.json \
    -v sealed-arena-gomod:/go/pkg/mod \
    -v sealed-arena-gocache:/root/.cache/go-build \
    -w /src/graft/subnet-evm \
    -e CGO_CFLAGS="-O2 -D__BLST_PORTABLE__" \
    "golang:${GO_VERSION}-bookworm" \
    go "$@"
}

echo "==> go test ${PACKAGES[*]} -run '$RUN_PATTERN'"
run_go test -count=1 -run "$RUN_PATTERN" "${PACKAGES[@]}"

if [ "$FUZZTIME" != "0" ]; then
  for target in "${FUZZ_TARGETS[@]}"; do
    echo "==> go test -fuzz $target -fuzztime $FUZZTIME"
    run_go test -run '^$' -fuzz "^${target}\$" -fuzztime "$FUZZTIME" "$FUZZ_PACKAGE"
  done
fi
