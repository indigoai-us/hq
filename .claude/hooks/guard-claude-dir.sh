#!/bin/bash
# PreToolUse hook: block built-in Write/Edit for files inside .claude/.
# .claude/ files must use write-file.sh / edit-file.sh instead.
# All other files may use built-in Write/Edit.

set -euo pipefail

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')

# Only inspect Write and Edit calls
case "$TOOL_NAME" in
  Write|Edit) ;;
  *) exit 0 ;;
esac

FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

# Block Write/Edit for files inside .claude/
if echo "$FILE_PATH" | grep -q '\.claude'; then
  echo "BLOCKED: Do not use built-in $TOOL_NAME for .claude/ files."
  echo "  Use the custom file tools instead:"
  echo "  ./companies/hq/tools/file/write-file.sh <path> <<'EOF'"
  echo "  ./companies/hq/tools/file/edit-file.sh <path> --old '...' --new '...'"
  exit 2
fi

# Allow Write/Edit for all other files
exit 0
