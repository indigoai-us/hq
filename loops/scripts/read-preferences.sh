#!/usr/bin/env bash
# read-preferences.sh -- Read preferences for a company/action
#
# Agents call this before executing a skill to check if the user has
# already expressed preferences for a given action. Works with
# check-escalation.sh to implement ask_once_then_remember and
# ask_until_confident policies.
#
# Usage:
#   read-preferences --company <slug> --action <action>          # Human-readable
#   read-preferences --company <slug> --action <action> --json   # JSON output
#   read-preferences --company <slug> --action <action> --count  # Count only
#   read-preferences --company <slug>                            # All preferences
#   read-preferences --help
#
# Environment:
#   GHQ_ROOT  Override the GHQ root directory (default: auto-detected)
#
# Exit codes:
#   0  Success (preferences found or empty list)
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
Usage: read-preferences --company <slug> [--action <action>] [--json] [--count]

Read preferences for a company, optionally filtered by action.

Arguments:
  --company, -c    Company slug (e.g., launch-grid)
  --action, -a     Filter to a specific action (optional)
  --json           Output in JSON format
  --count          Output only the count of matching preferences
  --help, -h       Show this help

Examples:
  read-preferences -c launch-grid                         # All preferences
  read-preferences -c launch-grid -a deploy --json        # Deploy prefs as JSON
  read-preferences -c launch-grid -a refactor --count     # Count refactor prefs
EOF
  exit "${1:-0}"
}

# -------------------------------------------------
# Parse arguments
# -------------------------------------------------
COMPANY=""
ACTION=""
JSON_OUTPUT=false
COUNT_ONLY=false

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
    --json)
      JSON_OUTPUT=true; shift
      ;;
    --count)
      COUNT_ONLY=true; shift
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

if [[ -z "$COMPANY" ]]; then
  echo "Error: --company is required" >&2
  usage 1
fi

# -------------------------------------------------
# Locate preferences file
# -------------------------------------------------
COMPANY_DIR="$GHQ/companies/$COMPANY"

# Follow symlinks if needed
if [[ -L "$COMPANY_DIR" ]]; then
  COMPANY_DIR=$(readlink -f "$COMPANY_DIR" 2>/dev/null || readlink "$COMPANY_DIR")
fi

POLICIES_DIR="$COMPANY_DIR/policies"
if [[ ! -d "$POLICIES_DIR" ]]; then
  echo "Error: policies directory not found for company '$COMPANY'" >&2
  exit 2
fi

PREFS_FILE="$POLICIES_DIR/preferences.yaml"

# -------------------------------------------------
# Read and filter preferences
# -------------------------------------------------
python3 -c "
import yaml, json, sys, os

prefs_file = sys.argv[1]
action = sys.argv[2] if sys.argv[2] else None
json_output = sys.argv[3] == 'true'
count_only = sys.argv[4] == 'true'
company = sys.argv[5]

# Load preferences
if os.path.exists(prefs_file):
    with open(prefs_file) as f:
        data = yaml.safe_load(f) or {}
else:
    data = {}

all_prefs = data.get('preferences', [])

# Filter by action if specified
if action:
    prefs = [p for p in all_prefs if isinstance(p, dict) and p.get('action') == action]
else:
    prefs = [p for p in all_prefs if isinstance(p, dict)]

if count_only:
    print(len(prefs))
elif json_output:
    output = {
        'company': company,
        'action': action,
        'count': len(prefs),
        'preferences': prefs,
    }
    print(json.dumps(output, indent=2, default=str))
else:
    if not prefs:
        if action:
            print(f'No preferences found for {company}/{action}')
        else:
            print(f'No preferences found for {company}')
    else:
        print(f'Preferences for {company}' + (f'/{action}' if action else '') + f' ({len(prefs)} entries):')
        for p in prefs:
            print(f\"  [{p.get('date', 'unknown')}] {p.get('action', '?')}: {p.get('answer', '?')}\")
            if p.get('question'):
                print(f\"    Q: {p['question']}\")
            if p.get('applies_to'):
                print(f\"    Scope: {p['applies_to']}\")
            if p.get('decision_id'):
                print(f\"    Decision: {p['decision_id']}\")
" "$PREFS_FILE" "${ACTION:-}" "$JSON_OUTPUT" "$COUNT_ONLY" "$COMPANY"
