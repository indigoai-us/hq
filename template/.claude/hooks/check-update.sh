#!/bin/bash
# PreToolUse hook: check for HQ starter-kit updates once per day.
# Outputs additionalContext notification via stdout when an update is available.
# Completely silent on errors — never disrupts a session.
# Works on Windows (Git Bash), macOS, and Linux.
# Dependencies: gh (GitHub CLI), optionally jq (falls back to grep/sed).

set -uo pipefail

# --- Configuration ---
CACHE_TTL_SECONDS=86400  # 24 hours
GH_TIMEOUT=3             # seconds
REPO="indigoai-us/hq"

# --- Resolve HQ root ---
HQ="$(cd "$(dirname "$0")/../.." 2>/dev/null && pwd)" || exit 0
CACHE_FILE="${HQ}/.hq-version-check.json"
CHANGELOG="${HQ}/CHANGELOG.md"

# --- Helper: current epoch (portable) ---
now_epoch() {
  date +%s 2>/dev/null || echo 0
}

# --- Helper: parse ISO8601 to epoch (portable) ---
iso_to_epoch() {
  local ts="$1"
  # Try GNU date first, then BSD date, then fallback
  date -d "$ts" +%s 2>/dev/null \
    || date -jf "%Y-%m-%dT%H:%M:%S" "${ts%%.*}" +%s 2>/dev/null \
    || echo 0
}

# --- Helper: extract JSON string value (no jq needed) ---
# Usage: json_val "key" < file_or_pipe
# Handles: "key": "value", "key": true/false, and last field (no trailing comma)
json_val() {
  local key="$1"
  local input
  input=$(cat)  # Capture stdin so we can run multiple sed passes
  # Try quoted string value first: "key": "value"
  local result
  result=$(echo "$input" | sed -n "s/.*\"${key}\"[[:space:]]*:[[:space:]]*\"\([^\"]*\)\".*/\1/p" | head -1)
  if [ -n "$result" ]; then
    echo "$result"
    return
  fi
  # Try unquoted value (boolean/number): "key": true
  echo "$input" | sed -n "s/.*\"${key}\"[[:space:]]*:[[:space:]]*\([^,\"[:space:]}]*\).*/\1/p" | head -1
}

# --- Helper: semver compare (returns 0 if a > b) ---
semver_gt() {
  local a="$1" b="$2"
  local a_major a_minor a_patch b_major b_minor b_patch

  IFS='.' read -r a_major a_minor a_patch <<< "$a"
  IFS='.' read -r b_major b_minor b_patch <<< "$b"

  # Strip any non-numeric suffixes
  a_major="${a_major%%[!0-9]*}"; a_minor="${a_minor%%[!0-9]*}"; a_patch="${a_patch%%[!0-9]*}"
  b_major="${b_major%%[!0-9]*}"; b_minor="${b_minor%%[!0-9]*}"; b_patch="${b_patch%%[!0-9]*}"

  # Default to 0
  a_major="${a_major:-0}"; a_minor="${a_minor:-0}"; a_patch="${a_patch:-0}"
  b_major="${b_major:-0}"; b_minor="${b_minor:-0}"; b_patch="${b_patch:-0}"

  if (( a_major > b_major )); then return 0; fi
  if (( a_major < b_major )); then return 1; fi
  if (( a_minor > b_minor )); then return 0; fi
  if (( a_minor < b_minor )); then return 1; fi
  if (( a_patch > b_patch )); then return 0; fi
  return 1
}

# --- Check cache ---
if [ -f "$CACHE_FILE" ]; then
  # Parse cache fields (works with or without jq)
  LAST_CHECKED=$(json_val "lastChecked" < "$CACHE_FILE" 2>/dev/null) || LAST_CHECKED=""
  CACHED_UPDATE=$(json_val "updateAvailable" < "$CACHE_FILE" 2>/dev/null) || CACHED_UPDATE="false"

  if [ -n "$LAST_CHECKED" ]; then
    LAST_EPOCH=$(iso_to_epoch "$LAST_CHECKED")
    NOW_EPOCH=$(now_epoch)
    AGE=$(( NOW_EPOCH - LAST_EPOCH ))

    if (( AGE >= 0 && AGE < CACHE_TTL_SECONDS )); then
      # Cache is fresh — use cached result
      if [ "$CACHED_UPDATE" = "true" ]; then
        CACHED_LOCAL=$(json_val "localVersion" < "$CACHE_FILE" 2>/dev/null) || CACHED_LOCAL="unknown"
        CACHED_LATEST=$(json_val "latestVersion" < "$CACHE_FILE" 2>/dev/null) || CACHED_LATEST="unknown"
        CACHED_URL=$(json_val "latestReleaseUrl" < "$CACHE_FILE" 2>/dev/null) || CACHED_URL=""
        echo "HQ UPDATE AVAILABLE: v${CACHED_LATEST} (you are on v${CACHED_LOCAL}). Run /update-hq to upgrade. Release: ${CACHED_URL}"
      fi
      exit 0
    fi
  fi
fi

# --- Cache is stale or missing: fetch latest version ---

# Check gh is available
command -v gh >/dev/null 2>&1 || exit 0

# Fetch latest release (with timeout)
# Use timeout if available, otherwise rely on gh's own timeout
if command -v timeout >/dev/null 2>&1; then
  RELEASE_JSON=$(timeout "${GH_TIMEOUT}" gh api "repos/${REPO}/releases/latest" 2>/dev/null) || exit 0
else
  RELEASE_JSON=$(gh api "repos/${REPO}/releases/latest" 2>/dev/null) || exit 0
fi

# Parse remote version (tag_name is like "v6.4.0")
REMOTE_TAG=""
if command -v jq >/dev/null 2>&1; then
  REMOTE_TAG=$(echo "$RELEASE_JSON" | jq -r '.tag_name // empty' 2>/dev/null) || true
else
  REMOTE_TAG=$(echo "$RELEASE_JSON" | json_val "tag_name" 2>/dev/null) || true
fi
[ -z "$REMOTE_TAG" ] && exit 0

REMOTE_VERSION="${REMOTE_TAG#v}"  # Strip leading 'v'

RELEASE_URL=""
if command -v jq >/dev/null 2>&1; then
  RELEASE_URL=$(echo "$RELEASE_JSON" | jq -r '.html_url // ""' 2>/dev/null) || true
else
  RELEASE_URL=$(echo "$RELEASE_JSON" | json_val "html_url" 2>/dev/null) || true
fi

# --- Read local version from CHANGELOG.md ---
LOCAL_VERSION=""
if [ -f "$CHANGELOG" ]; then
  # Match first occurrence of "## v1.2.3" pattern
  # Try -P (Perl regex) first, fall back to basic grep + sed
  LOCAL_VERSION=$(grep -m1 -oP '(?<=^## v)[0-9]+\.[0-9]+\.[0-9]+' "$CHANGELOG" 2>/dev/null) || true
  if [ -z "$LOCAL_VERSION" ]; then
    LOCAL_VERSION=$(grep -m1 '^## v[0-9]' "$CHANGELOG" 2>/dev/null | sed 's/^## v\([0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*\).*/\1/' 2>/dev/null) || true
  fi
fi

# If no local version found, try structural fallback
if [ -z "$LOCAL_VERSION" ]; then
  if [ -f "${HQ}/.hq-version" ]; then
    LOCAL_VERSION=$(tr -d '[:space:]' < "${HQ}/.hq-version" 2>/dev/null) || true
  fi
  # If still nothing, assume very old version so update is recommended
  [ -z "$LOCAL_VERSION" ] && LOCAL_VERSION="0.0.0"
fi

# --- Compare versions ---
UPDATE_AVAILABLE=false
if semver_gt "$REMOTE_VERSION" "$LOCAL_VERSION"; then
  UPDATE_AVAILABLE=true
fi

# --- Write cache (atomic: write temp then rename) ---
NOW_ISO=$(date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date -u +"%Y-%m-%dT%H:%M:%S" 2>/dev/null)
CACHE_TMP="${CACHE_FILE}.tmp.$$"

if command -v jq >/dev/null 2>&1; then
  jq -n \
    --arg lc "$NOW_ISO" \
    --arg lv "$LOCAL_VERSION" \
    --arg rv "$REMOTE_VERSION" \
    --argjson ua "$UPDATE_AVAILABLE" \
    --arg url "${RELEASE_URL:-}" \
    '{
      lastChecked: $lc,
      localVersion: $lv,
      latestVersion: $rv,
      updateAvailable: $ua,
      latestReleaseUrl: $url
    }' > "$CACHE_TMP" 2>/dev/null
else
  # Write JSON manually (simple structure, no escaping needed for version strings)
  cat > "$CACHE_TMP" 2>/dev/null <<ENDJSON
{
  "lastChecked": "${NOW_ISO}",
  "localVersion": "${LOCAL_VERSION}",
  "latestVersion": "${REMOTE_VERSION}",
  "updateAvailable": ${UPDATE_AVAILABLE},
  "latestReleaseUrl": "${RELEASE_URL:-}"
}
ENDJSON
fi

# Atomic rename (or cleanup on failure)
mv "$CACHE_TMP" "$CACHE_FILE" 2>/dev/null || rm -f "$CACHE_TMP" 2>/dev/null

# --- Output notification if update available ---
if [ "$UPDATE_AVAILABLE" = "true" ]; then
  echo "HQ UPDATE AVAILABLE: v${REMOTE_VERSION} (you are on v${LOCAL_VERSION}). Run /update-hq to upgrade. Release: ${RELEASE_URL}"
fi

exit 0
