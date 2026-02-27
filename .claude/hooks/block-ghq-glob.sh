#!/bin/bash
# Block Glob calls that target GHQ root (causes timeouts from large directory tree)
# Scoped Glob calls (with path to subdirectory) are allowed

INPUT=$(cat)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
GHQ="$(cd "$SCRIPT_DIR/../.." && pwd)"

PATH_PARAM=$(echo "$INPUT" | jq -r '.tool_input.path // empty')
PATTERN=$(echo "$INPUT" | jq -r '.tool_input.pattern')
CWD=$(echo "$INPUT" | jq -r '.cwd')

# Resolve effective search path
if [ -z "$PATH_PARAM" ]; then
  SEARCH_PATH="$CWD"
else
  SEARCH_PATH="$PATH_PARAM"
fi

# Block if searching GHQ root exactly
if [ "$SEARCH_PATH" = "$GHQ" ] || [ "$SEARCH_PATH" = "$GHQ/" ]; then
  cat >&2 <<EOF
BLOCKED: Glob from GHQ root causes timeouts.

Fix: Add path: scoped to a subdirectory:
  Glob pattern="$PATTERN" path="projects/"
  Glob pattern="$PATTERN" path="workers/"
  Glob pattern="$PATTERN" path="workspace/"

Or use: grep/Grep for exact pattern matching from GHQ root (safe — .ignore protects it).
EOF
  exit 2
fi

exit 0
