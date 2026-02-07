---
description: Interactive setup wizard for HQ Starter Kit
allowed-tools: Read, Write, Edit, AskUserQuestion, Glob, Bash
visibility: public
---

# HQ Setup Wizard

Quick setup to get your HQ running. Takes ~2 minutes.

## Phase 0: Dependencies

Check silently. Only prompt if missing.

**qmd** (search):
```bash
which qmd
```
If missing:
```
qmd not found. HQ uses qmd for semantic search.

Install: cargo install qmd
  OR: brew install tobi/tap/qmd

After install, index HQ: qmd index .
```

**Claude Code CLI**:
```bash
which claude
```
If missing:
```
Claude Code CLI not found. Required to run HQ.

Install: npm install -g @anthropic-ai/claude-code
```

Post-install: run `qmd index .` if qmd was just installed or no index exists.

## Phase 1: Identity

Ask these 3 questions. One at a time.

1. **What's your name?**
2. **What do you do?** (1-2 sentences — your roles, work, domain)
3. **What are your goals for using HQ?** (what do you want AI workers to help with?)

Use "personal" as the company/context name.

## Phase 2: Generate Files

Create the company structure:
```bash
mkdir -p companies/personal/settings companies/personal/data companies/personal/knowledge
```

**companies/personal/knowledge/profile.md:**
```markdown
# {Name}'s Profile

## About
{Answer from Q2}

## Goals
{Answer from Q3}

## Preferences
- Communication style: [to be filled by /personal-interview]
- Autonomy level: [to be filled by /personal-interview]
```

**companies/personal/knowledge/voice-style.md:**
```markdown
# {Name}'s Voice Style

Run `/personal-interview` to populate this file with your authentic voice and communication style.
```

**agents.md** (root level):
```markdown
# {Name}

{Answer from Q2}

## Goals
{Answer from Q3}
```

Index HQ:
```bash
qmd update 2>/dev/null || qmd index . 2>/dev/null || true
```

## Phase 3: Summary

```
HQ Setup Complete!

Created:
- companies/personal/knowledge/profile.md
- companies/personal/knowledge/voice-style.md
- agents.md

Next steps:
1. Run /personal-interview — deep interview to build your voice + profile
2. Run /newworker — create your first worker
3. Run /prd — plan your first project
4. Run /search <topic> — find relevant knowledge in HQ
```

## Rules

- Ask questions one at a time
- Use defaults when user says "skip"
- Never overwrite existing files without asking
- Create parent directories as needed
