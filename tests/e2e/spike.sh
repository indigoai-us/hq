#!/usr/bin/env bash
set -euo pipefail

# Spike: validate whether claude -p discovers slash commands from .claude/commands/
# in a copied temp directory.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
RESULTS_FILE="$SCRIPT_DIR/spike-results.json"

# --- API key guard ---
if [[ -z "${ANTHROPIC_API_KEY:-}" ]]; then
  echo "SKIP: ANTHROPIC_API_KEY is not set. Set it and re-run to execute the spike."
  exit 0
fi

# --- Create tmpdir and schedule cleanup ---
TMPDIR_SPIKE="$(mktemp -d)"
trap 'rm -rf "$TMPDIR_SPIKE"' EXIT

echo "==> Copying template/ to $TMPDIR_SPIKE ..."
cp -R "$REPO_ROOT/template/." "$TMPDIR_SPIKE/"

# Verify .claude/commands/setup.md landed
if [[ ! -f "$TMPDIR_SPIKE/.claude/commands/setup.md" ]]; then
  echo "FAIL: .claude/commands/setup.md not found in tmpdir after copy"
  exit 1
fi

echo "==> Running claude -p \"/setup\" from tmpdir ..."

# Run claude from inside the tmpdir so it discovers .claude/commands/
STDOUT_FILE="$(mktemp)"
STDERR_FILE="$(mktemp)"
EXIT_CODE=0

(
  cd "$TMPDIR_SPIKE"
  claude -p "/setup" \
    --model claude-haiku-4-5-20251001 \
    --max-turns 3 \
    --output-format json \
    > "$STDOUT_FILE" 2> "$STDERR_FILE"
) || EXIT_CODE=$?

echo "==> claude exit code: $EXIT_CODE"
echo "==> stdout (first 500 chars):"
head -c 500 "$STDOUT_FILE"
echo ""
echo "==> stderr (first 500 chars):"
head -c 500 "$STDERR_FILE"
echo ""

# Write results JSON
cat > "$RESULTS_FILE" <<ENDJSON
{
  "exit_code": $EXIT_CODE,
  "stdout_file": "$STDOUT_FILE",
  "stderr_file": "$STDERR_FILE",
  "tmpdir": "$TMPDIR_SPIKE",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
ENDJSON

echo "==> Results written to $RESULTS_FILE"
echo "==> Review SPIKE.md and fill in pass/fail fields."
