#!/usr/bin/env bash
# write-file.sh — Write content to a file (replaces built-in Write tool)
# Usage: write-file.sh <file_path> <<< "content"
#        echo "content" | write-file.sh <file_path>
#        write-file.sh <file_path> <<'EOF'
#        multi-line content here
#        EOF
set -euo pipefail

usage() {
  cat <<EOF
Usage: $(basename "$0") <file_path>

Write stdin to <file_path>, creating parent directories if needed.
Overwrites the file if it already exists.

Examples:
  echo "hello" | $(basename "$0") path/to/file.txt
  $(basename "$0") path/to/file.txt <<< "hello"
  $(basename "$0") path/to/file.txt <<'CONTENT'
  multi-line content
  CONTENT
EOF
  exit 0
}

[[ "${1:-}" == "-h" || "${1:-}" == "--help" ]] && usage
[[ $# -lt 1 ]] && { echo "Error: file path required" >&2; exit 1; }

FILE_PATH="$1"

# Create parent directories
mkdir -p "$(dirname "$FILE_PATH")"

# Write stdin to file
cat > "$FILE_PATH"

BYTES=$(wc -c < "$FILE_PATH" | tr -d ' ')
echo "Wrote $FILE_PATH ($BYTES bytes)"

# ── Auto-reindex side-effects ────────────────────────────────────────────────
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -n "$REPO_ROOT" ]]; then
  # Reindex knowledge when a knowledge .md file changes
  if echo "$FILE_PATH" | grep -qP '/companies/([^/]+)/knowledge/.*\.md$' 2>/dev/null; then
    COMPANY=$(echo "$FILE_PATH" | sed -n 's|.*/companies/\([^/]*\)/knowledge/.*|\1|p')
    npx tsx "$REPO_ROOT/companies/hq/tools/reindex.ts" -c "$COMPANY" >/dev/null 2>&1 &&
    qmd update >/dev/null 2>&1 || true
  fi
  # Reindex tools when a file in companies/hq/tools/ changes
  if echo "$FILE_PATH" | grep -q '/companies/hq/tools/'; then
    "$REPO_ROOT/companies/hq/tools/index-tools.sh" >/dev/null 2>&1 || true
  fi
fi
