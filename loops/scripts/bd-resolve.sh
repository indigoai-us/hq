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
#   5. Writes to preferences.yaml if the decision has company/action context
#
# Exit codes:
#   0  Success
#   1  Invalid arguments or issue not found
#   2  Issue is not a decision type
#   3  Issue is already closed

set -euo pipefail

BD="${BD_CMD:-bd}"

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
ISSUE_JSON=$($BD show "$ISSUE_ID" --json 2>&1) || {
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
$BD update "$ISSUE_ID" --metadata "$METADATA_JSON" --quiet 2>/dev/null || true

# Add a comment documenting the resolution
$BD comments "$ISSUE_ID" add "Decision resolved: $ANSWER" --quiet 2>/dev/null || true

# Close the issue
$BD close "$ISSUE_ID" --reason "resolved" --quiet 2>/dev/null || true

# ─────────────────────────────────────────────────
# Write preference (if company/action context exists)
# ─────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WRITE_PREF="$SCRIPT_DIR/write-preference.sh"

if [[ -x "$WRITE_PREF" ]]; then
  # Extract company and action from issue metadata or labels
  PREF_INFO=$(echo "$ISSUE_JSON" | python3 -c "
import sys, json
data = json.load(sys.stdin)
issue = data[0] if isinstance(data, list) else data
meta = issue.get('metadata', {})
labels = issue.get('labels', [])

# Company: from metadata.company or first company-like label
company = meta.get('company', '')
if not company:
    # Try to find company from labels
    for label in labels:
        if label in ('launch-grid', 'production-house'):
            company = label
            break

# Action: from metadata.action or metadata.escalation_action
action = meta.get('action', '') or meta.get('escalation_action', '')

# Question: from issue title
question = issue.get('title', '')

# Applies_to: from metadata.applies_to or 'all'
applies_to = meta.get('applies_to', 'all')

if company and action:
    print(f'{company}|{action}|{question}|{applies_to}')
else:
    print('')
" 2>/dev/null) || true

  if [[ -n "$PREF_INFO" ]]; then
    IFS='|' read -r PREF_COMPANY PREF_ACTION PREF_QUESTION PREF_APPLIES_TO <<< "$PREF_INFO"
    "$WRITE_PREF" \
      --company "$PREF_COMPANY" \
      --action "$PREF_ACTION" \
      --question "$PREF_QUESTION" \
      --answer "$ANSWER" \
      --applies-to "$PREF_APPLIES_TO" \
      --decision-id "$ISSUE_ID" 2>/dev/null || true
  fi
fi

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
