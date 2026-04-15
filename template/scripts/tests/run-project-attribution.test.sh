#!/usr/bin/env bash
# Unit tests for cross-repo commit attribution helpers added to run-project.sh
# to fix US-019 (false-negative no-commit) and US-020 (duplicate overwrite).
#
# Run: bash repos/public/hq/template/scripts/tests/run-project-attribution.test.sh
#
# Strategy: these helpers weren't written as a library, so we extract just the
# functions we need from the production script via sed, stub the logger + a
# few globals, and exercise them in a disposable temp dir. No git fakes —
# real `git init` + real commits — which is how the resolver is actually used.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HQ_TEMPLATE_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
RUN_PROJECT_SH="$HQ_TEMPLATE_ROOT/.claude/scripts/run-project.sh"

if [[ ! -f "$RUN_PROJECT_SH" ]]; then
  echo "FAIL: cannot find run-project.sh at $RUN_PROJECT_SH" >&2
  exit 1
fi

# --- Test harness -----------------------------------------------------------
PASS=0
FAIL=0
FAILURES=()

pass() { PASS=$((PASS+1)); printf '  ok %s\n' "$1"; }
fail() { FAIL=$((FAIL+1)); FAILURES+=("$1: $2"); printf '  FAIL %s — %s\n' "$1" "$2"; }

assert_eq() {
  local name="$1" expected="$2" actual="$3"
  if [[ "$expected" == "$actual" ]]; then pass "$name"
  else fail "$name" "expected=[$expected] actual=[$actual]"; fi
}

assert_contains() {
  local name="$1" needle="$2" haystack="$3"
  if [[ "$haystack" == *"$needle"* ]]; then pass "$name"
  else fail "$name" "needle=[$needle] not in [$haystack]"; fi
}

# --- Extract helper functions from production script -----------------------
# We grab the chunk between the attribution section header and the next
# `=====` banner, and dump it to a temp file we can `source`.
EXTRACT="$(mktemp -t run-project-helpers.XXXXXX)"
trap 'rm -f "$EXTRACT"' EXIT

awk '
  /^# Cross-Repo Commit Attribution/ { capture=1 }
  capture { print }
  capture && /^# Codex CLI Review/   { exit }
' "$RUN_PROJECT_SH" > "$EXTRACT"

if ! grep -q 'resolve_story_attribution()' "$EXTRACT"; then
  echo "FAIL: helper extraction did not find resolve_story_attribution" >&2
  exit 1
fi

# Stubs the extracted helpers depend on.
is_git_repo() { [[ -d "${1:-}/.git" ]]; }
log_info() { :; }
log_warn() { :; }
log_error() { :; }
ts() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }
get_pre_story_sha() {
  local repo="${1:-$REPO_PATH}"
  { [[ -z "$repo" ]] || ! is_git_repo "$repo"; } && echo "" && return
  git -C "$repo" rev-parse HEAD 2>/dev/null || echo ""
}

# shellcheck disable=SC1090
source "$EXTRACT"

# --- Temp project scaffold --------------------------------------------------
WORKDIR="$(mktemp -d -t run-project-attribution.XXXXXX)"
trap 'rm -rf "$WORKDIR"; rm -f "$EXTRACT"' EXIT

export HQ_ROOT="$WORKDIR/hq"
export PROJECT="test-proj"
export SESSION_ID="test-session"

mkdir -p "$HQ_ROOT/repos/public" "$HQ_ROOT/repos/private" \
         "$HQ_ROOT/workspace/orchestrator/$PROJECT/executions"

make_repo() {
  local name="$1"
  local repo="$HQ_ROOT/repos/public/$name"
  mkdir -p "$repo"
  git -C "$repo" init -q
  git -C "$repo" config user.email "t@t" && git -C "$repo" config user.name "t"
  echo initial > "$repo/README.md"
  git -C "$repo" add README.md
  git -C "$repo" commit -q -m initial
  printf '%s' "$repo"
}

advance_repo() {
  local repo="$1" file="$2" content="$3"
  echo "$content" > "$repo/$file"
  git -C "$repo" add "$file"
  git -C "$repo" commit -q -m "update $file"
}

# --- Tests for discover_candidate_repos ------------------------------------
echo
echo "== discover_candidate_repos =="

PRIMARY="$(make_repo primary)"
SIBLING="$(make_repo sibling)"
REPO_PATH="$PRIMARY"
PRD_PATH=""

{ # auto-discover picks up all git repos, primary first
  out="$(discover_candidate_repos "US-001" | tr '\n' ',' | sed 's/,$//')"
  first="${out%%,*}"
  assert_eq "discover_autodiscover:primary_first" "$PRIMARY" "$first"
  assert_contains "discover_autodiscover:has_sibling" "$SIBLING" "$out"
}

{ # honours story .repos override when set in PRD
  PRD_PATH="$WORKDIR/prd.json"
  cat > "$PRD_PATH" <<JSON
{
  "userStories": [
    { "id": "US-010", "repos": ["repos/public/sibling"] }
  ]
}
JSON
  out="$(discover_candidate_repos "US-010" | tr '\n' ',' | sed 's/,$//')"
  assert_contains "discover_honors_story_override:has_sibling" "$SIBLING" "$out"
  assert_eq "discover_honors_story_override:primary_first" "$PRIMARY" "${out%%,*}"
  PRD_PATH=""
}

# --- Tests for resolve_story_attribution ------------------------------------
echo
echo "== resolve_story_attribution =="

{ # No repo advanced → primary=no-commit, cross_repo=false
  capture_pre_story_anchors "US-100"
  resolve_story_attribution "US-100" "$(ts)"
  assert_eq "resolve_no_advance:sha"        "no-commit" "$ATTR_PRIMARY_SHA"
  assert_eq "resolve_no_advance:cross_repo" "false"     "$ATTR_CROSS_REPO"
  assert_eq "resolve_no_advance:files"      "[]"        "$ATTR_FILES_CHANGED_JSON"
  [[ -f "$HQ_ROOT/$ATTR_SIDECAR_REL" ]] \
    && pass "resolve_no_advance:sidecar_written" \
    || fail "resolve_no_advance:sidecar_written" "missing $ATTR_SIDECAR_REL"
}

{ # Only sibling advanced → cross_repo=true, primary repo = sibling
  capture_pre_story_anchors "US-101"
  advance_repo "$SIBLING" "x.txt" "hello"
  resolve_story_attribution "US-101" "$(ts)"
  [[ "$ATTR_PRIMARY_SHA" != "no-commit" ]] \
    && pass "resolve_cross_repo:real_sha" \
    || fail "resolve_cross_repo:real_sha" "still no-commit"
  assert_eq "resolve_cross_repo:cross_repo" "true" "$ATTR_CROSS_REPO"
  assert_contains "resolve_cross_repo:primary_is_sibling" "sibling" "$ATTR_PRIMARY_REPO"
  # files_changed is HQ-root-relative under cross-repo mode
  assert_contains "resolve_cross_repo:files_rooted" "repos/public/sibling/x.txt" "$ATTR_FILES_CHANGED_JSON"
}

{ # Primary advanced → not cross-repo, primary SHA wins, repo-relative paths
  capture_pre_story_anchors "US-102"
  advance_repo "$PRIMARY" "y.txt" "world"
  resolve_story_attribution "US-102" "$(ts)"
  assert_eq "resolve_primary_only:cross_repo" "false" "$ATTR_CROSS_REPO"
  assert_eq "resolve_primary_only:primary_repo" "$PRIMARY" "$ATTR_PRIMARY_REPO"
  assert_contains "resolve_primary_only:files_rel" "y.txt" "$ATTR_FILES_CHANGED_JSON"
  # Should NOT be prefixed with repos/public/primary since single-repo mode
  if [[ "$ATTR_FILES_CHANGED_JSON" == *"repos/public/primary/y.txt"* ]]; then
    fail "resolve_primary_only:not_rooted" "files were hq-rooted when they should be repo-relative"
  else
    pass "resolve_primary_only:not_rooted"
  fi
}

{ # Sidecar rotation on retry
  capture_pre_story_anchors "US-102"
  advance_repo "$PRIMARY" "z.txt" "third"
  resolve_story_attribution "US-102" "$(ts)"
  # Previous sidecar should have been rotated aside
  rotated=$(ls "$HQ_ROOT/workspace/orchestrator/$PROJECT/executions/" 2>/dev/null \
    | grep -c 'US-102.attribution.json.prev-' || true)
  if (( rotated >= 1 )); then
    pass "resolve_sidecar_rotation"
  else
    fail "resolve_sidecar_rotation" "expected at least one .prev- file, got $rotated"
  fi
}

# --- Tests for update_state_completed upsert merge ---------------------------
echo
echo "== update_state_completed (upsert + prefer-real-sha merge) =="

# Inline the function. Depends on read_prd_stats + TOTAL/COMPLETED + STATE_FILE.
read_prd_stats() { :; }
TOTAL=10
COMPLETED=5

extract_function() {
  local name="$1"
  awk -v n="$name" '
    $0 ~ "^"n"\\(\\) \\{" { capture=1 }
    capture { print }
    capture && /^}$/ { exit }
  ' "$RUN_PROJECT_SH"
}

UPSERT_TMP="$(mktemp -t upsert.XXXXXX)"
extract_function update_state_completed > "$UPSERT_TMP"
# shellcheck disable=SC1090
source "$UPSERT_TMP"
rm -f "$UPSERT_TMP"

seed_state() {
  STATE_FILE="$(mktemp -t state.XXXXXX.json)"
  echo "$1" > "$STATE_FILE"
}

{ # upsert_replaces_same_id: two real SHAs → last wins, length 1
  seed_state '{"completed_tasks":[],"current_tasks":[],"progress":{},"failed_tasks":[]}'
  ATTR_CROSS_REPO=false ATTR_SIDECAR_REL="" update_state_completed "US-200" "aaaa111" "[]"
  ATTR_CROSS_REPO=false ATTR_SIDECAR_REL="" update_state_completed "US-200" "bbbb222" "[]"
  len=$(jq '.completed_tasks | length' "$STATE_FILE")
  sha=$(jq -r '.completed_tasks[0].commit_sha' "$STATE_FILE")
  assert_eq "upsert_replaces_same_id:length" "1"       "$len"
  assert_eq "upsert_replaces_same_id:wins"   "bbbb222" "$sha"
  rm -f "$STATE_FILE"
}

{ # upsert_prefers_real_sha: real then no-commit → real kept
  seed_state '{"completed_tasks":[],"current_tasks":[],"progress":{},"failed_tasks":[]}'
  ATTR_CROSS_REPO=false ATTR_SIDECAR_REL="" update_state_completed "US-201" "abc1234" "[]"
  ATTR_CROSS_REPO=false ATTR_SIDECAR_REL="" update_state_completed "US-201" "no-commit" "[]"
  len=$(jq '.completed_tasks | length' "$STATE_FILE")
  sha=$(jq -r '.completed_tasks[0].commit_sha' "$STATE_FILE")
  assert_eq "upsert_prefers_real_sha:length" "1"       "$len"
  assert_eq "upsert_prefers_real_sha:keeps"  "abc1234" "$sha"
  rm -f "$STATE_FILE"
}

{ # upsert_no_commit_first: no-commit then no-commit → stays no-commit (length 1)
  seed_state '{"completed_tasks":[],"current_tasks":[],"progress":{},"failed_tasks":[]}'
  ATTR_CROSS_REPO=false ATTR_SIDECAR_REL="" update_state_completed "US-202" "no-commit" "[]"
  ATTR_CROSS_REPO=false ATTR_SIDECAR_REL="" update_state_completed "US-202" "no-commit" "[]"
  len=$(jq '.completed_tasks | length' "$STATE_FILE")
  sha=$(jq -r '.completed_tasks[0].commit_sha' "$STATE_FILE")
  assert_eq "upsert_no_commit_first:length" "1"          "$len"
  assert_eq "upsert_no_commit_first:sha"    "no-commit"  "$sha"
  rm -f "$STATE_FILE"
}

# --- Summary ---------------------------------------------------------------
echo
echo "================================"
echo "  passed: $PASS"
echo "  failed: $FAIL"
if (( FAIL > 0 )); then
  echo
  printf '  %s\n' "${FAILURES[@]}"
  exit 1
fi
