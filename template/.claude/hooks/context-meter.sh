#!/usr/bin/env bash
# Context meter — fires on Stop hook, reads transcript to estimate context usage.
# Writes a one-line CTX report to /tmp/.hq-context-meter.
# CLAUDE.md instructs the model to output this at the end of every response.

set -euo pipefail

INPUT=$(cat)
TRANSCRIPT=$(echo "$INPUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('transcript_path',''))" 2>/dev/null) || exit 0

[ -z "$TRANSCRIPT" ] || [ ! -f "$TRANSCRIPT" ] && exit 0

# Get the last assistant message's input_tokens (= current context size)
TOKENS=$(tail -20 "$TRANSCRIPT" | grep -o '"input_tokens":[0-9]*' | tail -1 | cut -d: -f2) || exit 0
[ -z "$TOKENS" ] && exit 0

# Also grab cache_read tokens
CACHE=$(tail -20 "$TRANSCRIPT" | grep -o '"cache_read_input_tokens":[0-9]*' | tail -1 | cut -d: -f2) || true
CACHE=${CACHE:-0}
TOTAL=$((TOKENS + CACHE))

# Context window is 200K (Claude Code effective limit)
WINDOW=200000
PCT=$((TOTAL * 100 / WINDOW))

# Write to file AND stdout (stdout → system-reminder for model to repeat)
METER_FILE="/tmp/.hq-context-meter"
if [ "$PCT" -ge 75 ]; then
  MSG="⚠️ CTX: ${PCT}% (${TOTAL}/${WINDOW}) — HANDOFF SOON"
elif [ "$PCT" -ge 50 ]; then
  MSG="📊 CTX: ${PCT}% (${TOTAL}/${WINDOW})"
else
  MSG="CTX: ${PCT}% (${TOTAL}/${WINDOW})"
fi
echo "$MSG" > "$METER_FILE"
echo "$MSG"

exit 0
