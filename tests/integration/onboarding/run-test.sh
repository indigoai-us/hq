#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Host-side runner for the HQ onboarding clean-room integration test.
#
# Builds packages, packs tarballs, builds Docker image, runs the test.
#
# Usage:
#   bash tests/integration/onboarding/run-test.sh
#
# Prerequisites:
#   - Docker installed and running
#   - Node.js + npm available
#   - Run from the HQ repo root (C:\repos\hq)
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

# Resolve paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
STAGING_DIR="$SCRIPT_DIR/.staging"
TARBALL_DIR="$STAGING_DIR/tarballs"

HQ_CLI_DIR="$REPO_ROOT/packages/hq-cli"
CREATE_HQ_DIR="$REPO_ROOT/packages/create-hq"

cleanup() {
  echo "=== Cleanup ==="
  if [ -d "$STAGING_DIR" ]; then
    echo "  Removing staging directory..."
    rm -rf "$STAGING_DIR"
  fi
  echo "  Done."
}

trap cleanup EXIT

echo "=== HQ Onboarding Clean Room Test ==="
echo "  Repo root: $REPO_ROOT"
echo ""

# ─── Step 1: Build hq-cli ───────────────────────────────────────────────────

echo "=== Building @indigoai-us/hq-cli ==="
cd "$HQ_CLI_DIR"
npm run build
echo "  Built successfully."

# ─── Step 2: Build create-hq ────────────────────────────────────────────────

echo "=== Building create-hq ==="
cd "$CREATE_HQ_DIR"
npm run build
echo "  Built successfully."

# ─── Step 3: Pack tarballs ───────────────────────────────────────────────────
# npm pack triggers the prepack script in create-hq/package.json which copies
# the template into the package, and postpack removes it after packing.

echo "=== Packing tarballs ==="
mkdir -p "$TARBALL_DIR"

cd "$HQ_CLI_DIR"
HQ_CLI_TGZ=$(npm pack --pack-destination "$TARBALL_DIR" 2>&1 | tail -1)
echo "  hq-cli: $HQ_CLI_TGZ"

cd "$CREATE_HQ_DIR"
CREATE_HQ_TGZ=$(npm pack --pack-destination "$TARBALL_DIR" 2>&1 | tail -1)
echo "  create-hq: $CREATE_HQ_TGZ"

echo "  Tarballs in: $TARBALL_DIR"
ls -la "$TARBALL_DIR"

# ─── Step 4: Build Docker image ─────────────────────────────────────────────

echo ""
echo "=== Building Docker image ==="
cd "$SCRIPT_DIR"
docker build -t hq-onboarding-test .
echo "  Image built successfully."

# ─── Step 5: Run the test ────────────────────────────────────────────────────

echo ""
echo "=== Running clean room test ==="
echo ""

# Capture exit code without letting set -e terminate the script
set +e
docker run --rm hq-onboarding-test
EXIT_CODE=$?
set -e

exit $EXIT_CODE
