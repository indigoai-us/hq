---
title: "QMD Embedded-Skills System and skill install Command"
category: qmd-architecture
tags: ["qmd", "skills", "cli", "claude-code", "skill-creation"]
source: "https://github.com/tobi/qmd/blob/main/src/embedded-skills.ts, https://github.com/tobi/qmd/tree/main/skills, https://github.com/tobi/qmd/blob/main/CHANGELOG.md, https://newreleases.io/project/github/tobi/qmd/release/v2.0.1"
confidence: 0.85
created_at: "2026-03-20T05:00:00Z"
updated_at: "2026-03-20T05:00:00Z"
---

QMD ships skills as base64-encoded blobs inside the binary, installable via `qmd skill install` into `~/.claude/commands/`.

## Embedded-Skills Architecture (`src/embedded-skills.ts`)

`embedded-skills.ts` stores packaged skill documentation as base64-encoded strings baked directly into the QMD binary. Two functions expose them:

| Function | Returns |
|----------|---------|
| `getEmbeddedQmdSkillFiles()` | Array of `{path, content}` objects — decoded skill files |
| `getEmbeddedQmdSkillContent()` | Decoded content of the primary `SKILL.md` only |

This design means no external files are needed — the skill travels with the npm package.

## Packaged Skills (`skills/` directory)

Two skills ship with QMD:

### `skills/qmd/` — Search Skill
The primary skill. Contains:
- **`SKILL.md`** — Describes QMD's three query modes, auto-expand, intent disambiguation, reranking, CLI/HTTP/MCP interfaces
- **`references/mcp-setup.md`** — Setup guide for MCP server integration with Claude Code, Claude Desktop, and OpenClaw

### `skills/release/` — Release Automation Skill
Introduced in v1.0.5. Provides a `/release` command that manages the full release lifecycle including changelog validation.

## `qmd skill install` Command

Introduced in **v2.0.1**. Copies the embedded skill files into `~/.claude/commands/` for one-command Claude integration.

Underlying CLI functions in `src/cli/qmd.ts`:

| Function | Role |
|----------|------|
| `installSkill()` | Orchestrates the install (entry point) |
| `writeEmbeddedSkill()` | Decodes and writes skill files to target directory |
| `ensureClaudeSymlink()` | Creates symlink for Claude desktop integration |
| `shouldCreateClaudeSymlink()` | Checks whether symlink setup is needed |

## Install Flow

```
qmd skill install
  → writeEmbeddedSkill()  →  ~/.claude/commands/qmd/SKILL.md
                          →  ~/.claude/commands/qmd/references/mcp-setup.md
  → ensureClaudeSymlink() →  optional symlink for Claude desktop
```

After install, Claude agents can invoke `qmd` search commands directly via the skill instructions.

## Why Embedded?

Embedding skills as base64 inside the binary avoids requiring users to clone the repo or manage separate skill files. The skill is versioned with the binary — `npm install -g @tobilu/qmd` is sufficient for full setup.
