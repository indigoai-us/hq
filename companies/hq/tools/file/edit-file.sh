#!/usr/bin/env bash
# edit-file.sh — Exact string replacement in files (replaces built-in Edit tool)
# Usage: edit-file.sh <file_path> --old 'old text' --new 'new text' [--all]
set -euo pipefail

usage() {
  cat <<EOF
Usage: $(basename "$0") <file_path> --old 'old_string' --new 'new_string' [--all]

Perform exact string replacement in a file.

Options:
  --old TEXT    The exact text to find and replace (required)
  --new TEXT    The replacement text (required, can be empty string '')
  --all         Replace all occurrences (default: replace first, fail if not unique)
  -h, --help   Show this help

Without --all, the edit fails if old_string appears more than once.
Prints a unified diff of changes on success.

Examples:
  $(basename "$0") src/main.ts --old 'const x = 1' --new 'const x = 2'
  $(basename "$0") config.json --old '"debug": false' --new '"debug": true'
  $(basename "$0") README.md --old 'v1' --new 'v2' --all
EOF
  exit 0
}

FILE_PATH=""
OLD_STRING=""
NEW_STRING=""
REPLACE_ALL=false
GOT_OLD=false
GOT_NEW=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help) usage ;;
    --old)     OLD_STRING="$2"; GOT_OLD=true; shift 2 ;;
    --new)     NEW_STRING="$2"; GOT_NEW=true; shift 2 ;;
    --all)     REPLACE_ALL=true; shift ;;
    -*)        echo "Unknown option: $1" >&2; exit 1 ;;
    *)
      if [[ -z "$FILE_PATH" ]]; then
        FILE_PATH="$1"; shift
      else
        echo "Error: unexpected argument: $1" >&2; exit 1
      fi
      ;;
  esac
done

[[ -z "$FILE_PATH" ]] && { echo "Error: file path required" >&2; exit 1; }
[[ "$GOT_OLD" == false ]] && { echo "Error: --old is required" >&2; exit 1; }
[[ "$GOT_NEW" == false ]] && { echo "Error: --new is required" >&2; exit 1; }
[[ ! -f "$FILE_PATH" ]] && { echo "Error: file not found: $FILE_PATH" >&2; exit 1; }
[[ "$OLD_STRING" == "$NEW_STRING" ]] && { echo "Error: old and new strings are identical" >&2; exit 1; }

# Read file content
CONTENT="$(cat "$FILE_PATH")"

# Count occurrences using python for reliable multi-line string handling
COUNT=$(python3 -c "
import sys
old = sys.argv[1]
with open(sys.argv[2], 'r') as f:
    content = f.read()
print(content.count(old))
" "$OLD_STRING" "$FILE_PATH")

if [[ "$COUNT" -eq 0 ]]; then
  echo "Error: old_string not found in $FILE_PATH" >&2
  exit 1
fi

if [[ "$REPLACE_ALL" == false && "$COUNT" -gt 1 ]]; then
  echo "Error: old_string found $COUNT times in $FILE_PATH. Use --all to replace all, or provide more context to make it unique." >&2
  exit 1
fi

# Create temp file for the new content
TMPFILE="$(mktemp)"
trap 'rm -f "$TMPFILE"' EXIT

# Perform replacement using python for reliable multi-line handling
if [[ "$REPLACE_ALL" == true ]]; then
  python3 -c "
import sys
old, new = sys.argv[1], sys.argv[2]
with open(sys.argv[3], 'r') as f:
    content = f.read()
with open(sys.argv[4], 'w') as f:
    f.write(content.replace(old, new))
" "$OLD_STRING" "$NEW_STRING" "$FILE_PATH" "$TMPFILE"
else
  python3 -c "
import sys
old, new = sys.argv[1], sys.argv[2]
with open(sys.argv[3], 'r') as f:
    content = f.read()
with open(sys.argv[4], 'w') as f:
    f.write(content.replace(old, new, 1))
" "$OLD_STRING" "$NEW_STRING" "$FILE_PATH" "$TMPFILE"
fi

# Show diff
diff -u "$FILE_PATH" "$TMPFILE" || true

# Apply the edit
cp "$TMPFILE" "$FILE_PATH"

if [[ "$REPLACE_ALL" == true ]]; then
  echo "Replaced $COUNT occurrences in $FILE_PATH"
else
  echo "Replaced 1 occurrence in $FILE_PATH"
fi

# ── Auto-reindex side-effects ────────────────────────────────────────────────
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -n "$REPO_ROOT" ]]; then
  if echo "$FILE_PATH" | grep -qP '/companies/([^/]+)/knowledge/.*\.md$' 2>/dev/null; then
    COMPANY=$(echo "$FILE_PATH" | sed -n 's|.*/companies/\([^/]*\)/knowledge/.*|\1|p')
    npx tsx "$REPO_ROOT/companies/hq/tools/reindex.ts" -c "$COMPANY" >/dev/null 2>&1 &&
    qmd update >/dev/null 2>&1 || true
  fi
  if echo "$FILE_PATH" | grep -q '/companies/hq/tools/'; then
    "$REPO_ROOT/companies/hq/tools/index-tools.sh" >/dev/null 2>&1 || true
  fi
fi
