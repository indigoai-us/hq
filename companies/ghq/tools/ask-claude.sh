#!/usr/bin/env bash
# ask-claude.sh — Run Claude Code CLI non-interactively with a prompt
# Usage:
#   ask-claude "What does this function do?"
#   echo "Explain this code" | ask-claude
#   cat file.txt | ask-claude "Explain this"
#   ask-claude --async "Long running task"   # fire-and-forget
set -euo pipefail

MODEL=""
OUTPUT_FORMAT="text"
ASYNC=false
TEMPLATE=""
COMPANY=""
WORKDIR=""

usage() {
  cat <<EOF
Usage: $(basename "$0") [options] [prompt]

Options:
  -j, --json               Output full JSON response (sync only)
  -a, --async              Run in background; prints agent info immediately.
                           Output streams live to .agents/<id>/stream.jsonl
  -t, --template NAME      Load .agents/templates/NAME.md as system prompt.
                           Template variables ({{VAR}}) are replaced from
                           the prompt and --company flag.
  -c, --company SLUG       Company slug. Sets {{WORK_DIR}} to companies/SLUG/
                           and adds company context to the prompt.
  -w, --workdir DIR        Run claude subprocess in this directory.
                           Useful for worktrees or out-of-tree execution.
  -h, --help               Show this help

Prompt can be passed as an argument or piped via stdin.
Only the final answer is printed to stdout (intermediate tool use is suppressed).
EOF
  exit 0
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -m|--model)      MODEL="$2"; shift 2 ;;
    -j|--json)       OUTPUT_FORMAT="json"; shift ;;
    -a|--async)      ASYNC=true; shift ;;
    -t|--template)   TEMPLATE="$2"; shift 2 ;;
    -c|--company)    COMPANY="$2"; shift 2 ;;
    -w|--workdir)    WORKDIR="$2"; shift 2 ;;
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

# ── Resolve repo root before any cd (worktrees change --show-toplevel) ────────
REPO_ROOT="$(git rev-parse --show-toplevel)"

# ── Change to workdir if specified ─────────────────────────────────────────────
if [[ -n "$WORKDIR" ]]; then
  if [[ ! -d "$WORKDIR" ]]; then
    echo "Error: workdir not found: $WORKDIR" >&2
    exit 1
  fi
  cd "$WORKDIR"
fi

# ── Resolve company path ───────────────────────────────────────────────────────
COMPANY_DIR=""
if [[ -n "$COMPANY" ]]; then
  COMPANY_DIR="$REPO_ROOT/companies/$COMPANY"
  if [[ ! -d "$COMPANY_DIR" ]]; then
    echo "Error: company directory not found: $COMPANY_DIR" >&2
    exit 1
  fi
fi

# ── Resolve template ──────────────────────────────────────────────────────────
SYSTEM_PROMPT=""
if [[ -n "$TEMPLATE" ]]; then
  TEMPLATE_FILE="$REPO_ROOT/.agents/templates/${TEMPLATE}.md"
  if [[ ! -f "$TEMPLATE_FILE" ]]; then
    echo "Error: template not found: $TEMPLATE_FILE" >&2
    exit 1
  fi
  SYSTEM_PROMPT="$(cat "$TEMPLATE_FILE")"

  # Replace template variables
  WORK_DIR="${COMPANY_DIR:-$(pwd)}"
  SYSTEM_PROMPT="${SYSTEM_PROMPT//\{\{WORK_DIR\}\}/$WORK_DIR}"

  # Replace {{TASK_ID}} with the prompt (for executor-style templates where
  # the prompt IS the task ID)
  SYSTEM_PROMPT="${SYSTEM_PROMPT//\{\{TASK_ID\}\}/$PROMPT}"
fi

# Unset guard variable so claude can run as a subprocess
unset CLAUDECODE

# ── Async mode ────────────────────────────────────────────────────────────────
if [[ "$ASYNC" == true ]]; then
  AGENT_ID="$(date +%Y%m%d_%H%M%S)_$(LC_ALL=C tr -dc 'a-z0-9' </dev/urandom | head -c 4 || true)"
  AGENT_DIR="$REPO_ROOT/.agents/runs/$AGENT_ID"
  mkdir -p "$AGENT_DIR"

  # Write prompt and metadata immediately
  printf '%s' "$PROMPT" > "$AGENT_DIR/prompt.txt"
  printf 'running' > "$AGENT_DIR/status"
  cat > "$AGENT_DIR/meta.json" <<JSON
{
  "id": "$AGENT_ID",
  "start_time": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "model": "${MODEL:-default}",
  "output_format": "stream-json"
}
JSON

  # Build claude command (stream-json for live output)
  CMD=(claude -p --verbose --output-format stream-json)
  [[ -n "$MODEL" ]] && CMD+=(--model "$MODEL")
  [[ -n "$SYSTEM_PROMPT" ]] && CMD+=(--append-system-prompt "$SYSTEM_PROMPT")
  CMD+=(--disallowedTools "Bash(./companies/ghq/tools/ask-claude.sh*)" "Bash(ask-claude*)")

  # Launch background worker
  (
    EXIT_CODE=0
    echo "$PROMPT" | "${CMD[@]}" \
      >> "$AGENT_DIR/stream.jsonl" \
      2> "$AGENT_DIR/stderr.txt" \
      || EXIT_CODE=$?

    printf '%d' "$EXIT_CODE" > "$AGENT_DIR/exit_code"

    # Extract final result text and session ID from the stream
    if [[ -s "$AGENT_DIR/stream.jsonl" ]]; then
      jq -r 'select(.type == "result") | .result // empty' \
        "$AGENT_DIR/stream.jsonl" \
        > "$AGENT_DIR/result.txt" 2>/dev/null || true
      SESSION_ID="$(jq -r 'select(.session_id != null) | .session_id' \
        "$AGENT_DIR/stream.jsonl" 2>/dev/null | tail -1)"
      if [[ -n "$SESSION_ID" ]]; then
        printf '%s' "$SESSION_ID" > "$AGENT_DIR/session_id"
      fi
    fi

    if [[ "$EXIT_CODE" -eq 0 ]]; then
      printf 'done' > "$AGENT_DIR/status"
    else
      printf 'error' > "$AGENT_DIR/status"
    fi
  ) &

  # Update meta with background PID
  BGPID=$!
  # Rewrite meta with pid (bash-portable in-place via temp file)
  TMP="$AGENT_DIR/meta.json.tmp"
  jq --argjson pid "$BGPID" '. + {pid: $pid}' "$AGENT_DIR/meta.json" > "$TMP" && mv "$TMP" "$AGENT_DIR/meta.json"

  # Print debug info to stdout
  cat <<INFO
Agent started: $AGENT_ID
Monitor:  tail -f $AGENT_DIR/stream.jsonl
Status:   cat $AGENT_DIR/status
Result:   cat $AGENT_DIR/result.txt
Resume:   claude --resume \$(cat $AGENT_DIR/session_id)
INFO
  exit 0
fi

# ── Sync mode (unchanged) ─────────────────────────────────────────────────────
CMD=(claude -p
  --output-format json
)
[[ -n "$MODEL" ]] && CMD+=(--model "$MODEL")
[[ -n "$SYSTEM_PROMPT" ]] && CMD+=(--append-system-prompt "$SYSTEM_PROMPT")
# --disallowedTools is variadic (<tools...>) so it must come last, right before
# the prompt is piped via stdin to avoid it swallowing positional args.
CMD+=(--disallowedTools "Bash(./companies/ghq/tools/ask-claude.sh*)" "Bash(ask-claude*)")

RAW=$(echo "$PROMPT" | "${CMD[@]}")

SESSION_ID="$(echo "$RAW" | jq -r '.session_id // empty')"
if [[ -n "$SESSION_ID" ]]; then
  echo "Resume:   claude --resume $SESSION_ID" >&2
fi

if [[ "$OUTPUT_FORMAT" == "json" ]]; then
  echo "$RAW"
else
  # Extract only the final result text, stripping intermediate tool output
  echo "$RAW" | jq -r '.result // empty'
fi
