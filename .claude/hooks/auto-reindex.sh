#!/bin/bash
# PostToolUse hook: auto-reindex knowledge after writes to knowledge/
# Fires on Write and Edit tool calls. Checks if the file path is under knowledge/.

set -euo pipefail

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')

case "$TOOL_NAME" in
  Write|Edit)
    FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')
    if echo "$FILE_PATH" | grep -q '/knowledge/'; then
      npx tsx scripts/reindex.ts >/dev/null 2>&1 &
      qmd update >/dev/null 2>&1 &
    fi
    ;;
esac

exit 0
