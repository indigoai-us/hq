#!/usr/bin/env bash
# core-integrity.sh — Verify SHA256 checksums for all locked paths in core.yaml
# Usage: scripts/core-integrity.sh [--json] [path-to-core.yaml]
#
# Exit codes:
#   0 = all checksums match (PASS)
#   1 = one or more mismatches, missing files, or errors (FAIL)
#   2 = empty checksums section (WARNING)
#
# Compatible with bash 3.2+ (macOS default)

set -uo pipefail

HQ_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# ─── Argument parsing ─────────────────────────────────────────────────────────

JSON_OUTPUT=false
CORE_YAML=""

for arg in "$@"; do
  case "$arg" in
    --json) JSON_OUTPUT=true ;;
    *) CORE_YAML="$arg" ;;
  esac
done

CORE_YAML="${CORE_YAML:-$HQ_ROOT/core.yaml}"

# ─── Dependency checks ────────────────────────────────────────────────────────

if [ ! -f "$CORE_YAML" ]; then
  if [ "$JSON_OUTPUT" = true ]; then
    printf '{"error":"core.yaml not found at %s","exit_code":1}\n' "$CORE_YAML"
  else
    echo "ERROR: core.yaml not found at $CORE_YAML" >&2
  fi
  exit 1
fi

if ! command -v yq &>/dev/null; then
  if [ "$JSON_OUTPUT" = true ]; then
    printf '{"error":"yq is required (brew install yq)","exit_code":1}\n'
  else
    echo "ERROR: yq is required (brew install yq)" >&2
  fi
  exit 1
fi

# ─── SHA256 helpers (must match compute-checksums.sh exactly) ─────────────────

file_sha256() {
  shasum -a 256 "$1" | awk '{print $1}'
}

dir_sha256() {
  local dir="${1%/}"
  local tmpfile
  tmpfile=$(mktemp)

  # Find all files recursively, sorted by relative path
  find "$dir" -type f | sort | while IFS= read -r filepath; do
    local relpath="${filepath#$dir/}"
    local hash
    hash=$(file_sha256 "$filepath")
    printf '%s  %s\n' "$hash" "$relpath"
  done > "$tmpfile"

  # SHA256 of the combined string
  shasum -a 256 "$tmpfile" | awk '{print $1}'
  rm -f "$tmpfile"
}

# ─── Read core.yaml metadata ─────────────────────────────────────────────────

HQ_VERSION=$(yq '.hqVersion // "unknown"' "$CORE_YAML")
UPDATED_AT=$(yq '.updatedAt // "unknown"' "$CORE_YAML")

# ─── Check for empty checksums ────────────────────────────────────────────────

NUM_CHECKSUMS=$(yq '.checksums | length // 0' "$CORE_YAML")

if [ "$NUM_CHECKSUMS" -eq 0 ]; then
  if [ "$JSON_OUTPUT" = true ]; then
    printf '{"version":"%s","updatedAt":"%s","warning":"empty checksums section","results":[],"exit_code":2}\n' \
      "$HQ_VERSION" "$UPDATED_AT"
  else
    echo ""
    echo "WARNING: No checksums in core.yaml — nothing to verify."
    echo "Run scripts/compute-checksums.sh to generate checksums."
  fi
  exit 2
fi

# ─── Iterate checksums and verify ─────────────────────────────────────────────

# Collect results into temp file for processing
RESULTS_FILE=$(mktemp)
trap 'rm -f "$RESULTS_FILE" "${RESULTS_FILE}.fail"' EXIT

EXIT_CODE=0

yq -r '.checksums | to_entries[] | .key + "\t" + .value' "$CORE_YAML" | while IFS=$'\t' read -r path stored_hash; do
  full_path="$HQ_ROOT/$path"
  status="UNMODIFIED"
  computed_hash=""
  error_msg=""

  if [ ! -e "$full_path" ]; then
    status="MISSING"
    computed_hash=""
  elif [ -d "$full_path" ]; then
    # Directory — check for unreadable files first
    unreadable=$(find "$full_path" -type f ! -readable 2>/dev/null)
    if [ -n "$unreadable" ]; then
      status="ERROR"
      error_msg="unreadable files in directory"
      computed_hash=""
    else
      computed_hash=$(dir_sha256 "$full_path")
      if [ "$computed_hash" != "$stored_hash" ]; then
        status="MODIFIED"
      fi
    fi
  elif [ -f "$full_path" ]; then
    if [ ! -r "$full_path" ]; then
      status="ERROR"
      error_msg="file not readable"
      computed_hash=""
    else
      computed_hash=$(file_sha256 "$full_path")
      if [ "$computed_hash" != "$stored_hash" ]; then
        status="MODIFIED"
      fi
    fi
  else
    status="ERROR"
    error_msg="not a regular file or directory"
    computed_hash=""
  fi

  # Write result to temp file
  printf '%s\t%s\t%s\t%s\t%s\n' "$path" "$status" "$stored_hash" "$computed_hash" "$error_msg" >> "$RESULTS_FILE"

  # Track failure (flag file since we're in a subshell from pipe)
  if [ "$status" != "UNMODIFIED" ]; then
    touch "${RESULTS_FILE}.fail"
  fi
done

# Determine exit code
if [ -f "${RESULTS_FILE}.fail" ]; then
  EXIT_CODE=1
fi

# ─── Output ───────────────────────────────────────────────────────────────────

if [ "$JSON_OUTPUT" = true ]; then
  # JSON output
  printf '{"version":"%s","updatedAt":"%s","results":[' "$HQ_VERSION" "$UPDATED_AT"
  first=true
  while IFS=$'\t' read -r path status stored computed error_msg; do
    if [ "$first" = true ]; then
      first=false
    else
      printf ','
    fi
    printf '{"path":"%s","status":"%s","storedChecksum":"%s","computedChecksum":"%s"' \
      "$path" "$status" "$stored" "$computed"
    if [ -n "$error_msg" ]; then
      printf ',"error":"%s"' "$error_msg"
    fi
    printf '}'
  done < "$RESULTS_FILE"
  printf '],"pass":%s,"exit_code":%d}\n' \
    "$([ "$EXIT_CODE" -eq 0 ] && echo 'true' || echo 'false')" \
    "$EXIT_CODE"
else
  # Human-readable output
  echo ""
  echo "HQ Kernel Integrity Report"
  printf 'Version: %s  |  Last updated: %s\n' "$HQ_VERSION" "$UPDATED_AT"
  echo ""

  # Compute column width
  max_path=8
  while IFS=$'\t' read -r path _rest; do
    len=${#path}
    if [ "$len" -gt "$max_path" ]; then
      max_path=$len
    fi
  done < "$RESULTS_FILE"

  # Header
  printf "%-${max_path}s  %s\n" "File" "Status"
  printf '%s  %s\n' "$(printf '%0.s-' $(seq 1 "$max_path"))" "$(printf '%0.s-' $(seq 1 12))"

  # Rows
  while IFS=$'\t' read -r path status stored computed error_msg; do
    case "$status" in
      UNMODIFIED) label="UNMODIFIED" ;;
      MODIFIED)   label="MODIFIED" ;;
      MISSING)    label="MISSING" ;;
      ERROR)      label="ERROR ($error_msg)" ;;
      *)          label="$status" ;;
    esac
    printf "%-${max_path}s  %s\n" "$path" "$label"
  done < "$RESULTS_FILE"

  echo ""

  # Summary
  if [ "$EXIT_CODE" -eq 0 ]; then
    echo "All locked files unmodified — kernel integrity intact."
  else
    modified_count=$(grep -cE '\t(MODIFIED|MISSING|ERROR)' "$RESULTS_FILE" || true)
    echo "${modified_count} file(s) modified, missing, or errored — kernel drift detected."
  fi
fi

exit "$EXIT_CODE"
