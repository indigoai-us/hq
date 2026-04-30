#!/usr/bin/env bash
# run-smoke-tests.sh — Build Docker images and run smoke tests for create-hq.
# Single entry point for local runs and scheduled agents.
#
# Builds both Docker images (blank-slate and pre-deps), packs create-hq locally,
# runs smoke-test.sh in each container, and generates a JSON report.
#
# Usage: ./run-smoke-tests.sh
# Output: packages/create-hq/test/results/latest.json

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
PKG_DIR="$REPO_ROOT/packages/create-hq"
DOCKER_DIR="$SCRIPT_DIR/docker"
RESULTS_DIR="$SCRIPT_DIR/results"

# Allow override (e.g. for offline runs against a checked-out hq-core).
# Default: fetched fresh per-run from indigoai-us/hq-core (see Step 1.5 below).
TEMPLATE_DIR="${TEMPLATE_DIR:-}"

IMAGES=("blank-slate" "pre-deps")
IMAGE_RESULTS=()
ALL_PASSED=true

mkdir -p "$RESULTS_DIR"

echo "╔═══════════════════════════════════════════╗"
echo "║  create-hq Smoke Tests                    ║"
echo "╚═══════════════════════════════════════════╝"
echo ""

# --- Step 1: Build create-hq and pack tarball ---
echo "=== Step 1: Building create-hq ==="
cd "$PKG_DIR"
npm run build 2>&1
TARBALL_NAME=$(npm pack 2>&1 | tail -1)
TARBALL_PATH="$PKG_DIR/$TARBALL_NAME"
echo "Packed: $TARBALL_NAME"
echo ""

# --- Step 1.5: Fetch hq-core scaffold for --local-template ---
# The repo's old `template/` subdirectory was removed when the scaffold was
# split into its own repo (indigoai-us/hq-core). Mounting a non-existent path
# silently produces an empty container-side dir, which is what was breaking
# CI before this fix. Fetch a fresh hq-core tarball into a host-side temp
# dir each run so smoke tests exercise the actual current scaffold layout.
TEMPLATE_FETCHED=false
if [ -z "$TEMPLATE_DIR" ]; then
  echo "=== Step 1.5: Fetching hq-core scaffold ==="
  TEMPLATE_DIR="$(mktemp -d -t create-hq-smoke-template.XXXXXX)"
  TEMPLATE_FETCHED=true
  TMP_TAR="$(mktemp -t hq-core-tarball.XXXXXX)"
  if ! gh api repos/indigoai-us/hq-core/tarball/HEAD > "$TMP_TAR"; then
    echo "FATAL: failed to fetch hq-core tarball via gh CLI (set GH_TOKEN or run 'gh auth login')."
    rm -f "$TMP_TAR"
    rm -rf "$TEMPLATE_DIR"
    exit 1
  fi
  tar -xzf "$TMP_TAR" -C "$TEMPLATE_DIR" --strip-components=1
  rm -f "$TMP_TAR"
  echo "Fetched scaffold to: $TEMPLATE_DIR"
  echo ""
fi

# Pre-flight regression guard. Refuse to run smoke tests against an empty or
# malformed scaffold directory — that is the failure mode that caused the
# CI red after `template/` was deleted but the test paths weren't updated.
if [ ! -f "$TEMPLATE_DIR/core.yaml" ] || [ ! -f "$TEMPLATE_DIR/.claude/CLAUDE.md" ]; then
  echo "FATAL: TEMPLATE_DIR=$TEMPLATE_DIR is missing core.yaml or .claude/CLAUDE.md."
  echo "       Either fetchTemplate produced an empty scaffold, or the hq-core layout has changed."
  [ "$TEMPLATE_FETCHED" = true ] && rm -rf "$TEMPLATE_DIR"
  exit 1
fi

# Cleanup fetched template on exit (do not delete a user-supplied dir)
if [ "$TEMPLATE_FETCHED" = true ]; then
  trap 'rm -rf "$TEMPLATE_DIR"' EXIT
fi

# --- Step 2: Build Docker images ---
echo "=== Step 2: Building Docker images ==="
for image in "${IMAGES[@]}"; do
  echo "Building create-hq-test:${image}..."
  docker build \
    -f "$DOCKER_DIR/Dockerfile.${image}" \
    -t "create-hq-test:${image}" \
    "$DOCKER_DIR" 2>&1
  echo "  Done."
done
echo ""

# --- Step 3: Run smoke tests ---
echo "=== Step 3: Running smoke tests ==="
for image in "${IMAGES[@]}"; do
  echo ""
  echo "--- Testing: ${image} ---"
  CONTAINER_NAME="create-hq-smoke-${image}-$$"

  OUTPUT=$(docker run --rm \
    --name "$CONTAINER_NAME" \
    -v "$TARBALL_PATH:/opt/create-hq/create-hq.tgz:ro" \
    -v "$TEMPLATE_DIR:/opt/create-hq/template:ro" \
    -v "$SCRIPT_DIR/smoke-test.sh:/opt/create-hq/smoke-test.sh:ro" \
    "create-hq-test:${image}" \
    bash /opt/create-hq/smoke-test.sh --image "$image" 2>&1) || true

  echo "$OUTPUT"

  # Extract JSON report from output
  JSON_LINE=$(echo "$OUTPUT" | sed -n '/^JSON_REPORT_START$/,/^JSON_REPORT_END$/p' | grep -v '^JSON_REPORT_' || echo "")

  if [ -z "$JSON_LINE" ]; then
    # No JSON report — container likely crashed
    JSON_LINE="{\"image\":\"${image}\",\"passed\":false,\"pass_count\":0,\"fail_count\":1,\"duration_ms\":0,\"assertions\":[{\"name\":\"container-run\",\"passed\":false,\"duration_ms\":0,\"message\":\"Container exited without producing a report\"}],\"logs_on_failure\":$(echo "$OUTPUT" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read()))" 2>/dev/null || echo '""')}"
    ALL_PASSED=false
  else
    # Check if this image passed
    PASSED=$(echo "$JSON_LINE" | python3 -c "import sys,json; print(json.load(sys.stdin)['passed'])" 2>/dev/null || echo "False")
    if [ "$PASSED" != "True" ]; then
      ALL_PASSED=false
      # Add logs on failure
      LOGS=$(echo "$OUTPUT" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read()))" 2>/dev/null || echo '""')
      JSON_LINE=$(echo "$JSON_LINE" | python3 -c "
import sys, json
d = json.load(sys.stdin)
d['logs_on_failure'] = $LOGS
print(json.dumps(d))
" 2>/dev/null || echo "$JSON_LINE")
    fi
  fi

  IMAGE_RESULTS+=("$JSON_LINE")
done

# --- Step 4: Cleanup ---
echo ""
echo "=== Step 4: Cleanup ==="
rm -f "$TARBALL_PATH"
echo "Removed tarball: $TARBALL_NAME"

# --- Step 5: Generate report ---
echo ""
echo "=== Step 5: Generating report ==="
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
IMAGES_JSON=$(printf '%s,' "${IMAGE_RESULTS[@]}" | sed 's/,$//')

REPORT=$(python3 -c "
import json
images = json.loads('[${IMAGES_JSON}]')
report = {
    'timestamp': '${TIMESTAMP}',
    'passed': all(i['passed'] for i in images),
    'images': images
}
print(json.dumps(report, indent=2))
" 2>/dev/null)

echo "$REPORT" > "$RESULTS_DIR/latest.json"
echo "Report written to: $RESULTS_DIR/latest.json"

# --- Summary ---
echo ""
echo "╔═══════════════════════════════════════════╗"
printf "║  %-41s ║\n" "Results"
echo "╠═══════════════════════════════════════════╣"
for image in "${IMAGES[@]}"; do
  RESULT=$(echo "$REPORT" | python3 -c "
import sys, json
r = json.load(sys.stdin)
for i in r['images']:
    if i['image'] == '${image}':
        status = 'PASS' if i['passed'] else 'FAIL'
        dur = i.get('duration_ms', 0)
        print(f'{status}  {dur}ms')
        break
" 2>/dev/null || echo "???")
  printf "║  %-15s %25s ║\n" "$image" "$RESULT"
done
echo "╠═══════════════════════════════════════════╣"
if [ "$ALL_PASSED" = true ]; then
  printf "║  %-41s ║\n" "ALL PASSED"
else
  printf "║  %-41s ║\n" "FAILURES DETECTED"
fi
echo "╚═══════════════════════════════════════════╝"

if [ "$ALL_PASSED" = true ]; then
  exit 0
else
  exit 1
fi
