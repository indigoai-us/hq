#!/bin/bash
# PostToolUse hook: auto-reindex knowledge after writes to knowledge/
# Fires on Write and Edit tool calls. Checks if the file path is under knowledge/.

set -euo pipefail

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')

case "$TOOL_NAME" in
  Write|Edit)
    FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')
    if echo "$FILE_PATH" | grep -q '/knowledge/.*\.md$'; then
      npx tsx tools/reindex.ts >/dev/null &&
      qmd update >/dev/null
    fi
    ;;
esac

exit 0
