#!/usr/bin/env bash
# Apply every chain/patches/*.patch (sorted by name) to chain/.work/avalanchego.
# Usage: bash chain/scripts/apply-patches.sh
set -euo pipefail

CHAIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$CHAIN_DIR/.work/avalanchego"

if [ ! -d "$SRC/.git" ]; then
  echo "apply-patches: $SRC is missing, run chain/scripts/fetch.sh first" >&2
  exit 1
fi

shopt -s nullglob
patches=("$CHAIN_DIR"/patches/*.patch)
if [ "${#patches[@]}" -eq 0 ]; then
  echo "==> no patches in chain/patches"
  exit 0
fi
for p in "${patches[@]}"; do
  echo "==> applying $(basename "$p")"
  git -C "$SRC" apply --whitespace=nowarn "$p"
done
