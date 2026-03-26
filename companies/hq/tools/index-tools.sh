#!/usr/bin/env bash
# index-tools.sh — Generate INDEX.md for companies/hq/tools/
# Extracts description from the comment header of each tool script.
# Subdirectories (tool groups) are listed separately.
#
# Usage: companies/hq/tools/index-tools.sh
set -euo pipefail

TOOLS_DIR="$(cd "$(dirname "$0")" && pwd)"
INDEX="$TOOLS_DIR/INDEX.md"

# Extract one-line description from a script's header comments
get_description() {
  local file="$1"
  # Look for the first comment line after the shebang that contains a description
  # Pattern: "# name — description" or "# description" or "* description" (for .ts files)
  sed -n '2,10p' "$file" | while IFS= read -r line; do
    # Shell-style: "# script-name — description"
    if [[ "$line" =~ ^#[[:space:]].*—[[:space:]]*(.*) ]]; then
      echo "${BASH_REMATCH[1]}"
      return
    fi
    # TSDoc-style: " * name — description" or " * description"
    if [[ "$line" =~ ^[[:space:]]*\*[[:space:]]+(.*) ]]; then
      desc="${BASH_REMATCH[1]}"
      # Extract after "—" if present (strips filename prefix)
      if [[ "$desc" =~ —[[:space:]]*(.*) ]]; then
        echo "${BASH_REMATCH[1]}"
        return
      fi
      # Skip lines that are just the filename
      [[ "$desc" =~ \.(ts|js)$ ]] && continue
      echo "$desc"
      return
    fi
  done
}

{
  echo "# HQ Tools"
  echo ""
  echo "Auto-generated index of \`companies/hq/tools/\`."
  echo ""
  echo "## Scripts"
  echo ""
  echo "| Tool | Description |"
  echo "|------|-------------|"

  for f in "$TOOLS_DIR"/*; do
    name="$(basename "$f")"
    [[ "$name" == "INDEX.md" ]] && continue
    [[ -d "$f" ]] && continue
    desc="$(get_description "$f")"
    echo "| [$name]($name) | ${desc:--} |"
  done

  echo ""
  echo "## Tool Groups (subdirectories)"
  echo ""
  echo "| Directory | Contents |"
  echo "|-----------|----------|"

  for d in "$TOOLS_DIR"/*/; do
    [[ ! -d "$d" ]] && continue
    name="$(basename "$d")"
    # Build a comma-separated list of scripts with descriptions
    contents=""
    for f in "$d"*; do
      [[ ! -f "$f" ]] && continue
      fname="$(basename "$f")"
      desc="$(get_description "$f")"
      if [[ -n "$contents" ]]; then
        contents="$contents, "
      fi
      contents="$contents[$fname]($name/$fname)"
      if [[ -n "$desc" ]]; then
        contents="$contents — $desc"
      fi
    done
    if [[ -z "$contents" ]]; then
      contents="(empty)"
    fi
    echo "| [$name/]($name/) | $contents |"
  done
} > "$INDEX"
