#!/bin/bash
# Hook Profile Gate — controls hook execution based on HQ_HOOK_PROFILE and HQ_DISABLED_HOOKS.
#
# Usage: hook-gate.sh <hook-id> <actual-hook-script> [args...]
#
# Environment:
#   HQ_HOOK_PROFILE  - Profile name (minimal|standard|strict), default: standard
#   HQ_DISABLED_HOOKS - Comma-separated hook IDs to skip
#
# Profiles:
#   minimal  - Critical safety + knowledge only (guard-claude-dir, consult-knowledge, report-issue-reminder)
#   standard - All minimal + productivity hooks (DEFAULT)
#   strict   - All standard + future quality/enforcement hooks
#
# Exit codes:
#   0     - Hook skipped (not in profile or disabled)
#   Other - Delegated hook's exit code

set -euo pipefail

if [ $# -lt 2 ]; then
  echo "USAGE: hook-gate.sh <hook-id> <actual-hook-script> [args...]" >&2
  exit 1
fi

HOOK_ID="$1"
HOOK_SCRIPT="$2"
shift 2

PROFILE="${HQ_HOOK_PROFILE:-standard}"
DISABLED_HOOKS="${HQ_DISABLED_HOOKS:-}"

# Profile membership checks
is_in_minimal() {
  case "$1" in
    consult-knowledge|guard-claude-dir|report-issue-reminder) return 0 ;;
    *) return 1 ;;
  esac
}

is_in_standard() {
  case "$1" in
    consult-knowledge|guard-claude-dir|report-issue-reminder|auto-reindex|capture-learnings|learn-reminder) return 0 ;;
    *) return 1 ;;
  esac
}

is_in_strict() {
  # Currently same as standard — reserved for future hooks
  is_in_standard "$1"
}

# Check profile membership
should_run=0
case "$PROFILE" in
  minimal)  is_in_minimal "$HOOK_ID" && should_run=1 ;;
  standard) is_in_standard "$HOOK_ID" && should_run=1 ;;
  strict)   is_in_strict "$HOOK_ID" && should_run=1 ;;
  *) echo "ERROR: Unknown profile '$PROFILE'. Use minimal|standard|strict." >&2; exit 1 ;;
esac

# Check per-hook disable list
if [ -n "$DISABLED_HOOKS" ]; then
  IFS=',' read -ra DISABLED_ARRAY <<< "$DISABLED_HOOKS"
  for disabled_id in "${DISABLED_ARRAY[@]}"; do
    disabled_id="$(echo "$disabled_id" | xargs)"
    if [ "$disabled_id" = "$HOOK_ID" ]; then
      should_run=0
      break
    fi
  done
fi

# Skip — consume stdin and exit clean
if [ $should_run -eq 0 ]; then
  cat > /dev/null
  exit 0
fi

# Delegate to actual hook
exec "$HOOK_SCRIPT" "$@"
