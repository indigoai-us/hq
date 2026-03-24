#!/usr/bin/env bash
# agent-stream.sh — Parse and display an agent run's stream.jsonl
# Shows tool calls, assistant messages, and errors in a readable format.
set -euo pipefail

usage() {
  cat <<EOF
Usage: $(basename "$0") [options] <run-id-or-path>

Displays a readable summary of an agent run's stream.jsonl.

Arguments:
  run-id-or-path    Agent run ID (e.g. 20260324_173522_ihao) or path to stream.jsonl

Options:
  --errors          Show only errors and flagged results
  --tools           Show only tool calls (no assistant text)
  --full            Show full output (don't truncate)
  -h, --help        Show this help

Examples:
  $(basename "$0") 20260324_173522_ihao
  $(basename "$0") --errors 20260324_173522_ihao
  $(basename "$0") .agents/runs/20260324_173522_ihao/stream.jsonl
EOF
  exit 0
}

FILTER=""
TRUNCATE=200

while [[ $# -gt 0 ]]; do
  case "$1" in
    --errors)  FILTER="errors"; shift ;;
    --tools)   FILTER="tools"; shift ;;
    --full)    TRUNCATE=0; shift ;;
    -h|--help) usage ;;
    --)        shift; break ;;
    -*)        echo "Unknown option: $1" >&2; exit 1 ;;
    *)         break ;;
  esac
done

TARGET="${1:-}"
if [[ -z "$TARGET" ]]; then
  echo "Error: run ID or path required." >&2
  echo "Run '$(basename "$0") --help' for usage." >&2
  exit 1
fi

# Resolve to stream.jsonl path
if [[ -f "$TARGET" ]]; then
  STREAM="$TARGET"
elif [[ -f "$TARGET/stream.jsonl" ]]; then
  STREAM="$TARGET/stream.jsonl"
else
  # Try as run ID under .agents/runs/
  SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
  GHQ_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
  STREAM="$GHQ_ROOT/.agents/runs/$TARGET/stream.jsonl"
  if [[ ! -f "$STREAM" ]]; then
    echo "Error: cannot find stream.jsonl for '$TARGET'" >&2
    exit 1
  fi
fi

python3 -c "
import sys, json

filter_mode = '${FILTER}'
truncate = ${TRUNCATE}

def trunc(s, n):
    if n > 0 and len(s) > n:
        return s[:n] + '...'
    return s

for line in open(sys.stdin.fileno()):
    line = line.strip()
    if not line:
        continue
    try:
        obj = json.loads(line)
    except json.JSONDecodeError:
        continue

    t = obj.get('type', '')

    if t == 'system' and obj.get('subtype') == 'init':
        if filter_mode not in ('errors', 'tools'):
            model = obj.get('model', '?')
            print(f'[INIT] model={model}')

    elif t == 'assistant':
        msg = obj.get('message', {})
        for block in msg.get('content', []):
            btype = block.get('type', '')
            if btype == 'text':
                if filter_mode not in ('tools', 'errors'):
                    txt = block['text']
                    print(f'[ASSISTANT] {trunc(txt, truncate)}')
            elif btype == 'tool_use':
                if filter_mode != 'errors':
                    name = block.get('name', '?')
                    inp = json.dumps(block.get('input', {}), ensure_ascii=False)
                    print(f'[TOOL] {name}  {trunc(inp, truncate)}')

    elif t == 'user':
        msg = obj.get('message', {})
        for block in msg.get('content', []):
            if isinstance(block, dict) and block.get('type') == 'tool_result':
                content = block.get('content', '')
                is_error = block.get('is_error', False)
                # Also check tool_use_result for stderr
                tur = obj.get('tool_use_result', {})
                stderr = tur.get('stderr', '') if isinstance(tur, dict) else ''

                if filter_mode == 'errors':
                    if is_error or stderr:
                        print(f'[ERROR] {trunc(str(content), truncate)}')
                        if stderr:
                            print(f'[STDERR] {trunc(stderr, truncate)}')
                elif filter_mode != 'tools':
                    if is_error:
                        print(f'[ERROR] {trunc(str(content), truncate)}')
                    elif stderr:
                        print(f'[STDERR] {trunc(stderr, truncate)}')

    elif t == 'result':
        if filter_mode not in ('errors', 'tools'):
            for block in obj.get('content', []):
                if isinstance(block, dict) and block.get('type') == 'text':
                    print(f'[RESULT] {trunc(block[\"text\"], truncate)}')
" < "$STREAM"
