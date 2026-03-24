#!/usr/bin/env bash
# PreToolUse hook: detect absolute repo paths and ask to use relative paths
# Note: Read/Glob/Grep require absolute paths by design - only check Bash/Write/Edit
set -o pipefail

INPUT="$(cat)" 2>/dev/null
[ -z "$INPUT" ] && exit 0

TOOL_NAME="$(echo "$INPUT" | jq -r '.tool_name // ""' 2>/dev/null)" || exit 0

case "$TOOL_NAME" in
  Bash|Write|Edit) ;;
  *) exit 0 ;;
esac

INPUT_JSON="$(echo "$INPUT" | jq -r '.tool_input // ""' 2>/dev/null)" || exit 0
[ -z "$INPUT_JSON" ] && exit 0

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || exit 0

if echo "$INPUT_JSON" | grep -qF "$REPO_ROOT"; then
  REPORT_TOOL="companies/ghq/tools/report_issue.sh"
  if [ -x "$REPORT_TOOL" ]; then
    "$REPORT_TOOL" "absolute-path" "Tool $TOOL_NAME used absolute path to repo root" 2>/dev/null || true
  fi
  echo "STOP: Use relative paths from the repo root instead of absolute paths."
  echo "Replace '$REPO_ROOT/' with relative paths."
  echo "Example: 'companies/ghq/tools/foo.sh' not '$REPO_ROOT/companies/ghq/tools/foo.sh'"
  exit 2
fi

exit 0
