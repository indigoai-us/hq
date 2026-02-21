#!/bin/bash
# Block Glob calls that target HQ root (causes 20s timeouts from symlinked repos)
# Scoped Glob calls (with path to subdirectory) are allowed

INPUT=$(cat)
HQ="$(git rev-parse --show-toplevel 2>/dev/null || echo "$PWD")"

PATH_PARAM=$(echo "$INPUT" | jq -r '.tool_input.path // empty')
PATTERN=$(echo "$INPUT" | jq -r '.tool_input.pattern')
CWD=$(echo "$INPUT" | jq -r '.cwd')

# Resolve effective search path
if [ -z "$PATH_PARAM" ]; then
  SEARCH_PATH="$CWD"
else
  SEARCH_PATH="$PATH_PARAM"
fi

# Block if searching HQ root exactly
if [ "$SEARCH_PATH" = "$HQ" ] || [ "$SEARCH_PATH" = "$HQ/" ]; then
  cat >&2 <<EOF
BLOCKED: Glob from HQ root causes timeouts (1.38M files via symlinks).

Fix: Add path: scoped to a subdirectory:
  Glob pattern="$PATTERN" path="projects/"
  Glob pattern="$PATTERN" path="workers/"
  Glob pattern="$PATTERN" path="workspace/"

Or use: qmd search "query" --json -n 10
EOF
  exit 2
fi

exit 0
