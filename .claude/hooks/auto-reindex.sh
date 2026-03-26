#!/bin/bash
# PostToolUse hook: auto-reindex knowledge after writes to any company's knowledge/
# Fires on Write and Edit tool calls. Checks if the file path is under companies/*/knowledge/.

set -euo pipefail

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')

case "$TOOL_NAME" in
  Write|Edit)
    FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')
    # Reindex knowledge when a knowledge .md file changes
    if echo "$FILE_PATH" | grep -qP '/companies/([^/]+)/knowledge/.*\.md$'; then
      COMPANY=$(echo "$FILE_PATH" | sed -n 's|.*/companies/\([^/]*\)/knowledge/.*|\1|p')
      npx tsx companies/hq/tools/reindex.ts -c "$COMPANY" >/dev/null &&
      qmd update >/dev/null
    fi
    # Reindex tools when a file in companies/hq/tools/ changes
    if echo "$FILE_PATH" | grep -q '/companies/hq/tools/'; then
      companies/hq/tools/index-tools.sh >/dev/null 2>&1 || true
    fi
    ;;
esac

exit 0
