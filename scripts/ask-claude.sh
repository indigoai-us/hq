#!/usr/bin/env bash
# ask-claude.sh — Run Claude Code CLI non-interactively with a prompt
# Usage:
#   ask-claude "What does this function do?"
#   echo "Explain this code" | ask-claude
#   ask-claude -m sonnet "Summarize README.md"
#   cat file.txt | ask-claude "Explain this"
set -euo pipefail

MODEL=""
MAX_TURNS=1
OUTPUT_FORMAT="text"

usage() {
  cat <<EOF
Usage: $(basename "$0") [options] [prompt]

Options:
  -m, --model MODEL        Model alias or full name (default: your claude config default)
  -t, --max-turns N        Max agentic turns (default: 1)
  -j, --json               Output full JSON response (includes cost, usage, etc.)
  -h, --help               Show this help

Prompt can be passed as an argument or piped via stdin.
Only the final answer is printed to stdout (intermediate tool use is suppressed).
EOF
  exit 0
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -m|--model)      MODEL="$2"; shift 2 ;;
    -t|--max-turns)  MAX_TURNS="$2"; shift 2 ;;
    -j|--json)       OUTPUT_FORMAT="json"; shift ;;
    -h|--help)       usage ;;
    --)              shift; break ;;
    -*)              echo "Unknown option: $1" >&2; exit 1 ;;
    *)               break ;;
  esac
done

# Build prompt: remaining args + stdin if piped
PROMPT="${*:-}"
if [[ ! -t 0 ]]; then
  STDIN_CONTENT="$(cat)"
  if [[ -n "$PROMPT" ]]; then
    PROMPT="$PROMPT"$'\n\n'"$STDIN_CONTENT"
  else
    PROMPT="$STDIN_CONTENT"
  fi
fi

if [[ -z "$PROMPT" ]]; then
  echo "Error: no prompt provided. Pass as argument or pipe via stdin." >&2
  exit 1
fi

# Unset guard variable so claude can run as a subprocess
unset CLAUDECODE

# Always fetch as JSON internally so we can extract just the final answer
CMD=(claude -p
  --max-turns "$MAX_TURNS"
  --output-format json
)
[[ -n "$MODEL" ]] && CMD+=(--model "$MODEL")
# --disallowedTools is variadic (<tools...>) so it must come last, right before
# the prompt is piped via stdin to avoid it swallowing positional args.
CMD+=(--disallowedTools "Bash(./scripts/ask-claude.sh*)" "Bash(ask-claude*)")

RAW=$(echo "$PROMPT" | "${CMD[@]}")

if [[ "$OUTPUT_FORMAT" == "json" ]]; then
  echo "$RAW"
else
  # Extract only the final result text, stripping intermediate tool output
  echo "$RAW" | jq -r '.result // empty'
fi
