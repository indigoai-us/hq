---
title: "Claude Code Hooks"
category: ai-agents
tags: ["claude-code", "hooks", "automation", "lifecycle", "configuration"]
source: "https://code.claude.com/docs/en/hooks"
confidence: 0.95
created_at: 2026-03-19T12:00:00Z
updated_at: 2026-03-19T12:00:00Z
---

Shell commands, HTTP endpoints, or LLM prompts that run at specific lifecycle points in Claude Code.

## Overview

Hooks intercept Claude Code's lifecycle events to validate, enrich, or block actions. They are configured in settings JSON files and support four execution types: command, http, prompt, and agent.

## Configuration Locations

| File | Scope |
|------|-------|
| `~/.claude/settings.json` | User-level (all projects) |
| `.claude/settings.json` | Project-level (shareable, checked in) |
| `.claude/settings.local.json` | Project-level (local only, gitignored) |
| Managed policy settings | Organization-wide (admin) |

## Hook Events (24 total)

| Event | When | Matcher | Blockable |
|-------|------|---------|-----------|
| `SessionStart` | New/resumed session | `startup`, `resume`, `clear`, `compact` | No |
| `SessionEnd` | Session terminates | `clear`, `logout`, `prompt_input_exit`, etc. | No |
| `UserPromptSubmit` | User submits prompt | None | Yes |
| `PreToolUse` | Before tool executes | Tool name regex | Yes |
| `PostToolUse` | Tool succeeds | Tool name regex | No |
| `PostToolUseFailure` | Tool fails | Tool name regex | No |
| `PermissionRequest` | Permission dialog | Tool name regex | Yes |
| `Notification` | Alert sent | `permission_prompt`, `idle_prompt`, etc. | No |
| `SubagentStart` | Subagent spawned | Agent type | No |
| `SubagentStop` | Subagent finishes | Agent type | Yes |
| `Stop` | Claude finishes responding | None | Yes |
| `TeammateIdle` | Teammate about to idle | None | Yes |
| `TaskCompleted` | Task marked complete | None | Yes |
| `InstructionsLoaded` | CLAUDE.md loaded | None | No |
| `ConfigChange` | Config file changes | Settings type | Yes |
| `WorktreeCreate` | Worktree created | None | Yes |
| `WorktreeRemove` | Worktree removed | None | No |
| `PreCompact` | Before compaction | `manual`, `auto` | No |
| `PostCompact` | After compaction | `manual`, `auto` | No |
| `Elicitation` | MCP requests user input | MCP server name | Yes |
| `ElicitationResult` | User responds to MCP | MCP server name | Yes |

## Hook Types

### Command (`type: "command"`)
Runs a shell script. Input via stdin (JSON), output via stdout.

```json
{
  "type": "command",
  "command": ".claude/hooks/validate.sh",
  "timeout": 600,
  "async": false
}
```

### HTTP (`type: "http"`)
POSTs JSON to an endpoint. Supports env var interpolation in headers.

```json
{
  "type": "http",
  "url": "http://localhost:8080/hooks/check",
  "headers": { "Authorization": "Bearer $TOKEN" },
  "allowedEnvVars": ["TOKEN"],
  "timeout": 30
}
```

### Prompt (`type: "prompt"`)
Sends input to an LLM for evaluation.

```json
{
  "type": "prompt",
  "prompt": "Is this command safe? $ARGUMENTS",
  "model": "claude-haiku",
  "timeout": 30
}
```

### Agent (`type: "agent"`)
Spawns a subagent with tool access (Read, Grep, Glob, etc.).

```json
{
  "type": "agent",
  "prompt": "Check if the build passes: $ARGUMENTS",
  "model": "claude-sonnet",
  "timeout": 60
}
```

## JSON Settings Structure

```json
{
  "hooks": {
    "EventName": [
      {
        "matcher": "regex_pattern",
        "hooks": [
          {
            "type": "command",
            "command": ".claude/hooks/script.sh",
            "timeout": 600,
            "statusMessage": "Running validation...",
            "once": false,
            "async": false
          }
        ]
      }
    ]
  }
}
```

## Exit Codes (Command Hooks)

| Exit | Meaning | Effect |
|------|---------|--------|
| 0 | Success | Parse JSON from stdout; action proceeds |
| 2 | Blocking error | Stderr fed back to Claude; action blocked |
| Other | Non-blocking error | Logged in verbose mode; continues |

## Hook Output (JSON on stdout)

```json
{
  "continue": true,
  "decision": "block|allow|deny",
  "reason": "explanation",
  "systemMessage": "Warning shown to user",
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow|deny|ask",
    "permissionDecisionReason": "why",
    "updatedInput": { "command": "modified value" },
    "additionalContext": "extra context for Claude"
  }
}
```

## Matcher Patterns

Matchers are regex patterns that filter when hooks fire:

- `"Bash"` — exact tool name
- `"Edit|Write"` — multiple tools
- `"mcp__memory__.*"` — all tools from an MCP server
- Omit matcher for events that don't support it

## Environment Variables

- `$CLAUDE_PROJECT_DIR` — project root (all hooks)
- `$CLAUDE_ENV_FILE` — file for persisting env vars (SessionStart only)
- `$CLAUDE_CODE_REMOTE` — "true" in web environments

## Key Behaviors

- All matching hooks run **in parallel**
- Identical hooks are **deduplicated** (by command string or URL)
- PreToolUse hooks can **modify tool inputs** via `updatedInput`
- Stop/SubagentStop hooks can **block completion** to force continued work
- UserPromptSubmit hooks can **inject context** via `additionalContext`
- `"async": true` runs hooks in the background without blocking
- SessionEnd hooks have a 1.5s default timeout (configurable via `CLAUDE_CODE_SESSIONEND_HOOKS_TIMEOUT_MS`)

## Useful Patterns

- **Auto-approve safe commands**: PermissionRequest + matcher for known-safe tools
- **Lint after edits**: PostToolUse + matcher for `Write|Edit`
- **Block destructive commands**: PreToolUse + Bash matcher + grep for `rm -rf`
- **Inject project context on prompt**: UserPromptSubmit + script that adds context
- **Background notifications**: PostToolUse + async command hook
