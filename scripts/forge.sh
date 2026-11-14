#!/usr/bin/env bash
# Run `forge` inside the official Foundry image with contracts/ mounted.
# Usage: bash scripts/forge.sh <forge arguments>   e.g. bash scripts/forge.sh test -vv
set -euo pipefail

# Foundry v1.9.0, pinned by digest.
IMAGE="ghcr.io/foundry-rs/foundry:v1.9.0@sha256:3a392c18f9b16e665e932de159fb6fa9ed972c4b4352f2f76a1a8c7ca9b57d39"
# Named volume for the container user's home, so downloaded solc builds are reused between runs.
HOME_VOLUME="sealed-arena-foundry-home"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTRACTS="$ROOT/contracts"

# Git Bash on Windows: Docker needs a Windows path, and MSYS must not rewrite container paths.
if command -v cygpath >/dev/null 2>&1; then
  HOST_DIR="$(cygpath -w "$CONTRACTS")"
else
  HOST_DIR="$CONTRACTS"
fi

MSYS_NO_PATHCONV=1 docker run --rm \
  -v "$HOST_DIR:/work" \
  -v "$HOME_VOLUME:/home/foundry" \
  -w /work \
  --entrypoint forge \
  "$IMAGE" "$@"
