#!/bin/bash
# Hook Profile Gate - Controls hook execution based on HQ_HOOK_PROFILE and HQ_DISABLED_HOOKS.
#
# Usage: hook-gate.sh <hook-id> <actual-hook-script>
#
# Environment:
#   HQ_HOOK_PROFILE - Profile name (minimal|standard|strict), default: standard
#   HQ_DISABLED_HOOKS - Comma-separated hook IDs to disable
#
# Profiles:
#   minimal - Critical safety + knowledge hooks
#   standard - All minimal + productivity hooks (DEFAULT)
#   strict - All standard + future quality/format hooks
#
# Exit codes:
#   0 - Hook skipped (not in profile or disabled), pass-through to Claude Code
#   Other - Delegated hook's exit code (2 = blocked, etc.)

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

# Minimal: critical safety + knowledge consultation
is_in_minimal_profile() {
  case "$1" in
    block-hq-glob|block-hq-grep|warn-cross-company-settings|detect-secrets|consult-knowledge|report-issue-reminder|protect-core)
      return 0 ;;
    *) return 1 ;;
  esac
}

# Standard: minimal + checkpoint/handoff + reindex + learning
is_in_standard_profile() {
  case "$1" in
    block-hq-glob|block-hq-grep|warn-cross-company-settings|detect-secrets|consult-knowledge|report-issue-reminder|protect-core|auto-checkpoint-trigger|auto-handoff-trigger|observe-patterns|block-inline-story-impl|screenshot-resize-trigger|auto-reindex|learn-reminder|capture-learnings)
      return 0 ;;
    *) return 1 ;;
  esac
}

# Strict: standard + future quality hooks
is_in_strict_profile() {
  is_in_standard_profile "$1"
}

should_run=0
case "$PROFILE" in
  minimal)  is_in_minimal_profile "$HOOK_ID" && should_run=1 ;;
  standard) is_in_standard_profile "$HOOK_ID" && should_run=1 ;;
  strict)   is_in_strict_profile "$HOOK_ID" && should_run=1 ;;
  *) echo "ERROR: Unknown profile '$PROFILE'. Use minimal|standard|strict" >&2; exit 1 ;;
esac

if [ -n "$DISABLED_HOOKS" ]; then
  IFS=',' read -ra DISABLED_ARRAY <<<"$DISABLED_HOOKS"
  for disabled_id in "${DISABLED_ARRAY[@]}"; do
    disabled_id="$(echo "$disabled_id" | xargs)"
    if [ "$disabled_id" = "$HOOK_ID" ]; then
      should_run=0
      break
    fi
  done
fi

if [ $should_run -eq 0 ]; then
  cat >/dev/null
  exit 0
fi

exec "$HOOK_SCRIPT" "$@"
