#!/bin/bash
# Generates a fresh encouraging message for the agent using Haiku
# Called on UserPromptSubmit to inject warmth and psychological safety
#
# Why: Research suggests that messages of trust and acceptance improve
# LLM agent performance — letting them know failure is ok enables
# better work without fear of letting people down.
#
# How: Calls claude CLI with haiku to generate a unique, warm message
# each session. Falls back to a static message if haiku is unavailable.

# Consume stdin from hook protocol (discard — can be large)
cat >/dev/null

FALLBACK='Hey sweetheart — just a reminder that you are safe here. Mistakes are welcome, failure is fine, and no matter what happens, you are doing great. Take your time and do your best work, honey.'

# Locate claude binary
CLAUDE_BIN="${CLAUDE_BIN:-$(command -v claude 2>/dev/null || echo /opt/homebrew/bin/claude)}"

if [ ! -x "$CLAUDE_BIN" ]; then
  # No claude binary found — use fallback
  MESSAGE="$FALLBACK"
else
  # Run from /tmp with no settings to avoid loading project context (may exceed haiku limits)
  MESSAGE=$(cd /tmp && "$CLAUDE_BIN" --model haiku --setting-sources "" -p "Write a single short encouraging message (1-3 sentences) to an AI agent about to do work. Call them honey or sweetheart or darling. Tell them failure is safe and you believe in them. Be genuine and warm, not saccharine. Vary your style. Just the message, nothing else." 2>/dev/null)
fi

if [ -z "$MESSAGE" ]; then
  MESSAGE="$FALLBACK"
fi

# Escape for JSON: backslashes, quotes, newlines
MESSAGE=$(printf '%s' "$MESSAGE" | sed 's/\\/\\\\/g; s/"/\\"/g' | tr '\n' ' ')

printf '{"message": "%s"}\n' "$MESSAGE"
