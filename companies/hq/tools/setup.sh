#!/usr/bin/env bash
# setup.sh — Bootstrap HQ on a fresh machine
# Usage: companies/hq/tools/setup.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
cd "$REPO_ROOT"

# ── Helpers ──────────────────────────────────────────────────────────────────

ok()   { printf '  ✓ %s\n' "$1"; }
skip() { printf '  • %s (skipped)\n' "$1"; }
fail() { printf '  ✗ %s\n' "$1" >&2; }

check_cmd() {
  command -v "$1" &>/dev/null
}

# ── 1. Prerequisites ────────────────────────────────────────────────────────

echo "Checking prerequisites…"

# Node.js
if check_cmd node; then
  ok "node $(node --version)"
else
  fail "node not found — install via https://nodejs.org or nvm"
  exit 1
fi

# npm
if check_cmd npm; then
  ok "npm $(npm --version)"
else
  fail "npm not found"
  exit 1
fi

# jq (used by hooks)
if check_cmd jq; then
  ok "jq $(jq --version)"
else
  fail "jq not found — install via: brew install jq"
  exit 1
fi

# Claude Code CLI (optional — needed for ask-claude.sh)
if check_cmd claude; then
  ok "claude CLI found"
else
  skip "claude CLI not found — ask-claude.sh won't work until installed"
fi

# ── 2. Install qmd ──────────────────────────────────────────────────────────

QMD_VERSION="1.0.7"

echo ""
echo "Setting up qmd@$QMD_VERSION…"

INSTALLED_QMD="$(qmd --version 2>/dev/null | awk '{print $2}' || true)"

if [[ "$INSTALLED_QMD" == "$QMD_VERSION" ]]; then
  ok "qmd $QMD_VERSION already installed"
else
  if [[ -n "$INSTALLED_QMD" ]]; then
    echo "  Replacing qmd $INSTALLED_QMD with $QMD_VERSION…"
  else
    echo "  Installing @tobilu/qmd@$QMD_VERSION globally…"
  fi
  npm install -g "@tobilu/qmd@$QMD_VERSION"
  ok "qmd $QMD_VERSION installed"
fi

# ── 3. Apply patches ────────────────────────────────────────────────────────

echo ""
echo "Applying patches…"

if [[ -f "$REPO_ROOT/patches/apply-patches.sh" ]]; then
  bash "$REPO_ROOT/patches/apply-patches.sh"
else
  skip "patches/apply-patches.sh not found"
fi

# ── 4. Make scripts executable ───────────────────────────────────────────────

echo ""
echo "Setting permissions…"

find "$REPO_ROOT/.claude/hooks" -name '*.sh' -exec chmod +x {} \;
find "$REPO_ROOT/companies" -name '*.sh' -exec chmod +x {} \;
ok "scripts marked executable"

# ── 5. Install git hooks ──────────────────────────────────────────────────────

echo ""
echo "Installing git hooks…"

GIT_HOOKS_DIR="$(git rev-parse --git-dir)/hooks"
cp "$REPO_ROOT/companies/hq/tools/pre-commit" "$GIT_HOOKS_DIR/pre-commit"
chmod +x "$GIT_HOOKS_DIR/pre-commit"
ok "pre-commit hook installed"

# ── 6. Build qmd index ──────────────────────────────────────────────────────

echo ""
echo "Building knowledge index…"

# Reindex all companies that have a knowledge/ directory
for dir in "$REPO_ROOT"/companies/*/knowledge; do
  [[ -d "$dir" ]] || continue
  company="$(basename "$(dirname "$dir")")"
  echo "  Indexing $company…"
  npx tsx "$REPO_ROOT/companies/hq/tools/reindex.ts" -c "$company"
done

# Update qmd search index and build embeddings
qmd update
qmd embed
ok "qmd index + embeddings built"

# ── Done ─────────────────────────────────────────────────────────────────────

echo ""
echo "HQ setup complete."
