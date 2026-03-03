#!/usr/bin/env bash
# bd-resolve.sh -- Resolve a decision task with a structured answer
#
# Closes a decision-type issue and records the answer in its metadata.
# This extends bd with "resolve" semantics for the scheduler's escalation system.
#
# Usage:
#   bd-resolve <id> --answer <text>     # Resolve with answer text
#   bd-resolve <id> -a <text>           # Short form
#   bd-resolve --help                   # Show usage
#
# What it does:
#   1. Validates the issue exists and is type=decision
#   2. Records the answer in metadata (resolution_answer, resolved_at, resolved_by)
#   3. Adds a comment with the answer text
#   4. Closes the issue with reason="resolved"
#
# Exit codes:
#   0  Success
#   1  Invalid arguments or issue not found
#   2  Issue is not a decision type
#   3  Issue is already closed

set -euo pipefail

# ─────────────────────────────────────────────────
# Usage
# ─────────────────────────────────────────────────
usage() {
  cat <<'EOF'
Usage: bd-resolve <id> --answer <text>

Resolve a decision-type issue with a structured answer.

Arguments:
  <id>             Issue ID (e.g., ghq-abc123)
  --answer, -a     The resolution answer text (required)
  --json           Output in JSON format
  --help, -h       Show this help

Examples:
  bd-resolve ghq-abc --answer "Use PostgreSQL for the data layer"
  bd-resolve ghq-abc -a "Approved with modifications"
EOF
  exit "${1:-0}"
}

# ─────────────────────────────────────────────────
# Parse arguments
# ─────────────────────────────────────────────────
ISSUE_ID=""
ANSWER=""
JSON_OUTPUT=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --help|-h)
      usage 0
      ;;
    --answer|-a)
      if [[ -z "${2:-}" ]]; then
        echo "Error: --answer requires a value" >&2
        exit 1
      fi
      ANSWER="$2"
      shift 2
      ;;
    --json)
      JSON_OUTPUT=true
      shift
      ;;
    -*)
      echo "Error: unknown flag '$1'" >&2
      usage 1
      ;;
    *)
      if [[ -z "$ISSUE_ID" ]]; then
        ISSUE_ID="$1"
      else
        echo "Error: unexpected argument '$1'" >&2
        usage 1
      fi
      shift
      ;;
  esac
done

if [[ -z "$ISSUE_ID" ]]; then
  echo "Error: issue ID is required" >&2
  usage 1
fi

if [[ -z "$ANSWER" ]]; then
  echo "Error: --answer is required" >&2
  usage 1
fi

# ─────────────────────────────────────────────────
# Validate issue
# ─────────────────────────────────────────────────
ISSUE_JSON=$(bd show "$ISSUE_ID" --json 2>&1) || {
  echo "Error: issue '$ISSUE_ID' not found" >&2
  exit 1
}

# Extract fields using python3 (available on macOS)
ISSUE_TYPE=$(echo "$ISSUE_JSON" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0]['issue_type'] if isinstance(d,list) else d['issue_type'])" 2>/dev/null)
ISSUE_STATUS=$(echo "$ISSUE_JSON" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0]['status'] if isinstance(d,list) else d['status'])" 2>/dev/null)

if [[ "$ISSUE_TYPE" != "decision" ]]; then
  echo "Error: issue '$ISSUE_ID' is type '$ISSUE_TYPE', not 'decision'" >&2
  exit 2
fi

if [[ "$ISSUE_STATUS" == "closed" ]]; then
  echo "Error: issue '$ISSUE_ID' is already closed" >&2
  exit 3
fi

# ─────────────────────────────────────────────────
# Resolve the decision
# ─────────────────────────────────────────────────
RESOLVED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
RESOLVED_BY="${BD_ACTOR:-${USER:-unknown}}"

# Build metadata JSON -- escape the answer for JSON safety
METADATA_JSON=$(python3 -c "
import json, sys
answer = sys.argv[1]
resolved_at = sys.argv[2]
resolved_by = sys.argv[3]
print(json.dumps({
    'resolution_answer': answer,
    'resolved_at': resolved_at,
    'resolved_by': resolved_by
}))
" "$ANSWER" "$RESOLVED_AT" "$RESOLVED_BY")

# Update metadata with resolution details
bd update "$ISSUE_ID" --metadata "$METADATA_JSON" --quiet 2>/dev/null || true

# Add a comment documenting the resolution
bd comments "$ISSUE_ID" add "Decision resolved: $ANSWER" --quiet 2>/dev/null || true

# Close the issue
bd close "$ISSUE_ID" --reason "resolved" --quiet 2>/dev/null || true

# ─────────────────────────────────────────────────
# Output
# ─────────────────────────────────────────────────
if [[ "$JSON_OUTPUT" == true ]]; then
  python3 -c "
import json, sys
print(json.dumps({
    'id': sys.argv[1],
    'status': 'closed',
    'resolution_answer': sys.argv[2],
    'resolved_at': sys.argv[3],
    'resolved_by': sys.argv[4]
}, indent=2))
" "$ISSUE_ID" "$ANSWER" "$RESOLVED_AT" "$RESOLVED_BY"
else
  echo "Resolved: $ISSUE_ID"
  echo "  Answer: $ANSWER"
  echo "  By: $RESOLVED_BY at $RESOLVED_AT"
fi
