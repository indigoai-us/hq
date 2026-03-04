#!/usr/bin/env bash
# write-preference.sh -- Write a preference entry to a company's preferences.yaml
#
# Creates or appends to companies/{company}/policies/preferences.yaml.
# Called automatically by bd-resolve when resolving decision tasks, or
# manually by agents to record learned preferences.
#
# Usage:
#   write-preference --company <slug> --action <action> --question <text> --answer <text> --applies-to <scope>
#   write-preference --company <slug> --action <action> --question <text> --answer <text> --applies-to <scope> --decision-id <id>
#   write-preference --help
#
# Schema (preferences.yaml):
#   preferences:
#     - action: deploy
#       question: "Should I deploy to production?"
#       answer: "Yes, deploy freely"
#       date: "2026-03-01T12:00:00Z"
#       applies_to: all
#       decision_id: ghq-abc123   # optional: links back to the resolved decision
#
# Environment:
#   GHQ_ROOT  Override the GHQ root directory (default: auto-detected)
#
# Exit codes:
#   0  Success
#   1  Invalid arguments or missing required flags
#   2  Company not found or policies directory missing

set -euo pipefail

# -------------------------------------------------
# Resolve GHQ root
# -------------------------------------------------
if [[ -n "${GHQ_ROOT:-}" ]]; then
  GHQ="$GHQ_ROOT"
else
  SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
  GHQ="$(cd "$SCRIPT_DIR/../.." && pwd)"
fi

# -------------------------------------------------
# Usage
# -------------------------------------------------
usage() {
  cat <<'EOF'
Usage: write-preference --company <slug> --action <action> --question <text> --answer <text> --applies-to <scope> [--decision-id <id>]

Write a preference entry to a company's preferences.yaml.

Arguments:
  --company, -c       Company slug (e.g., launch-grid)
  --action, -a        Action this preference applies to (e.g., deploy, push)
  --question, -q      The question that was asked
  --answer, -A        The answer/preference to remember
  --applies-to, -s    Scope: all, <skill-name>, or <domain> (e.g., backend, frontend)
  --decision-id, -d   Optional: ID of the bd decision task this came from
  --help, -h          Show this help

Examples:
  write-preference -c launch-grid -a deploy -q "Deploy to prod?" -A "Yes" -s all
  write-preference -c launch-grid -a push -q "Push to remote?" -A "Always push" -s all -d ghq-dec1
EOF
  exit "${1:-0}"
}

# -------------------------------------------------
# Parse arguments
# -------------------------------------------------
COMPANY=""
ACTION=""
QUESTION=""
ANSWER=""
APPLIES_TO=""
DECISION_ID=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --help|-h)
      usage 0
      ;;
    --company|-c)
      [[ -z "${2:-}" ]] && { echo "Error: --company requires a value" >&2; exit 1; }
      COMPANY="$2"; shift 2
      ;;
    --action|-a)
      [[ -z "${2:-}" ]] && { echo "Error: --action requires a value" >&2; exit 1; }
      ACTION="$2"; shift 2
      ;;
    --question|-q)
      [[ -z "${2:-}" ]] && { echo "Error: --question requires a value" >&2; exit 1; }
      QUESTION="$2"; shift 2
      ;;
    --answer|-A)
      [[ -z "${2:-}" ]] && { echo "Error: --answer requires a value" >&2; exit 1; }
      ANSWER="$2"; shift 2
      ;;
    --applies-to|-s)
      [[ -z "${2:-}" ]] && { echo "Error: --applies-to requires a value" >&2; exit 1; }
      APPLIES_TO="$2"; shift 2
      ;;
    --decision-id|-d)
      [[ -z "${2:-}" ]] && { echo "Error: --decision-id requires a value" >&2; exit 1; }
      DECISION_ID="$2"; shift 2
      ;;
    -*)
      echo "Error: unknown flag '$1'" >&2
      usage 1
      ;;
    *)
      echo "Error: unexpected argument '$1'" >&2
      usage 1
      ;;
  esac
done

# Validate required fields
for field_name in COMPANY ACTION QUESTION ANSWER APPLIES_TO; do
  if [[ -z "${!field_name}" ]]; then
    flag="${field_name,,}"
    flag="${flag//_/-}"
    echo "Error: --${flag} is required" >&2
    usage 1
  fi
done

# -------------------------------------------------
# Locate policies directory
# -------------------------------------------------
COMPANY_DIR="$GHQ/companies/$COMPANY"

# Follow symlinks if needed
if [[ -L "$COMPANY_DIR" ]]; then
  COMPANY_DIR=$(readlink -f "$COMPANY_DIR" 2>/dev/null || readlink "$COMPANY_DIR")
fi

POLICIES_DIR="$COMPANY_DIR/policies"
if [[ ! -d "$POLICIES_DIR" ]]; then
  echo "Error: policies directory not found for company '$COMPANY'" >&2
  echo "  Expected: $POLICIES_DIR" >&2
  exit 2
fi

PREFS_FILE="$POLICIES_DIR/preferences.yaml"

# -------------------------------------------------
# Write preference entry
# -------------------------------------------------
DATE=$(date -u +%Y-%m-%dT%H:%M:%SZ)

python3 -c "
import yaml, sys, os

prefs_file = sys.argv[1]
action = sys.argv[2]
question = sys.argv[3]
answer = sys.argv[4]
applies_to = sys.argv[5]
date = sys.argv[6]
decision_id = sys.argv[7] if len(sys.argv) > 7 and sys.argv[7] else None

# Load existing preferences or start fresh
if os.path.exists(prefs_file):
    with open(prefs_file) as f:
        data = yaml.safe_load(f) or {}
else:
    data = {}

if 'preferences' not in data:
    data['preferences'] = []

# Build new entry
entry = {
    'action': action,
    'question': question,
    'answer': answer,
    'date': date,
    'applies_to': applies_to,
}
if decision_id:
    entry['decision_id'] = decision_id

data['preferences'].append(entry)

# Write back
with open(prefs_file, 'w') as f:
    yaml.dump(data, f, default_flow_style=False, sort_keys=False, allow_unicode=True)
" "$PREFS_FILE" "$ACTION" "$QUESTION" "$ANSWER" "$APPLIES_TO" "$DATE" "${DECISION_ID:-}"

echo "Preference written: $ACTION -> $ANSWER"
echo "  Company: $COMPANY"
echo "  File: $PREFS_FILE"
