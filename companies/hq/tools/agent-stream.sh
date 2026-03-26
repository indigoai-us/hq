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
  --tree            Show agent and all subagents in a recursive tree
  --full            Show full output (don't truncate)
  -h, --help        Show this help

Examples:
  $(basename "$0") 20260324_173522_ihao
  $(basename "$0") --errors 20260324_173522_ihao
  $(basename "$0") --tree 20260324_173522_ihao
  $(basename "$0") .agents/runs/20260324_173522_ihao/stream.jsonl
EOF
  exit 0
}

FILTER=""
TRUNCATE=200
TREE=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --errors)  FILTER="errors"; shift ;;
    --tools)   FILTER="tools"; shift ;;
    --tree)    TREE=true; shift ;;
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

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
HQ_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

# ── Tree mode ────────────────────────────────────────────────────────────────
if [[ "$TREE" == true ]]; then
  RUNS_DIR="$HQ_ROOT/.agents/runs"

  # Resolve root run ID from TARGET
  if [[ -f "$TARGET" ]]; then
    ROOT_ID="$(basename "$(dirname "$TARGET")")"
  elif [[ -d "$TARGET" ]]; then
    ROOT_ID="$(basename "$TARGET")"
  else
    ROOT_ID="$TARGET"
  fi

  if [[ ! -d "$RUNS_DIR/$ROOT_ID" ]]; then
    echo "Error: run directory not found: $RUNS_DIR/$ROOT_ID" >&2
    exit 1
  fi

  python3 -c "
import json, os, sys
from pathlib import Path

runs_dir = Path('$RUNS_DIR')
root_id = '$ROOT_ID'

# Build parent->children map
children = {}  # parent_id -> [child_id, ...]
nodes = {}     # id -> meta dict

for run_dir in sorted(runs_dir.iterdir()):
    meta_file = run_dir / 'meta.json'
    if not meta_file.exists():
        continue
    try:
        meta = json.loads(meta_file.read_text())
    except (json.JSONDecodeError, OSError):
        continue
    rid = meta.get('id', run_dir.name)
    nodes[rid] = meta
    parent = meta.get('parent_id', '')
    if parent:
        children.setdefault(parent, []).append(rid)

def status_icon(rid):
    status_file = runs_dir / rid / 'status'
    try:
        st = status_file.read_text().strip()
    except OSError:
        st = '?'
    icons = {'done': '✓', 'running': '►', 'error': '✗'}
    return icons.get(st, '?')

def prompt_summary(rid, max_len=60):
    prompt_file = runs_dir / rid / 'prompt.txt'
    try:
        txt = prompt_file.read_text().strip().replace('\n', ' ')
    except OSError:
        return ''
    if len(txt) > max_len:
        txt = txt[:max_len] + '...'
    return txt

def print_tree(rid, prefix='', is_last=True):
    icon = status_icon(rid)
    meta = nodes.get(rid, {})
    model = meta.get('model', '?')
    template = meta.get('template', '')
    prompt = prompt_summary(rid)
    connector = '└── ' if prefix else ''
    if prefix:
        connector = '└── ' if is_last else '├── '
    label = f'{icon} {rid}  ({model})'
    if template:
        label += f'  [{template}]'
    if prompt:
        label += f'  \"{prompt}\"'
    print(f'{prefix}{connector}{label}')

    kids = children.get(rid, [])
    for i, kid in enumerate(kids):
        if prefix:
            child_prefix = prefix + ('    ' if is_last else '│   ')
        else:
            child_prefix = '    '
        print_tree(kid, child_prefix, i == len(kids) - 1)

if root_id not in nodes:
    print(f'Error: run {root_id} not found in {runs_dir}', file=sys.stderr)
    sys.exit(1)

print_tree(root_id)

total = 0
def count(rid):
    global total
    total += 1
    for kid in children.get(rid, []):
        count(kid)
count(root_id)
if total > 1:
    print(f'\n({total} agents total)')
"
  exit 0
fi

# ── Resolve stream.jsonl path ────────────────────────────────────────────────
if [[ -f "$TARGET" ]]; then
  STREAM="$TARGET"
elif [[ -f "$TARGET/stream.jsonl" ]]; then
  STREAM="$TARGET/stream.jsonl"
else
  STREAM="$HQ_ROOT/.agents/runs/$TARGET/stream.jsonl"
  if [[ ! -f "$STREAM" ]]; then
    echo "Error: cannot find stream.jsonl for '$TARGET'" >&2
    exit 1
  fi
fi

# ── Stream mode ──────────────────────────────────────────────────────────────
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
