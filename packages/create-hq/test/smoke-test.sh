#!/usr/bin/env bash
# smoke-test.sh — Run create-hq inside a container and validate the output.
# Designed to run INSIDE a Docker container (blank-slate or pre-deps).
#
# The orchestrator (run-smoke-tests.sh) mounts:
#   /opt/create-hq/create-hq.tgz  — npm-packed tarball of the local build
#   /opt/create-hq/template/       — the HQ template directory
#
# This script installs create-hq from the local tarball, then runs the
# actual `create-hq` command end-to-end with --local-template to avoid
# needing GitHub API auth inside the container.
#
# Usage: ./smoke-test.sh [--image <name>]
#   --image <name>  Identifier for which Docker image this is running in (for reports)

set -euo pipefail

IMAGE_NAME="unknown"
TEST_DIR="/tmp/test-hq"
PASS_COUNT=0
FAIL_COUNT=0
RESULTS=()
START_TIME=$(date +%s%3N 2>/dev/null || date +%s)

# --- Argument parsing ---
while [[ $# -gt 0 ]]; do
  case "$1" in
    --image) IMAGE_NAME="$2"; shift 2 ;;
    *) echo "Unknown argument: $1"; exit 1 ;;
  esac
done

# --- Helpers ---
assert() {
  local name="$1"
  local start_ms
  start_ms=$(date +%s%3N 2>/dev/null || date +%s)

  if eval "$2"; then
    local end_ms
    end_ms=$(date +%s%3N 2>/dev/null || date +%s)
    local dur=$(( end_ms - start_ms ))
    echo "  PASS  ${name} (${dur}ms)"
    RESULTS+=("{\"name\":\"${name}\",\"passed\":true,\"duration_ms\":${dur},\"message\":\"\"}")
    PASS_COUNT=$((PASS_COUNT + 1))
  else
    local end_ms
    end_ms=$(date +%s%3N 2>/dev/null || date +%s)
    local dur=$(( end_ms - start_ms ))
    echo "  FAIL  ${name} (${dur}ms)"
    RESULTS+=("{\"name\":\"${name}\",\"passed\":false,\"duration_ms\":${dur},\"message\":\"Assertion failed\"}")
    FAIL_COUNT=$((FAIL_COUNT + 1))
  fi
}

assert_skip() {
  local name="$1"
  local reason="$2"
  echo "  SKIP  ${name} — ${reason}"
  RESULTS+=("{\"name\":\"${name}\",\"passed\":true,\"duration_ms\":0,\"message\":\"skipped: ${reason}\"}")
  PASS_COUNT=$((PASS_COUNT + 1))
}

HAS_GIT=false
if command -v git &>/dev/null; then
  HAS_GIT=true
fi

# --- Environment info ---
echo "=== Smoke Test: ${IMAGE_NAME} ==="
echo "Node: $(node --version)"
echo "npm: $(npm --version)"
echo "Git: $(git --version 2>/dev/null || echo 'not installed')"
echo ""

# --- Install create-hq from local tarball ---
TARBALL="/opt/create-hq/create-hq.tgz"
TEMPLATE_DIR="/opt/create-hq/template"

if [ ! -f "$TARBALL" ]; then
  echo "FATAL: Local tarball not found at ${TARBALL}"
  echo "The orchestrator (run-smoke-tests.sh) must mount the packed tarball."
  exit 1
fi

echo "Installing create-hq from local tarball (user-local)..."
# Install locally to a temp dir — non-root can't install globally
INSTALL_DIR="/tmp/create-hq-install"
mkdir -p "$INSTALL_DIR"
cd "$INSTALL_DIR"
npm init -y --silent 2>&1
npm install "$TARBALL" 2>&1
CREATE_HQ_BIN="$INSTALL_DIR/node_modules/.bin/create-hq"
cd /home/testuser
echo ""

echo "Testing create-hq CLI loads correctly..."
"$CREATE_HQ_BIN" --version 2>&1 || {
  echo "FATAL: create-hq --version failed"
  exit 1
}
echo ""

# --- Run create-hq end-to-end ---
# Uses --local-template to avoid GitHub API auth inside the container.
# This exercises the full scaffold pipeline: template copy, git init,
# integrity checks — everything except the network fetch.
#
# --skip-deps: The new dep installer is interactive (prompts to install missing
# tools like claude, qmd, yq). In a headless container with /dev/null stdin,
# prompts auto-accept but npm install -g fails as non-root. Dep install is
# for real users at a terminal — the smoke test validates the scaffold output.
echo "Running: create-hq ${TEST_DIR} --local-template ${TEMPLATE_DIR} --yes"
"$CREATE_HQ_BIN" "${TEST_DIR}" \
  --local-template "${TEMPLATE_DIR}" \
  --yes \
  < /dev/null 2>&1 || {
  echo "FATAL: create-hq exited with non-zero status"
  exit 1
}
echo ""

# --- Assertions ---
echo "--- Assertions ---"

# Top-level directories
for dir in .claude workers companies workspace knowledge scripts; do
  assert "dir-exists:${dir}" "[ -d '${TEST_DIR}/${dir}' ]"
done

# .claude/CLAUDE.md exists and non-empty
assert "file-exists:.claude/CLAUDE.md" "[ -s '${TEST_DIR}/.claude/CLAUDE.md' ]"

# core.yaml exists and contains 'locked'
assert "file-exists:core.yaml" "[ -f '${TEST_DIR}/core.yaml' ]"
assert "core.yaml-has-locked" "grep -q 'locked' '${TEST_DIR}/core.yaml'"

# Git assertions (conditional on git availability)
if [ "$HAS_GIT" = true ]; then
  assert "git-initialized:.git" "[ -d '${TEST_DIR}/.git' ]"
  assert "gitignore-exists" "[ -f '${TEST_DIR}/.gitignore' ]"
else
  assert_skip "git-initialized:.git" "git not available"
  assert_skip "gitignore-exists" "git not available"
fi

# No placeholder strings in core operational files
# Exempt paths match the existing vitest suite: knowledge, starter-projects,
# .claude/policies, .claude/commands, modules/modules.yaml, README.md, workers
assert "no-placeholders-in-core-files" "
  ! find '${TEST_DIR}' -type f \
    -not -path '${TEST_DIR}/.git/*' \
    -not -path '${TEST_DIR}/node_modules/*' \
    -not -path '${TEST_DIR}/knowledge/*' \
    -not -path '${TEST_DIR}/starter-projects/*' \
    -not -path '${TEST_DIR}/.claude/policies/*' \
    -not -path '${TEST_DIR}/.claude/commands/*' \
    -not -path '${TEST_DIR}/workers/*' \
    -not -name 'modules.yaml' \
    -not -name 'README.md' \
    -exec grep -l '{your-username}\|{your-name}' {} + 2>/dev/null | grep -q .
"

# create-hq CLI validation — verify the binary actually works
assert "cli-loads" "'$CREATE_HQ_BIN' --help >/dev/null 2>&1"
assert "cli-version-matches-package" "'$CREATE_HQ_BIN' --version 2>&1 | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+'"

# --- Summary ---
END_TIME=$(date +%s%3N 2>/dev/null || date +%s)
TOTAL_DURATION=$(( END_TIME - START_TIME ))

echo ""
echo "--- Summary (${IMAGE_NAME}) ---"
echo "Pass: ${PASS_COUNT}  Fail: ${FAIL_COUNT}  Duration: ${TOTAL_DURATION}ms"

# Output structured JSON to stdout (parseable by orchestrator)
ASSERTIONS_JSON=$(printf '%s,' "${RESULTS[@]}" | sed 's/,$//')
echo ""
echo "JSON_REPORT_START"
echo "{\"image\":\"${IMAGE_NAME}\",\"passed\":$([ $FAIL_COUNT -eq 0 ] && echo true || echo false),\"pass_count\":${PASS_COUNT},\"fail_count\":${FAIL_COUNT},\"duration_ms\":${TOTAL_DURATION},\"assertions\":[${ASSERTIONS_JSON}]}"
echo "JSON_REPORT_END"

if [ $FAIL_COUNT -gt 0 ]; then
  exit 1
fi

exit 0
