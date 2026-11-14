#!/usr/bin/env bash
# Turn the edits in chain/.work/avalanchego into a patch file in chain/patches/.
#
# fetch.sh applies chain/patches/*.patch in name order and commits each one in the
# work clone ("patch: <file name>"). Edits on top of that are captured here:
#   - name of the TOP applied patch: the patch is regenerated to include the edits;
#   - a new name: the edits become a new patch on top.
# Only the top patch can be regenerated; to change an earlier one, fetch, edit, and
# regenerate the patches above it in order.
#
# Usage: bash chain/scripts/make-patch.sh <name>.patch
#        bash chain/scripts/make-patch.sh --check   # exit 0 if the tree has no edits outside chain/patches/
set -euo pipefail

CHAIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$CHAIN_DIR/.work/avalanchego"
PATCH_DIR="$CHAIN_DIR/patches"
GIT=(git -C "$SRC" -c core.autocrlf=false -c user.name=sealed-patches -c user.email=patches@localhost)

if [ ! -d "$SRC/.git" ]; then
  echo "make-patch: $SRC is missing, run chain/scripts/fetch.sh first" >&2
  exit 1
fi

# Mark new files intent-to-add so `git diff` shows them.
"${GIT[@]}" add --all --intent-to-add .

if [ "${1:-}" = "--check" ]; then
  "${GIT[@]}" diff --quiet HEAD
  exit $?
fi

name="${1:-}"
[ -n "$name" ] || { echo "usage: make-patch.sh <name>.patch | --check" >&2; exit 2; }
case "$name" in *.patch) ;; *) name="$name.patch" ;; esac
subject="patch: $name"

top_subject="$("${GIT[@]}" log -1 --format=%s)"
if [ "$top_subject" = "$subject" ]; then
  base="HEAD~1"           # regenerate the top patch
elif "${GIT[@]}" log --format=%s | grep -qxF "$subject"; then
  echo "make-patch: $name is applied but is not the top patch ($top_subject)" >&2
  exit 1
else
  base="HEAD"             # new patch on top
fi

diff="$("${GIT[@]}" diff --binary "$base")"
if [ -z "$diff" ]; then
  echo "make-patch: no edits for $name" >&2
  exit 1
fi
printf '%s\n' "$diff" > "$PATCH_DIR/$name"

# Record the patch in the work clone so the tree is clean again.
"${GIT[@]}" add --all
if [ "$base" = "HEAD~1" ]; then
  "${GIT[@]}" commit --quiet --no-verify --amend -m "$subject"
else
  "${GIT[@]}" commit --quiet --no-verify -m "$subject"
fi
echo "==> wrote chain/patches/$name"
"${GIT[@]}" diff --stat HEAD~1 HEAD
