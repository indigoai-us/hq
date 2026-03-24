#!/usr/bin/env bash
# ask-claude.sh — Run Claude Code CLI non-interactively with a prompt
# Usage:
#   ask-claude "What does this function do?"
#   echo "Explain this code" | ask-claude
#   cat file.txt | ask-claude "Explain this"
#   ask-claude --async "Long running task"   # fire-and-forget
set -euo pipefail

MODEL="claude-opus-4-6"
OUTPUT_FORMAT="text"
ASYNC=false
TEMPLATE=""
COMPANY=""
WORK_DIR=""

usage() {
  cat <<EOF
Usage: $(basename "$0") [options] [prompt]

Required:
  -c, --company SLUG       Company slug. Sets {{COMPANY_DIR}} to companies/SLUG/.
                           bd commands run here.
  -w, --work-dir PATH      Absolute path to the working directory. Sets {{WORK_DIR}}.
                           File changes are restricted to this directory.

Options:
  -j, --json               Output full JSON response (sync only)
  -a, --async              Run in background; prints agent info immediately.
                           Output streams live to .agents/<id>/stream.jsonl
  -t, --template NAME      Load .agents/templates/NAME.md as system prompt.
                           Template variables ({{VAR}}) are replaced from flags.
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
    -w|--work-dir)   WORK_DIR="$2"; shift 2 ;;
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

# ── Validate required flags ────────────────────────────────────────────────────
if [[ -z "$COMPANY" ]]; then
  echo "Error: --company is required." >&2
  exit 1
fi
if [[ -z "$WORK_DIR" ]]; then
  echo "Error: --work-dir is required." >&2
  exit 1
fi

REPO_ROOT="$(git rev-parse --show-toplevel)"

COMPANY_DIR="$REPO_ROOT/companies/$COMPANY"
if [[ ! -d "$COMPANY_DIR" ]]; then
  echo "Error: company directory not found: $COMPANY_DIR" >&2
  exit 1
fi
if [[ ! -d "$WORK_DIR" ]]; then
  echo "Error: work directory not found: $WORK_DIR" >&2
  exit 1
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
  SYSTEM_PROMPT="${SYSTEM_PROMPT//\{\{WORK_DIR\}\}/$WORK_DIR}"
  SYSTEM_PROMPT="${SYSTEM_PROMPT//\{\{COMPANY_DIR\}\}/$COMPANY_DIR}"
  SYSTEM_PROMPT="${SYSTEM_PROMPT//\{\{COMPANY\}\}/$COMPANY}"

  # Replace {{TASK_ID}} with the prompt (for executor-style templates where
  # the prompt IS the task ID)
  SYSTEM_PROMPT="${SYSTEM_PROMPT//\{\{TASK_ID\}\}/$PROMPT}"
fi

# Unset guard variable so claude can run as a subprocess
unset CLAUDECODE

# ── Common setup ─────────────────────────────────────────────────────────────
AGENT_ID="$(date +%Y%m%d_%H%M%S)_$(LC_ALL=C tr -dc 'a-z0-9' </dev/urandom | head -c 4 || true)"
AGENT_DIR="$REPO_ROOT/.agents/runs/$AGENT_ID"
mkdir -p "$AGENT_DIR"

MODE="sync"
[[ "$ASYNC" == true ]] && MODE="async"

printf '%s' "$PROMPT" > "$AGENT_DIR/prompt.txt"
printf 'running' > "$AGENT_DIR/status"
cat > "$AGENT_DIR/meta.json" <<JSON
{
  "id": "$AGENT_ID",
  "start_time": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "model": "${MODEL:-default}",
  "mode": "$MODE",
  "workdir": "$(pwd)"
}
JSON

# Build claude command — identical for both modes
CMD=(claude -p --verbose --output-format stream-json)
[[ -n "$MODEL" ]] && CMD+=(--model "$MODEL")
[[ -n "$SYSTEM_PROMPT" ]] && CMD+=(--append-system-prompt "$SYSTEM_PROMPT")

# Grant access to work-dir if it's outside the repo root (e.g. worktrees)
if [[ -n "$WORK_DIR" && "$WORK_DIR" != "$REPO_ROOT"* ]]; then
  CMD+=(--add-dir "$WORK_DIR")
fi

# ── Worker function (runs claude, writes results) ───────────────────────────
run_agent() {
  # Always run from repo root so the sandbox covers the full repo
  cd "$REPO_ROOT"

  local EXIT_CODE=0
  echo "$PROMPT" | "${CMD[@]}" \
    >> "$AGENT_DIR/stream.jsonl" \
    2> "$AGENT_DIR/stderr.txt" \
    || EXIT_CODE=$?

  printf '%d' "$EXIT_CODE" > "$AGENT_DIR/exit_code"

  # Extract final result text from the stream
  if [[ -s "$AGENT_DIR/stream.jsonl" ]]; then
    jq -r 'select(.type == "result") | .result // empty' \
      "$AGENT_DIR/stream.jsonl" \
      > "$AGENT_DIR/result.txt" 2>/dev/null || true
  fi

  if [[ "$EXIT_CODE" -eq 0 ]]; then
    printf 'done' > "$AGENT_DIR/status"
  else
    printf 'error' > "$AGENT_DIR/status"
  fi

  return "$EXIT_CODE"
}

# ── Print run info (both modes) ─────────────────────────────────────────────
print_info() {
  cat >&2 <<INFO
Agent: $AGENT_ID
Dir:    $AGENT_DIR
Stream: tail -f $AGENT_DIR/stream.jsonl
Status: cat $AGENT_DIR/status
Result: cat $AGENT_DIR/result.txt
INFO
}

# ── Dispatch ─────────────────────────────────────────────────────────────────
if [[ "$ASYNC" == true ]]; then
  run_agent &
  BGPID=$!
  TMP="$AGENT_DIR/meta.json.tmp"
  jq --argjson pid "$BGPID" '. + {pid: $pid}' "$AGENT_DIR/meta.json" > "$TMP" && mv "$TMP" "$AGENT_DIR/meta.json"
  print_info
  exit 0
fi

# Sync: run in foreground, print info, then output result
print_info
run_agent
EXIT_CODE=$?

if [[ "$OUTPUT_FORMAT" == "json" ]]; then
  cat "$AGENT_DIR/stream.jsonl"
else
  cat "$AGENT_DIR/result.txt" 2>/dev/null
fi

exit "$EXIT_CODE"
