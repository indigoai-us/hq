#!/usr/bin/env bash
# UserPromptSubmit hook: consults knowledge base for relevant context
# Reads user prompt from stdin, queries qmd, outputs formatted results
# Fails silently on all errors — always exits 0

set -o pipefail

PROMPT="$(cat)" 2>/dev/null

# Exit silently if prompt is empty
[ -z "$PROMPT" ] && exit 0

# Concurrency guard — only one qmd query at a time to prevent memory spikes
# (autopilot spawns many sub-agents, each triggering this hook)
LOCKDIR="/tmp/consult-knowledge.lock"
cleanup() { rmdir "$LOCKDIR" 2>/dev/null; }

if ! mkdir "$LOCKDIR" 2>/dev/null; then
  # Another instance is running — check for stale lock (>60s)
  if [ -d "$LOCKDIR" ]; then
    LOCK_AGE=$(( $(date +%s) - $(stat -f %m "$LOCKDIR" 2>/dev/null || echo 0) ))
    if [ "$LOCK_AGE" -gt 60 ]; then
      rmdir "$LOCKDIR" 2>/dev/null
      mkdir "$LOCKDIR" 2>/dev/null || exit 0
    else
      exit 0
    fi
  else
    exit 0
  fi
fi
trap cleanup EXIT

# Query knowledge base, suppress all errors
RESULTS="$(qmd query "$PROMPT" -n 5 --json 2>/dev/null)" || exit 0

# Exit silently if no results or empty
[ -z "$RESULTS" ] && exit 0

# Parse results — exit silently if jq fails or array is empty
COUNT="$(echo "$RESULTS" | jq -r 'if type == "array" then length else 0 end' 2>/dev/null)" || exit 0
[ "$COUNT" -eq 0 ] 2>/dev/null && exit 0

# Output formatted markdown context
echo "## Relevant Knowledge"
echo "$RESULTS" | jq -r '.[] | "- **\(.title // .path // "Untitled")** (\(.path // "unknown")): \(.snippet // .content // "" | gsub("\n"; " ") | .[0:200])"' 2>/dev/null || exit 0

exit 0
