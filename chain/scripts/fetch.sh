#!/usr/bin/env bash
# Fetch the pinned avalanchego tag into chain/.work/avalanchego (shallow clone),
# check that the tag resolves to the pinned commit, then apply chain/patches/.
# Usage: bash chain/scripts/fetch.sh
set -euo pipefail

CHAIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=../UPSTREAM
source "$CHAIN_DIR/UPSTREAM"
SRC="$CHAIN_DIR/.work/avalanchego"

rm -rf "$SRC"
mkdir -p "$CHAIN_DIR/.work"
echo "==> cloning $AVALANCHEGO_REPO @ $AVALANCHEGO_TAG"
git -c advice.detachedHead=false clone --quiet --depth 1 --branch "$AVALANCHEGO_TAG" \
  --config core.autocrlf=false "$AVALANCHEGO_REPO" "$SRC"

actual="$(git -C "$SRC" rev-parse HEAD)"
if [ "$actual" != "$AVALANCHEGO_COMMIT" ]; then
  echo "fetch: tag $AVALANCHEGO_TAG resolves to $actual, expected $AVALANCHEGO_COMMIT" >&2
  exit 1
fi
echo "==> commit $actual matches chain/UPSTREAM"

bash "$CHAIN_DIR/scripts/apply-patches.sh"
