#!/usr/bin/env bash
# Turn the edits in chain/.work/avalanchego into a patch file in chain/patches/.
#
# The whole diff against the pinned upstream commit goes into ONE patch file, so
# chain/patches/ is expected to hold a single file (the current one is replaced).
#
# Usage: bash chain/scripts/make-patch.sh [name]   # default: the existing patch name
#        bash chain/scripts/make-patch.sh --check  # exit 0 if chain/patches/ matches the tree
set -euo pipefail

CHAIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$CHAIN_DIR/.work/avalanchego"
PATCH_DIR="$CHAIN_DIR/patches"

if [ ! -d "$SRC/.git" ]; then
  echo "make-patch: $SRC is missing, run chain/scripts/fetch.sh first" >&2
  exit 1
fi

current_diff() {
  # Include new files: mark them intent-to-add so `git diff` shows them.
  git -C "$SRC" add --all --intent-to-add .
  git -C "$SRC" -c core.autocrlf=false diff --binary HEAD
}

shopt -s nullglob
existing=("$PATCH_DIR"/*.patch)

if [ "${1:-}" = "--check" ]; then
  committed="$(cat "${existing[@]}" /dev/null)"
  if [ "$(current_diff)" = "$committed" ]; then
    exit 0
  fi
  exit 1
fi

name="${1:-}"
if [ -z "$name" ]; then
  if [ "${#existing[@]}" -ne 1 ]; then
    echo "make-patch: give a patch name, e.g. 0001-spike-agent-rule.patch" >&2
    exit 1
  fi
  name="$(basename "${existing[0]}")"
fi
case "$name" in *.patch) ;; *) name="$name.patch" ;; esac

diff="$(current_diff)"
if [ -z "$diff" ]; then
  echo "make-patch: no edits in $SRC" >&2
  exit 1
fi
for p in "${existing[@]}"; do
  [ "$(basename "$p")" = "$name" ] || { echo "==> removing $(basename "$p")"; rm "$p"; }
done
printf '%s\n' "$diff" > "$PATCH_DIR/$name"
echo "==> wrote chain/patches/$name"
git -C "$SRC" diff --stat HEAD
