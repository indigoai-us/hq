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
TEMPLATE_DIR="$REPO_ROOT/template"

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
    # No JSON report — container likely crashed.
    # Write logs to a temp file and let python read it (never interpolate
    # untrusted output into a python -c source string).
    LOGS_FILE=$(mktemp)
    printf '%s' "$OUTPUT" > "$LOGS_FILE"
    JSON_LINE=$(IMAGE="$image" LOGS_FILE="$LOGS_FILE" python3 -c '
import json, os
with open(os.environ["LOGS_FILE"], "r", errors="replace") as f:
    logs = f.read()
print(json.dumps({
    "image": os.environ["IMAGE"],
    "passed": False,
    "pass_count": 0,
    "fail_count": 1,
    "duration_ms": 0,
    "assertions": [{
        "name": "container-run",
        "passed": False,
        "duration_ms": 0,
        "message": "Container exited without producing a report",
    }],
    "logs_on_failure": logs,
}))
')
    rm -f "$LOGS_FILE"
    ALL_PASSED=false
  else
    # Check if this image passed
    PASSED=$(echo "$JSON_LINE" | python3 -c "import sys,json; print(json.load(sys.stdin)['passed'])" 2>/dev/null || echo "False")
    if [ "$PASSED" != "True" ]; then
      ALL_PASSED=false
      # Add logs on failure — use temp files to avoid bash → python source interpolation,
      # which crashed on quotes/newlines/dollar signs in container output and left
      # latest.json un-updated on failed runs.
      LOGS_FILE=$(mktemp)
      JSON_FILE=$(mktemp)
      printf '%s' "$OUTPUT" > "$LOGS_FILE"
      printf '%s' "$JSON_LINE" > "$JSON_FILE"
      JSON_LINE=$(LOGS_FILE="$LOGS_FILE" JSON_FILE="$JSON_FILE" python3 -c '
import json, os
with open(os.environ["LOGS_FILE"], "r", errors="replace") as f:
    logs = f.read()
with open(os.environ["JSON_FILE"], "r", errors="replace") as f:
    d = json.load(f)
d["logs_on_failure"] = logs
print(json.dumps(d))
' 2>/dev/null || echo "$JSON_LINE")
      rm -f "$LOGS_FILE" "$JSON_FILE"
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

# Write per-image JSON lines to a temp file (one per line). Reading them from
# disk avoids the shell → python source interpolation that crashed when image
# results contained quotes/newlines (e.g. logs_on_failure embedded text).
IMAGES_FILE=$(mktemp)
for img_json in "${IMAGE_RESULTS[@]}"; do
  printf '%s\n' "$img_json" >> "$IMAGES_FILE"
done

REPORT=$(TIMESTAMP="$TIMESTAMP" IMAGES_FILE="$IMAGES_FILE" python3 -c '
import json, os
images = []
with open(os.environ["IMAGES_FILE"], "r", errors="replace") as f:
    for line in f:
        line = line.strip()
        if not line:
            continue
        images.append(json.loads(line))
report = {
    "timestamp": os.environ["TIMESTAMP"],
    "passed": all(i["passed"] for i in images),
    "images": images,
}
print(json.dumps(report, indent=2))
')
rm -f "$IMAGES_FILE"

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
