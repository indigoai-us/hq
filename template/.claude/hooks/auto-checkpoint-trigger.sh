#!/bin/bash
# PostToolUse hook: detect checkpoint-worthy events and nudge Claude to write a lightweight auto-checkpoint.
# Fires after Bash (git commit detection) and Write (report/draft generation) tool calls.
# Fast path (<50ms) for non-matching calls. Only matching calls run git commands.

set -euo pipefail

HQ="$(cd "$(dirname "$0")/../.." && pwd)"
INPUT=$(cat)

TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')

should_checkpoint=false
trigger=""

case "$TOOL_NAME" in
  Bash)
    CMD=$(echo "$INPUT" | jq -r '.tool_input.command // empty')
    # Match git commit commands (not git commit --help, git commit-tree, etc.)
    if echo "$CMD" | grep -qE 'git commit(\s|$)'; then
      should_checkpoint=true
      trigger="git-commit"
    fi
    ;;
  Write)
    FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')
    # Match report/social-draft/company-data generation
    if echo "$FILE_PATH" | grep -qE '(workspace/reports/|workspace/social-drafts/|companies/.*/data/)'; then
      should_checkpoint=true
      trigger="file-generation"
    fi
    ;;
esac

if [ "$should_checkpoint" = false ]; then
  exit 0
fi

# Capture current git state
cd "$HQ"
GIT_SHA=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
GIT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
DIRTY_COUNT=$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')
TIMESTAMP=$(date -u +"%Y%m%d-%H%M%S")

# Build the nudge message
cat <<EOF
AUTO-CHECKPOINT REQUIRED (trigger: ${trigger}).

Write a lightweight auto-checkpoint thread NOW:
  File: workspace/threads/T-${TIMESTAMP}-auto-{slug}.json
  (Replace {slug} with 2-3 word summary of recent work)

Include ONLY:
  thread_id, version: 1, type: "auto-checkpoint", created_at, updated_at,
  workspace_root, cwd,
  git: { branch: "${GIT_BRANCH}", current_commit: "${GIT_SHA}", dirty: $([ "$DIRTY_COUNT" -gt 0 ] && echo "true" || echo "false") },
  conversation_summary (1 sentence), files_touched (from this session),
  metadata: { title: "Auto: ...", tags: ["auto-checkpoint"], trigger: "${trigger}" }

Do NOT: rebuild INDEX files, update recent.md, run qmd update, write legacy checkpoint.
Keep it fast — just write the JSON file and continue working.
EOF
