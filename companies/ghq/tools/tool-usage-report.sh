#!/usr/bin/env bash
# tool-usage-report.sh — Analyze tool call usage across .agents/runs
# Shows all tool calls sorted by frequency, with rejected/failed breakdowns
set -euo pipefail

RUNS_DIR=".agents/runs"
MODE="all"  # all | rejected | failed | commands

usage() {
  cat <<'EOF'
Usage: tool-usage-report.sh [OPTIONS]

Analyze tool calls across .agents/runs, sorted by usage frequency.

Options:
  --rejected    Show only rejected/permission-denied tool calls
  --failed      Show only failed (is_error=true) tool calls
  --commands    Show rejected Bash commands (extract the actual command)
  --causes      Group failures by root cause pattern (most actionable)
  --all         Show all tool calls (default)
  --runs-dir    Path to runs directory (default: .agents/runs)
  -h, --help    Show this help

Examples:
  tool-usage-report.sh                  # All tool calls by frequency
  tool-usage-report.sh --rejected       # Permission-denied calls
  tool-usage-report.sh --failed         # All error tool calls
  tool-usage-report.sh --commands       # Rejected bash commands
  tool-usage-report.sh --causes         # Root cause analysis
EOF
  exit 0
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --rejected) MODE="rejected"; shift ;;
    --failed)   MODE="failed"; shift ;;
    --commands) MODE="commands"; shift ;;
    --causes)   MODE="causes"; shift ;;
    --all)      MODE="all"; shift ;;
    --runs-dir) RUNS_DIR="$2"; shift 2 ;;
    -h|--help)  usage ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

if [[ ! -d "$RUNS_DIR" ]]; then
  echo "Error: runs directory not found: $RUNS_DIR" >&2
  exit 1
fi

python3 - "$RUNS_DIR" "$MODE" <<'PYTHON'
import json, sys, os
from collections import Counter, defaultdict
from pathlib import Path

runs_dir = sys.argv[1]
mode = sys.argv[2]

# Collect tool_use calls and tool_results across all runs
tool_uses = {}  # id -> {name, input, run_id}
tool_results = {}  # id -> {is_error, content}
all_calls = []  # (tool_name, input_dict, is_error, error_content, run_id)

for run_id in sorted(os.listdir(runs_dir)):
    stream = Path(runs_dir) / run_id / "stream.jsonl"
    if not stream.exists():
        continue

    # Per-run collection
    run_tool_uses = {}
    run_tool_results = {}

    with open(stream) as f:
        for line in f:
            try:
                obj = json.loads(line)
            except json.JSONDecodeError:
                continue

            if obj.get("type") == "assistant":
                for c in obj.get("message", {}).get("content", []):
                    if c.get("type") == "tool_use":
                        run_tool_uses[c["id"]] = {
                            "name": c["name"],
                            "input": c.get("input", {}),
                            "run_id": run_id,
                        }

            elif obj.get("type") == "user":
                content = obj.get("message", {}).get("content", [])
                if isinstance(content, list):
                    for c in content:
                        if c.get("type") == "tool_result":
                            tid = c.get("tool_use_id", "")
                            run_tool_results[tid] = {
                                "is_error": c.get("is_error", False),
                                "content": c.get("content", ""),
                            }

    # Merge into all_calls
    for tid, tu in run_tool_uses.items():
        tr = run_tool_results.get(tid, {"is_error": False, "content": ""})
        all_calls.append((
            tu["name"],
            tu["input"],
            tr["is_error"],
            tr["content"],
            tu["run_id"],
        ))


def is_rejected(content):
    """Check if error is a permission rejection."""
    if not isinstance(content, str):
        return False
    patterns = [
        "hasn't granted it yet",
        "haven't granted it yet",
        "not allowed",
        "permission",
        "obfuscation",
        "blocked",
    ]
    return any(p in content.lower() for p in patterns)


if mode == "all":
    # Count all tool calls by name
    counter = Counter(name for name, _, _, _, _ in all_calls)
    error_counter = Counter(name for name, _, is_err, _, _ in all_calls if is_err)
    reject_counter = Counter(name for name, _, is_err, content, _ in all_calls if is_err and is_rejected(content))

    print(f"{'Tool':<40} {'Total':>6} {'Errors':>7} {'Rejected':>9}")
    print("=" * 64)
    for name, count in counter.most_common():
        errors = error_counter.get(name, 0)
        rejects = reject_counter.get(name, 0)
        err_str = str(errors) if errors else "."
        rej_str = str(rejects) if rejects else "."
        print(f"{name:<40} {count:>6} {err_str:>7} {rej_str:>9}")

    print(f"\n{'TOTAL':<40} {sum(counter.values()):>6} {sum(error_counter.values()):>7} {sum(reject_counter.values()):>9}")
    print(f"Across {len(os.listdir(runs_dir))} runs")

elif mode == "rejected":
    # Show rejected tool calls with error messages
    rejected = [(name, inp, content, run_id)
                for name, inp, is_err, content, run_id in all_calls
                if is_err and is_rejected(content)]

    # Group by error message pattern
    by_message = defaultdict(list)
    for name, inp, content, run_id in rejected:
        # Normalize message
        msg = content[:120] if isinstance(content, str) else str(content)[:120]
        by_message[msg].append((name, inp, run_id))

    print(f"Rejected tool calls ({len(rejected)} total):\n")
    print(f"{'Error Pattern':<80} {'Count':>6}")
    print("=" * 88)
    for msg, calls in sorted(by_message.items(), key=lambda x: -len(x[1])):
        print(f"{msg:<80} {len(calls):>6}")
        # Show tool names involved
        tool_names = Counter(name for name, _, _ in calls)
        for tn, tc in tool_names.most_common(3):
            print(f"  └─ {tn} ({tc}x)")

elif mode == "failed":
    # Show all failed tool calls
    failed = [(name, inp, content, run_id)
              for name, inp, is_err, content, run_id in all_calls
              if is_err]

    # Group by tool name
    by_tool = defaultdict(list)
    for name, inp, content, run_id in failed:
        by_tool[name].append((content, run_id))

    print(f"Failed tool calls ({len(failed)} total):\n")
    for name, items in sorted(by_tool.items(), key=lambda x: -len(x[1])):
        print(f"{name} ({len(items)} failures)")
        # Show top error messages
        msg_counter = Counter()
        for content, _ in items:
            msg = content[:100] if isinstance(content, str) else str(content)[:100]
            msg_counter[msg] += 1
        for msg, count in msg_counter.most_common(5):
            print(f"  [{count}x] {msg}")
        print()

elif mode == "commands":
    # Show rejected Bash commands specifically
    rejected_cmds = []
    for name, inp, is_err, content, run_id in all_calls:
        if name == "Bash" and is_err and is_rejected(content):
            cmd = inp.get("command", "?")
            rejected_cmds.append((cmd, content, run_id))

    # Also check Write/Edit rejections for file paths
    rejected_writes = []
    for name, inp, is_err, content, run_id in all_calls:
        if name in ("Write", "Edit") and is_err and is_rejected(content):
            fpath = inp.get("file_path", "?")
            rejected_writes.append((name, fpath, content, run_id))

    print(f"Rejected Bash commands ({len(rejected_cmds)} total):\n")
    cmd_counter = Counter()
    for cmd, _, _ in rejected_cmds:
        # Normalize: extract the base command (first word/pipe segment)
        base = cmd.split("|")[0].strip().split("&&")[0].strip()
        # Get just the executable
        parts = base.split()
        exe = parts[0] if parts else cmd
        cmd_counter[exe] += 1

    print(f"{'Base Command':<40} {'Count':>6}")
    print("=" * 48)
    for exe, count in cmd_counter.most_common():
        print(f"{exe:<40} {count:>6}")

    if rejected_writes:
        print(f"\nRejected Write/Edit operations ({len(rejected_writes)} total):\n")
        path_counter = Counter()
        for name, fpath, _, _ in rejected_writes:
            path_counter[f"{name} -> {fpath}"] += 1
        for path, count in path_counter.most_common():
            print(f"  [{count}x] {path}")

elif mode == "causes":
    # Categorize all failures by root cause pattern
    causes = defaultdict(list)

    for name, inp, is_err, content, run_id in all_calls:
        if not is_err:
            continue
        err = content if isinstance(content, str) else str(content)
        cmd = inp.get("command", "") if name == "Bash" else ""
        fpath = inp.get("file_path", "") if name in ("Write", "Edit", "Read") else ""

        # Classify root cause
        if ".worktrees/" in err or ".worktrees/" in cmd or ".worktrees/" in fpath:
            cause = "WORKTREE_SANDBOX"
        elif "obfuscation" in err.lower() or "brace with quote" in err.lower() or "consecutive quote" in err.lower():
            cause = "FALSE_POSITIVE_OBFUSCATION"
        elif "requires approval" in err or "haven't granted it yet" in err or "hasn't granted it yet" in err:
            if ".worktrees/" in cmd or ".worktrees/" in fpath:
                cause = "WORKTREE_SANDBOX"
            elif name in ("Write", "Edit"):
                cause = "WRITE_PERMISSION"
            elif "bd " in cmd or cmd.startswith("bd "):
                cause = "BD_NOT_ALLOWED"
            elif "qmd " in cmd or "qmd-search" in cmd:
                cause = "QMD_NOT_ALLOWED"
            elif cmd.startswith("git ") or "git " in cmd:
                cause = "GIT_NOT_ALLOWED"
            else:
                cause = "BASH_NOT_ALLOWED"
        elif "was blocked" in err:
            if ".worktrees/" in err or ".worktrees/" in cmd:
                cause = "WORKTREE_SANDBOX"
            elif "/.claude/" in err:
                cause = "DOTCLAUDE_BLOCKED"
            else:
                cause = "PATH_BLOCKED"
        elif "multiple operations" in err or "compound" in err.lower():
            cause = "COMPOUND_CMD_BLOCKED"
        elif "Cancelled: parallel" in err:
            cause = "PARALLEL_CASCADE"
        elif "Exit code" in err:
            cause = "RUNTIME_ERROR"
        elif "exceeds maximum" in err.lower():
            cause = "FILE_TOO_LARGE"
        elif "does not exist" in err.lower():
            cause = "FILE_NOT_FOUND"
        else:
            cause = "OTHER"

        causes[cause].append((name, inp, err[:150], run_id))

    # Print summary
    total = sum(len(v) for v in causes.values())
    print(f"Root Cause Analysis ({total} failures across {len(os.listdir(runs_dir))} runs)\n")

    descriptions = {
        "WORKTREE_SANDBOX": "Agents can't read/write .worktrees/ paths",
        "FALSE_POSITIVE_OBFUSCATION": "Heredoc/brace/quote patterns flagged as obfuscation",
        "COMPOUND_CMD_BLOCKED": "Compound commands (&&, ||, |) require approval",
        "BD_NOT_ALLOWED": "bd (beads) command not in allowed list",
        "QMD_NOT_ALLOWED": "qmd command not in allowed list",
        "GIT_NOT_ALLOWED": "git command not in allowed list",
        "BASH_NOT_ALLOWED": "Generic Bash permission denied",
        "WRITE_PERMISSION": "Write/Edit tool permission denied",
        "DOTCLAUDE_BLOCKED": ".claude/ directory access blocked",
        "PATH_BLOCKED": "Path outside allowed directories",
        "PARALLEL_CASCADE": "Cancelled due to parallel sibling failing",
        "RUNTIME_ERROR": "Command ran but exited non-zero",
        "FILE_TOO_LARGE": "File exceeds token limit for Read",
        "FILE_NOT_FOUND": "File does not exist",
        "OTHER": "Uncategorized",
    }

    print(f"{'Cause':<32} {'Count':>6} {'%':>5}  Description")
    print("=" * 100)
    for cause, items in sorted(causes.items(), key=lambda x: -len(x[1])):
        pct = len(items) / total * 100
        desc = descriptions.get(cause, "")
        print(f"{cause:<32} {len(items):>6} {pct:>4.0f}%  {desc}")

    # Actionable recommendations
    print("\n--- ACTIONABLE RECOMMENDATIONS ---\n")

    if "WORKTREE_SANDBOX" in causes:
        n = len(causes["WORKTREE_SANDBOX"])
        print(f"1. WORKTREE_SANDBOX ({n}x): Add .worktrees/ to allowed paths in settings.local.json")
        print(f"   or create a worktree-file-ops.sh helper that agents can call\n")

    if "FALSE_POSITIVE_OBFUSCATION" in causes:
        n = len(causes["FALSE_POSITIVE_OBFUSCATION"])
        print(f"2. FALSE_POSITIVE_OBFUSCATION ({n}x): Use Write tool instead of heredocs.")
        print(f"   Agents should avoid: cat > file << 'EOF' and python3 -c with nested quotes\n")

    if "COMPOUND_CMD_BLOCKED" in causes:
        n = len(causes["COMPOUND_CMD_BLOCKED"])
        print(f"3. COMPOUND_CMD_BLOCKED ({n}x): Break compound commands into individual calls")
        print(f"   or add specific compound patterns to allowed list\n")

    if "BD_NOT_ALLOWED" in causes:
        n = len(causes["BD_NOT_ALLOWED"])
        print(f"4. BD_NOT_ALLOWED ({n}x): Add 'bd' to allowed Bash commands in settings")
        print(f"   Pattern: Bash(bd *)\n")

    if "QMD_NOT_ALLOWED" in causes:
        n = len(causes["QMD_NOT_ALLOWED"])
        print(f"5. QMD_NOT_ALLOWED ({n}x): Add 'qmd' and tool wrappers to allowed commands")
        print(f"   Pattern: Bash(qmd *), Bash(./companies/ghq/tools/qmd-search.sh *)\n")

    if "PARALLEL_CASCADE" in causes:
        n = len(causes["PARALLEL_CASCADE"])
        print(f"6. PARALLEL_CASCADE ({n}x): {n} wasted calls from parallel sibling failures")
        print(f"   Agents should avoid parallel Bash calls when permissions are uncertain\n")

    if "DOTCLAUDE_BLOCKED" in causes:
        n = len(causes["DOTCLAUDE_BLOCKED"])
        print(f"7. DOTCLAUDE_BLOCKED ({n}x): Use Read tool for .claude/ files, not cat/ls\n")

PYTHON
