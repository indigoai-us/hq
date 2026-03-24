---
title: "Reviewer Agent Self-Identification Gap: Why reviewer_id Is Always 'manual'"
category: hq-architecture-patterns
tags: ["agent-loop", "agent-orchestration", "production-patterns", "agent-tooling", "coordination"]
source: "https://code.claude.com/docs/en/env-vars, https://code.claude.com/docs/en/headless, https://github.com/anthropics/claude-code/issues/17188, https://github.com/anthropics/claude-code/issues/25642"
confidence: 0.85
created_at: "2026-03-25T00:00:00Z"
updated_at: "2026-03-25T00:00:00Z"
---

Reviewer agents always write `reviewer_id: "manual"` because their own run ID is never injected into the prompt template.

## The Problem

The `bd-retrospective` template instructs the reviewer to write `reviewed.json` with a `reviewer_id` field set to "this agent's run ID if available, otherwise 'manual'". However, the agent has no mechanism to discover its own run ID:

1. **`ask-claude.sh` generates the run ID** (line 123: `AGENT_ID="$(date +%Y%m%d_%H%M%S)_$(LC_ALL=C tr -dc 'a-z0-9' ...)"`) but only passes `{{AGENT_RUN_ID}}` (the *target* run being reviewed) and `{{WORK_DIR}}`/`{{COMPANY_DIR}}` as template variables.
2. **No `{{SELF_RUN_ID}}` variable exists** — the agent's own ID is never substituted into the system prompt.
3. **Claude Code does not expose `CLAUDE_SESSION_ID`** as an environment variable (as of March 2026). There are open feature requests ([#17188](https://github.com/anthropics/claude-code/issues/17188), [#25642](https://github.com/anthropics/claude-code/issues/25642)) but no implementation yet.
4. **The ironic pattern**: Reviewer agents correctly identify this same bug in *other* agents' `reviewed.json` files, then repeat the exact same mistake themselves — because the fix requires infrastructure changes, not just prompt awareness.

## Root Cause

The gap is in `ask-claude.sh`, not in the template. The script creates `AGENT_ID` and writes it to `meta.json`, but never:
- Adds a `{{SELF_RUN_ID}}` template variable substitution
- Exports it as an environment variable the agent could read via Bash
- Passes it through `CLAUDE_ENV_FILE` or any other channel

## Fix

Two changes are needed:

### 1. Add `{{SELF_RUN_ID}}` substitution in `ask-claude.sh`

After the existing template variable replacements (around line 116), add:

```bash
SYSTEM_PROMPT="${SYSTEM_PROMPT//\{\{SELF_RUN_ID\}\}/$AGENT_ID}"
```

### 2. Update `bd-retrospective.md` template

Change the `reviewed.json` block from:

```json
"reviewer_id": "<this agent's run ID if available, otherwise 'manual'>"
```

To:

```json
"reviewer_id": "{{SELF_RUN_ID}}"
```

This makes the reviewer ID a concrete value baked into the prompt at spawn time, removing any ambiguity.

## Alternative: Environment Variable Approach

Instead of template substitution, `ask-claude.sh` could export the agent ID:

```bash
export CLAUDE_AGENT_SELF_ID="$AGENT_ID"
```

The agent could then read it via `echo $CLAUDE_AGENT_SELF_ID` in a Bash tool call. However, template substitution is simpler and doesn't require the agent to take an extra action.

## Why This Keeps Recurring

The pattern is self-reinforcing: reviewers see `"manual"` in other agents' `reviewed.json`, flag it as a bug, but then write `"manual"` themselves because they face the same missing infrastructure. Without the `{{SELF_RUN_ID}}` plumbing, no amount of prompt improvement can fix the behavior — the agent literally cannot access the information.
