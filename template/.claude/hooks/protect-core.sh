#!/bin/bash
# protect-core.sh — PreToolUse hook for Edit and Write
#
# Blocks edits to files in core.yaml locked list.
# Warns (but allows) edits to core.yaml reviewable list.
# Fails open (logs + allows) if core.yaml is missing or malformed.
#
# Environment:
#   HQ_BYPASS_CORE_PROTECT=1 — bypass all checks (used by /update-hq)
#
# Trigger: PreToolUse on Edit and Write
# Exit codes: 0 = allow, 2 = block

# Bypass mode — authorized updates only
if [[ "${HQ_BYPASS_CORE_PROTECT:-}" == "1" ]]; then
  exit 0
fi

# Read tool input from stdin
INPUT=$(cat)

# Extract file_path from the tool input JSON
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null) || true

# No file_path → nothing to check
if [[ -z "$FILE_PATH" ]]; then
  exit 0
fi

# Resolve to absolute path if relative
if [[ "$FILE_PATH" != /* ]]; then
  FILE_PATH="$(pwd)/$FILE_PATH"
fi

# Detect if original path is a symlink before resolving
ORIGINAL_PATH="$FILE_PATH"
IS_SYMLINK=0
if [[ -L "$FILE_PATH" ]]; then
  IS_SYMLINK=1
fi

# Canonicalize path to resolve .. and . components
# macOS realpath doesn't support -m, so use python3 as primary method
canonicalize_path() {
  local p="$1"
  python3 -c "import os.path; print(os.path.normpath('''$p'''))" 2>/dev/null || echo "$p"
}

resolve_symlink() {
  local p="$1"
  python3 -c "import os; print(os.path.realpath('''$p'''))" 2>/dev/null || echo "$p"
}

RESOLVED_PATH="$(canonicalize_path "$FILE_PATH")"

# If it's a symlink, resolve to the actual target
if [[ $IS_SYMLINK -eq 1 ]]; then
  SYMLINK_TARGET="$(resolve_symlink "$FILE_PATH")"
fi

FILE_PATH="$RESOLVED_PATH"

# Locate HQ root via git, with fallback
HQ_ROOT=$(git rev-parse --show-toplevel 2>/dev/null)
if [[ -z "$HQ_ROOT" ]]; then
  # Fallback: derive from script location (script is in .claude/hooks/)
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  if [[ "$SCRIPT_DIR" == */.claude/hooks ]]; then
    HQ_ROOT="${SCRIPT_DIR%/.claude/hooks}"
  else
    echo "WARNING: protect-core.sh could not determine HQ root. Skipping check." >&2
    exit 0
  fi
fi

CORE_YAML="$HQ_ROOT/core.yaml"

# Fail open if core.yaml is missing
if [[ ! -f "$CORE_YAML" ]]; then
  echo "WARNING: protect-core.sh: core.yaml not found at $CORE_YAML. Skipping check." >&2
  exit 0
fi

# Check for yq
if ! command -v yq >/dev/null 2>&1; then
  echo "WARNING: protect-core.sh: yq not found. Skipping core protection check." >&2
  echo "  Install: brew install yq" >&2
  exit 0
fi

# Helper: check if a file path matches any path in a list
# Args: $1 = file_path, $2 = paths (newline-separated), $3 = hq_root
# Returns: 0 if match, 1 if no match. Sets MATCHED_PATH on match.
check_path_match() {
  local check_path="$1"
  local path_list="$2"
  local root="$3"

  local check_normalized="${check_path%/}"

  while IFS= read -r entry_path; do
    [[ -z "$entry_path" ]] && continue

    local entry_normalized="${entry_path%/}"
    local entry_abs="${root}/${entry_normalized}"

    if [[ "$check_normalized" == "$entry_abs" ]] || [[ "$check_normalized" == "$entry_abs/"* ]]; then
      MATCHED_PATH="$entry_path"
      return 0
    fi
  done <<< "$path_list"

  return 1
}

# Parse locked paths — fail open if yq fails
LOCKED_PATHS=$(yq eval '.rules.locked[]' "$CORE_YAML" 2>/dev/null) || {
  echo "WARNING: protect-core.sh: failed to parse core.yaml (malformed?). Skipping check." >&2
  exit 0
}

# Check locked paths against resolved file path
if check_path_match "$FILE_PATH" "$LOCKED_PATHS" "$HQ_ROOT"; then
  cat >&2 <<EOF
BLOCKED: Edit to locked core file is not allowed.
  File: $FILE_PATH
  Locked path: $MATCHED_PATH

To bypass (authorized updates only): set HQ_BYPASS_CORE_PROTECT=1
EOF
  exit 2
fi

# If original was a symlink, also check the symlink target
if [[ $IS_SYMLINK -eq 1 ]] && [[ -n "${SYMLINK_TARGET:-}" ]]; then
  if check_path_match "$SYMLINK_TARGET" "$LOCKED_PATHS" "$HQ_ROOT"; then
    cat >&2 <<EOF
BLOCKED: Edit targets a symlink pointing to a locked core file.
  Symlink: $ORIGINAL_PATH
  Resolved target: $SYMLINK_TARGET
  Locked path: $MATCHED_PATH

To bypass (authorized updates only): set HQ_BYPASS_CORE_PROTECT=1
EOF
    exit 2
  fi
fi

# Parse reviewable paths — fail open if yq fails
REVIEWABLE_PATHS=$(yq eval '.rules.reviewable[]' "$CORE_YAML" 2>/dev/null) || {
  echo "WARNING: protect-core.sh: failed to parse reviewable paths from core.yaml. Skipping warning check." >&2
  exit 0
}

# Check reviewable paths
if check_path_match "$FILE_PATH" "$REVIEWABLE_PATHS" "$HQ_ROOT"; then
  cat >&2 <<EOF
WARNING: Editing reviewable core path.
  File: $FILE_PATH
  Reviewable path: $MATCHED_PATH
Edit allowed — proceed with care.
EOF
  exit 0
fi

# If symlink target is reviewable
if [[ $IS_SYMLINK -eq 1 ]] && [[ -n "${SYMLINK_TARGET:-}" ]]; then
  if check_path_match "$SYMLINK_TARGET" "$REVIEWABLE_PATHS" "$HQ_ROOT"; then
    cat >&2 <<EOF
WARNING: Symlink targets a reviewable core path.
  Symlink: $ORIGINAL_PATH
  Resolved target: $SYMLINK_TARGET
  Reviewable path: $MATCHED_PATH
Edit allowed — proceed with care.
EOF
    exit 0
  fi
fi

# No match — open category, allow silently
exit 0
