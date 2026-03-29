#!/usr/bin/env bash
# check-hq-update.sh — Check for HQ updates and verify kernel integrity
# Usage: scripts/check-hq-update.sh [--json]
#
# Exit codes:
#   0 = up to date (no update available, integrity OK)
#   1 = update available or integrity drift detected
#   2 = error (missing deps, offline, etc.)
#
# Compatible with bash 3.2+ (macOS default)

set -uo pipefail

HQ_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CORE_YAML="$HQ_ROOT/core.yaml"

# ─── Argument parsing ─────────────────────────────────────────────────────────

JSON_OUTPUT=false

for arg in "$@"; do
  case "$arg" in
    --json) JSON_OUTPUT=true ;;
  esac
done

# ─── Helpers ──────────────────────────────────────────────────────────────────

json_error() {
  local msg="$1"
  local code="${2:-2}"
  if [ "$JSON_OUTPUT" = true ]; then
    printf '{"error":"%s","exit_code":%d}\n' "$msg" "$code"
  else
    echo "ERROR: $msg" >&2
  fi
  exit "$code"
}

# ─── Dependency checks ───────────────────────────────────────────────────────

if ! command -v gh &>/dev/null; then
  json_error "gh CLI is required (brew install gh)" 2
fi

if ! command -v yq &>/dev/null; then
  json_error "yq is required (brew install yq)" 2
fi

if [ ! -f "$CORE_YAML" ]; then
  json_error "core.yaml not found at $CORE_YAML" 2
fi

# ─── Read local version ──────────────────────────────────────────────────────

LOCAL_VERSION=$(yq '.hqVersion // "unknown"' "$CORE_YAML")

# ─── Fetch CHANGELOG from repo ────────────────────────────────────────────────

LATEST_VERSION=""
FETCH_ERROR=""
CHANGELOG_ENTRY=""
REMOTE_CHANGELOG=""

# Fetch CHANGELOG.md from template/ on main branch
_cl_content=""
if _cl_content=$(gh api repos/indigoai-us/hq/contents/template/CHANGELOG.md --jq '.content' 2>/dev/null) && [ -n "$_cl_content" ]; then
  REMOTE_CHANGELOG=$(printf '%s' "$_cl_content" | base64 -d 2>/dev/null) || true
fi

if [ -n "$REMOTE_CHANGELOG" ]; then
  # Extract latest version from first "## vX.Y.Z" heading
  LATEST_VERSION=$(printf '%s' "$REMOTE_CHANGELOG" | grep -m1 '^## v' | sed 's/^## v\([^ ]*\).*/\1/') || true
  # Extract the body of the first version section
  CHANGELOG_ENTRY=$(printf '%s' "$REMOTE_CHANGELOG" | awk '/^## /{if(found) exit; found=1; next} found{print}') || true
else
  FETCH_ERROR="Could not reach GitHub — check network or gh auth status"
fi

# ─── Compare versions ────────────────────────────────────────────────────────

UPDATE_AVAILABLE=false
if [ -n "$LATEST_VERSION" ] && [ "$LATEST_VERSION" != "$LOCAL_VERSION" ]; then
  UPDATE_AVAILABLE=true
else
  CHANGELOG_ENTRY=""
fi

# ─── Run integrity check ─────────────────────────────────────────────────────

INTEGRITY_SCRIPT="$HQ_ROOT/scripts/core-integrity.sh"
INTEGRITY_PASS=true
INTEGRITY_OUTPUT=""
INTEGRITY_EXIT=0

if [ -f "$INTEGRITY_SCRIPT" ]; then
  INTEGRITY_OUTPUT=$(bash "$INTEGRITY_SCRIPT" --json 2>/dev/null) || INTEGRITY_EXIT=$?
  if [ "$INTEGRITY_EXIT" -eq 1 ]; then
    INTEGRITY_PASS=false
  fi
fi

# ─── Determine exit code ─────────────────────────────────────────────────────

EXIT_CODE=0
if [ "$UPDATE_AVAILABLE" = true ] || [ "$INTEGRITY_PASS" = false ]; then
  EXIT_CODE=1
fi

# ─── Output ───────────────────────────────────────────────────────────────────

if [ "$JSON_OUTPUT" = true ]; then
  # JSON output
  printf '{'
  printf '"localVersion":"%s"' "$LOCAL_VERSION"
  if [ -n "$FETCH_ERROR" ]; then
    printf ',"fetchError":"%s"' "$FETCH_ERROR"
  else
    printf ',"latestVersion":"%s"' "$LATEST_VERSION"
    printf ',"updateAvailable":%s' "$UPDATE_AVAILABLE"
    if [ -n "$CHANGELOG_ENTRY" ]; then
      # Escape newlines and quotes for JSON
      _escaped=$(printf '%s' "$CHANGELOG_ENTRY" | sed 's/\\/\\\\/g; s/"/\\"/g' | tr '\n' '|' | sed 's/|/\\n/g')
      printf ',"changelog":"%s"' "$_escaped"
    fi
  fi
  printf ',"integrityPass":%s' "$INTEGRITY_PASS"
  if [ -n "$INTEGRITY_OUTPUT" ]; then
    printf ',"integrity":%s' "$INTEGRITY_OUTPUT"
  fi
  printf ',"exit_code":%d' "$EXIT_CODE"
  printf '}\n'
else
  # Human-readable output
  echo ""
  echo "HQ Update Check"
  echo "════════════════════════════════════════"
  echo ""
  printf "Local version:  %s\n" "$LOCAL_VERSION"

  if [ -n "$FETCH_ERROR" ]; then
    echo ""
    echo "WARNING: $FETCH_ERROR"
    echo "Skipping version comparison. Run again when online."
  else
    printf "Latest version: %s\n" "$LATEST_VERSION"
    echo ""

    if [ "$UPDATE_AVAILABLE" = true ]; then
      echo "UPDATE AVAILABLE: $LOCAL_VERSION → $LATEST_VERSION"
      echo ""
      if [ -n "$CHANGELOG_ENTRY" ]; then
        echo "What's new:"
        echo "────────────────────────────────────────"
        printf '%s\n' "$CHANGELOG_ENTRY"
        echo "────────────────────────────────────────"
        echo ""
      fi
      echo "Run /update-hq to upgrade."
    else
      echo "Up to date."
    fi
  fi

  echo ""
  echo "────────────────────────────────────────"
  echo "Kernel Integrity"
  echo "────────────────────────────────────────"

  if [ "$INTEGRITY_PASS" = true ]; then
    echo "All locked files unmodified — kernel integrity intact."
  elif [ "$INTEGRITY_EXIT" -eq 2 ]; then
    echo "WARNING: No checksums in core.yaml — run scripts/compute-checksums.sh"
  else
    echo "DRIFT DETECTED — one or more locked files have been modified."
    echo "Run /core-status for details."
  fi

  echo ""
fi

exit "$EXIT_CODE"
