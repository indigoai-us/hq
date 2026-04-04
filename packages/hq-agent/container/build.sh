#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TAG="${1:-hq-cloud-agent:latest}"

echo "[build] Building agent container image: $TAG"
docker build -t "$TAG" "$SCRIPT_DIR"
echo "[build] Done: $TAG"
