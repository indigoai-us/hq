---
title: "Ralph Loops in Claude Code"
category: ai-agents
tags: ["agent-loop", "claude-code", "hooks", "stop-hook", "autonomous-coding"]
source: web research
confidence: 0.8
created_at: 2026-03-19T19:30:00Z
updated_at: 2026-03-19T19:30:00Z
---

How Ralph loops integrate with Claude Code via hooks, plugins, and CLAUDE.md patterns.

## Native Plugin Support

Claude Code ships with an official Ralph Wiggum plugin at `plugins/ralph-wiggum/`. It implements the loop via a **Stop hook** that intercepts session exit attempts.

### How the Stop Hook Works

```
1. Claude receives the task prompt
2. Claude works on the task
3. Claude tries to exit (session end)
4. Stop hook intercepts the exit
5. Hook checks for completion promise in output
6. If no promise found → feed same prompt back, restart
7. If promise found → allow exit, loop ends
```

The stop hook is the key mechanism — it turns Claude Code's normal session lifecycle into a persistent loop. Claude doesn't know it's in a loop; it just keeps getting the same task.

## Configuration

### Plugin Setup

The plugin uses `.claude/ralph-loop.local.md` for storing loop state with YAML frontmatter for structured config and a markdown body containing the prompt.

### Stop Hook Configuration (settings.json)

```json
{
  "hooks": {
    "Stop": [
      {
        "type": "command",
        "command": ".claude/hooks/ralph-stop.sh"
      }
    ]
  }
}
```

### Minimal Stop Hook Script

```bash
#!/bin/bash
# .claude/hooks/ralph-stop.sh

PROMISE="COMPLETE"
MAX_ITERATIONS=20
ITERATION_FILE=".claude/ralph-iteration-count"

# Read current iteration
CURRENT=$(cat "$ITERATION_FILE" 2>/dev/null || echo 0)
CURRENT=$((CURRENT + 1))
echo "$CURRENT" > "$ITERATION_FILE"

# Safety: max iterations
if [ "$CURRENT" -ge "$MAX_ITERATIONS" ]; then
  exit 0  # Allow exit
fi

# Check for completion promise in last output
if echo "$CLAUDE_OUTPUT" | grep -q "$PROMISE"; then
  rm "$ITERATION_FILE"  # Clean up
  exit 0  # Allow exit
fi

# Not done — block exit, feed prompt back
exit 2  # Exit code 2 = block exit and re-prompt
```

### Completion Promise

The `--completion-promise` flag uses **exact string matching**. Best practices:

- Use a simple, unambiguous token: `COMPLETE`, `DONE`, `ALL_TESTS_PASSING`
- Wrap in XML for clarity: `<promise>COMPLETE</promise>`
- Don't use multiple tokens — the matcher checks for one string
- Always pair with `--max-iterations` as a safety net

## CLAUDE.md Patterns for Ralph Loops

The CLAUDE.md file shapes agent behavior during loop iterations:

### Recommended CLAUDE.md Structure

```markdown
# Project Context
<brief description>

## Ralph Loop Instructions
- Read `prd.md` for the current task specification
- Read `progress.md` for what's been done and learnings
- Find the next unchecked item and implement it
- Update progress.md with what you did and any learnings
- Commit your work with a descriptive message
- When ALL items are checked, output: <promise>COMPLETE</promise>

## Rules
- One story per iteration — don't try to do everything at once
- Run tests before marking anything complete
- If stuck on an item for the whole iteration, document why in progress.md
```

### State Management via Files

Since each iteration gets fresh context, all state must live in files:

| File | Purpose |
|------|---------|
| `prd.md` | Task specification (read-only) |
| `progress.md` | Running log of completions + learnings |
| `.claude/ralph-iteration-count` | Iteration counter |
| Git history | Full audit trail of changes |

## Advanced Patterns

### Dual-Agent Review via Hooks

Use a PreToolUse or PostToolUse hook to inject a review step:

```bash
# After each commit, run a review agent
if [ "$TOOL_NAME" = "git_commit" ]; then
  claude --print "Review the last commit for bugs" > /tmp/review.md
  # Feed review back into next iteration via progress.md
fi
```

### Multi-Agent Ralph Loop

The `alfredolopez80/multi-agent-ralph-loop` project extends this with:
- Memory-driven planning across iterations
- Multi-agent coordination (planner + workers)
- Agent Teams integration for parallel work
- Automatic learning extraction

### Session Continuity

The `frankbria/ralph-claude-code` fork adds intelligent exit detection:
- Dual-condition checks requiring BOTH completion indicators AND explicit `EXIT_SIGNAL`
- Automatic session management preserving file modifications and git history
- Context window monitoring to prevent mid-work truncation

## Practical Tips

1. **Start with the official plugin** — don't reinvent the stop hook
2. **Keep CLAUDE.md focused** — the agent reads it every iteration; don't overload it
3. **Max iterations = your budget ceiling** — always set this
4. **Git is your undo button** — if a loop goes sideways, `git reset` to before it started
5. **Review the diff, not the process** — you care about the output, not how many iterations it took
6. **Run overnight for big tasks** — set max_iterations high, review in the morning

## Sources

- [Claude Code Plugins — ralph-wiggum](https://github.com/anthropics/claude-code/tree/main/plugins/ralph-wiggum)
- [Awesome Claude — Ralph Wiggum Technique](https://awesomeclaude.ai/ralph-wiggum)
- [ClaudeFast — Run Autonomously Overnight](https://claudefa.st/blog/guide/mechanics/ralph-wiggum-technique)
- [ClaudeFast — Stop Hook Task Enforcement](https://claudefa.st/blog/tools/hooks/stop-hook-task-enforcement)
- [Paddo.dev — Ralph Wiggum: Autonomous Loops for Claude Code](https://paddo.dev/blog/ralph-wiggum-autonomous-loops/)
- [Apidog — How to Keep Claude Code Continuously Running](https://apidog.com/blog/claude-code-continuously-running/)
- [GitHub — frankbria/ralph-claude-code](https://github.com/frankbria/ralph-claude-code)
- [GitHub — alfredolopez80/multi-agent-ralph-loop](https://github.com/alfredolopez80/multi-agent-ralph-loop)
