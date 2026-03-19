---
title: "Claude Code Skills System"
category: ai-agents
tags: ["skills", "slash-commands", "extensibility", "skill-md"]
source: "web research"
confidence: 0.95
created_at: 2026-03-19T01:00:00Z
updated_at: 2026-03-19T02:12:00Z
---

Skills extend Claude Code's capabilities via SKILL.md files with YAML frontmatter and markdown instructions.

## SKILL.md Format

Every skill is a directory containing a `SKILL.md` file:

```
my-skill/
├── SKILL.md           # Main instructions (required)
├── template.md        # Template for Claude to fill in
├── examples/
│   └── sample.md      # Example output
└── scripts/
    └── helper.py      # Executable script
```

### Frontmatter Fields

```yaml
---
name: skill-name                    # Display name, becomes /slash-command
description: What it does           # Helps Claude decide when to auto-load
argument-hint: "[issue-number]"     # Shown during autocomplete
disable-model-invocation: true      # User-only invocation (default: false)
user-invocable: false               # Hide from / menu (default: true)
allowed-tools: Read, Grep, Glob     # Tools allowed without approval
model: opus                         # Model override
context: fork                       # Run in forked subagent context
agent: Explore                      # Subagent type when context: fork
---
```

All fields are optional. Only `description` is recommended.

## Skill Locations

| Level      | Path                                     | Scope                  |
|------------|------------------------------------------|------------------------|
| Enterprise | Managed settings                         | All org users          |
| Personal   | `~/.claude/skills/<name>/SKILL.md`       | All your projects      |
| Project    | `.claude/skills/<name>/SKILL.md`         | This project only      |
| Plugin     | `<plugin>/skills/<name>/SKILL.md`        | Where plugin enabled   |

Priority: enterprise > personal > project. Plugin skills use `plugin-name:skill-name` namespace.

## Invocation

- **User**: Type `/skill-name` or `/skill-name args`
- **Claude (auto)**: Loads when conversation matches the skill's description
- **Both**: Default behavior — either can invoke

### Invocation Control

| Frontmatter                      | User | Claude | Context loading                |
|----------------------------------|------|--------|-------------------------------|
| (default)                        | Yes  | Yes    | Description always loaded     |
| `disable-model-invocation: true` | Yes  | No     | Not in Claude's context       |
| `user-invocable: false`          | No   | Yes    | Description always loaded     |

## String Substitutions

| Variable              | Description                              |
|-----------------------|------------------------------------------|
| `$ARGUMENTS`          | All arguments passed to the skill        |
| `$ARGUMENTS[N]`/`$N`  | Specific argument by 0-based index       |
| `${CLAUDE_SESSION_ID}` | Current session ID                       |
| `${CLAUDE_SKILL_DIR}`  | Directory containing the SKILL.md file   |

## Dynamic Context Injection

The `` !`command` `` syntax runs shell commands before the skill content is sent to Claude. Output replaces the placeholder:

```yaml
## PR context
- PR diff: !`gh pr diff`
- Changed files: !`gh pr diff --name-only`
```

## Subagent Execution

Set `context: fork` to run in an isolated subagent. The skill content becomes the prompt. The `agent` field picks the execution environment (`Explore`, `Plan`, `general-purpose`, or custom).

**Limitation**: The Task/Agent tool is NOT available in forked contexts. Forked skills cannot delegate to other subagents. For hierarchical delegation, the parent skill must run in the main context (no `context: fork`).

## Tool Restrictions

The `allowed-tools` field limits which tools Claude can use during skill execution. When omitted, the skill inherits all tool capabilities from the parent agent. Common pattern: restrict to read-only tools (`Read, Grep, Glob`) for research skills.

## Legacy Commands Compatibility

Files in `.claude/commands/` still work. If a skill and command share the same name, the skill takes precedence. Skills are the recommended format.

## Sources

- [Extend Claude with skills — Claude Code Docs](https://code.claude.com/docs/en/skills)
- [anthropics/skills — GitHub](https://github.com/anthropics/skills)
- [Claude Code Customization Guide](https://alexop.dev/posts/claude-code-customization-guide-claudemd-skills-subagents/)
- [Skills Explained — Claude Blog](https://claude.com/blog/skills-explained)
