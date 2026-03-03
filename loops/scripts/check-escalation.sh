#!/usr/bin/env bash
# check-escalation.sh -- Check escalation policy before taking action
#
# Reads a company's escalation policy and determines whether an agent should
# ask the user or proceed autonomously for a given action.
#
# Usage:
#   check-escalation --company <slug> --action <action>
#   check-escalation --company <slug> --action <action> --json
#   check-escalation --help
#
# Policy types:
#   always_ask             -- Always escalate to the user
#   autonomous             -- Agent proceeds without asking
#   ask_once_then_remember -- Ask the first time, then use the remembered answer
#   ask_until_confident    -- Ask until N consistent answers (confidence_threshold)
#
# Integration:
#   When the result is "ask", the calling agent should:
#     1. Create a bd decision task (owner: user) that blocks the current task
#     2. Comment context on the decision task
#     3. Exit and wait for the user to resolve the decision via bd-resolve
#
# Environment:
#   GHQ_ROOT  Override the GHQ root directory (default: auto-detected)
#
# Exit codes:
#   0  Success (result printed to stdout: "ask" or "autonomous")
#   1  Invalid arguments or missing required flags
#   2  Company not found or escalation.yaml missing
#   3  Invalid policy configuration

set -euo pipefail

# ─────────────────────────────────────────────────
# Resolve GHQ root
# ─────────────────────────────────────────────────
if [[ -n "${GHQ_ROOT:-}" ]]; then
  GHQ="$GHQ_ROOT"
else
  SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
  GHQ="$(cd "$SCRIPT_DIR/../.." && pwd)"
fi

# ─────────────────────────────────────────────────
# Usage
# ─────────────────────────────────────────────────
usage() {
  cat <<'EOF'
Usage: check-escalation --company <slug> --action <action> [--json]

Check escalation policy for a company action.

Arguments:
  --company, -c    Company slug (e.g., launch-grid)
  --action, -a     Action to check (e.g., deploy, commit, refactor)
  --json           Output in JSON format
  --help, -h       Show this help

Output (stdout):
  "ask"        -- Agent must escalate to the user
  "autonomous" -- Agent may proceed without asking

Policy Types:
  always_ask             Always ask the user before proceeding
  autonomous             Agent proceeds without asking
  ask_once_then_remember Ask the first time, then remember the answer
  ask_until_confident    Ask until N consistent answers are recorded

Examples:
  check-escalation --company launch-grid --action deploy
  check-escalation -c production-house -a commit --json
EOF
  exit "${1:-0}"
}

# ─────────────────────────────────────────────────
# Parse arguments
# ─────────────────────────────────────────────────
COMPANY=""
ACTION=""
JSON_OUTPUT=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --help|-h)
      usage 0
      ;;
    --company|-c)
      if [[ -z "${2:-}" ]]; then
        echo "Error: --company requires a value" >&2
        exit 1
      fi
      COMPANY="$2"
      shift 2
      ;;
    --action|-a)
      if [[ -z "${2:-}" ]]; then
        echo "Error: --action requires a value" >&2
        exit 1
      fi
      ACTION="$2"
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
      echo "Error: unexpected argument '$1'" >&2
      usage 1
      ;;
  esac
done

if [[ -z "$COMPANY" ]]; then
  echo "Error: --company is required" >&2
  usage 1
fi

if [[ -z "$ACTION" ]]; then
  echo "Error: --action is required" >&2
  usage 1
fi

# ─────────────────────────────────────────────────
# Locate policy file
# ─────────────────────────────────────────────────
POLICY_FILE="$GHQ/companies/$COMPANY/policies/escalation.yaml"

# Follow symlinks if the companies dir uses them
if [[ -L "$GHQ/companies/$COMPANY" ]]; then
  REAL_DIR=$(readlink -f "$GHQ/companies/$COMPANY" 2>/dev/null || readlink "$GHQ/companies/$COMPANY")
  POLICY_FILE="$REAL_DIR/policies/escalation.yaml"
fi

if [[ ! -f "$POLICY_FILE" ]]; then
  echo "Error: escalation policy not found for company '$COMPANY'" >&2
  echo "  Expected: $POLICY_FILE" >&2
  exit 2
fi

# ─────────────────────────────────────────────────
# Parse policy and determine result
# ─────────────────────────────────────────────────
PREFS_FILE="$(dirname "$POLICY_FILE")/preferences.yaml"

RESULT=$(python3 -c "
import yaml, sys, os

policy_file = sys.argv[1]
action = sys.argv[2]
prefs_file = sys.argv[3]

# Load escalation policy
with open(policy_file) as f:
    config = yaml.safe_load(f)

if not config:
    print('Error: empty escalation policy', file=sys.stderr)
    sys.exit(3)

default_policy = config.get('default_policy', 'always_ask')
policies = config.get('policies', {})

# Find policy for this action
if action in policies:
    policy = policies[action]
    policy_type = policy.get('type', default_policy)
    confidence_threshold = policy.get('confidence_threshold', 3)
else:
    # Fall back to default policy
    policy_type = default_policy
    confidence_threshold = 3

# Evaluate policy type
if policy_type == 'always_ask':
    print('ask')
elif policy_type == 'autonomous':
    print('autonomous')
elif policy_type == 'ask_once_then_remember':
    # Check if there's a prior preference for this action
    if os.path.exists(prefs_file):
        with open(prefs_file) as f:
            prefs = yaml.safe_load(f) or {}
        pref_list = prefs.get('preferences', [])
        has_prior = any(p.get('action') == action for p in pref_list if isinstance(p, dict))
        if has_prior:
            print('autonomous')
        else:
            print('ask')
    else:
        print('ask')
elif policy_type == 'ask_until_confident':
    # Count consistent answers for this action
    count = 0
    if os.path.exists(prefs_file):
        with open(prefs_file) as f:
            prefs = yaml.safe_load(f) or {}
        pref_list = prefs.get('preferences', [])
        count = sum(1 for p in pref_list if isinstance(p, dict) and p.get('action') == action)
    if count >= confidence_threshold:
        print('autonomous')
    else:
        print('ask')
else:
    # Unknown policy type -- safe default
    print('ask', file=sys.stderr)
    print('ask')
" "$POLICY_FILE" "$ACTION" "$PREFS_FILE" 2>/dev/null) || {
  echo "Error: failed to parse escalation policy" >&2
  exit 3
}

# ─────────────────────────────────────────────────
# Output
# ─────────────────────────────────────────────────
if [[ "$JSON_OUTPUT" == true ]]; then
  # Get additional details for JSON output
  python3 -c "
import yaml, json, sys, os

policy_file = sys.argv[1]
action = sys.argv[2]
result = sys.argv[3]
company = sys.argv[4]
prefs_file = sys.argv[5]

with open(policy_file) as f:
    config = yaml.safe_load(f)

policies = config.get('policies', {})
default_policy = config.get('default_policy', 'always_ask')

if action in policies:
    policy = policies[action]
    policy_type = policy.get('type', default_policy)
    description = policy.get('description', '')
    confidence_threshold = policy.get('confidence_threshold', None)
else:
    policy_type = default_policy
    description = 'Fallback to default policy'
    confidence_threshold = None

# Count preferences for this action
pref_count = 0
if os.path.exists(prefs_file):
    with open(prefs_file) as f:
        prefs = yaml.safe_load(f) or {}
    pref_list = prefs.get('preferences', [])
    pref_count = sum(1 for p in pref_list if isinstance(p, dict) and p.get('action') == action)

output = {
    'company': company,
    'action': action,
    'result': result,
    'policy_type': policy_type,
    'description': description,
    'preference_count': pref_count,
}
if confidence_threshold is not None:
    output['confidence_threshold'] = confidence_threshold

print(json.dumps(output, indent=2))
" "$POLICY_FILE" "$ACTION" "$RESULT" "$COMPANY" "$PREFS_FILE"
else
  echo "$RESULT"
fi
