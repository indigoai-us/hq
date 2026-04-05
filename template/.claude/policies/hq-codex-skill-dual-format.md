---
id: hq-codex-skill-dual-format
title: Commands and Skills are separate formats — use dual-format for Codex visibility
scope: global
trigger: creating or modifying HQ commands that should be visible in Codex
enforcement: soft
version: 1
created: 2026-04-02
updated: 2026-04-03
source: success-pattern
---

## Rule

Commands (`.claude/commands/*.md`) and skills (`.claude/skills/*/SKILL.md`) are different formats with different discovery mechanisms. Codex discovers skills by scanning for `SKILL.md` files in named directories — it does NOT discover commands in `.claude/commands/`. When a command needs Codex visibility, create a separate `SKILL.md` in `.claude/skills/{name}/` (dual format) rather than converting the command. Keep `command.md` as the Claude Code source of truth.

Commands that depend on the Task tool (`run-project`, `execute-task`, `run`) require architectural adaptation for Codex — replace sub-agent spawning with inline execution. This trades context isolation for compatibility.

`/publish-kit` enforces dual-format coverage via **Step 4.5 (Codex Conversion)** — scans all synced skills for `agents/openai.yaml`, generates missing ones, and reports command-to-skill coverage gaps. This prevents drift where skills ship to the public template without Codex metadata.

## Rationale

Discovered during codex-command-discovery brainstorm/PRD session. The Codex skill bridge (`scripts/codex-skill-bridge.sh`) correctly symlinks `.claude/skills/` to `~/.codex/skills/hq`, making all 57 skills discoverable. But the 50 commands in `.claude/commands/` are invisible to Codex because they use Claude Code's flat-file format (frontmatter: `description`, `allowed-tools`, `argument-hint`) instead of the SKILL.md folder format (frontmatter: `name`, `description`) with optional `agents/openai.yaml` metadata.
