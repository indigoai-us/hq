---
description: Interactive setup wizard
allowed-tools: Read, Write, Bash, AskUserQuestion, Glob
visibility: public
---

# /setup — Interactive Setup Wizard

Check prerequisites, create or update your profile, and ensure your HQ is ready.

## Phase 1: Prerequisites

Run a single Bash command to check which tools are available:

```bash
echo "=== Prerequisites ===" && \
for cmd in node npm gh qmd ggshield jq yq claude; do \
  if command -v "$cmd" >/dev/null 2>&1; then \
    printf "  ✓ %s (%s)\n" "$cmd" "$($cmd --version 2>/dev/null | head -1)"; \
  else \
    printf "  ✗ %s (not found)\n" "$cmd"; \
  fi \
done
```

Display the results. For any missing required tools (node, npm, jq), show install hints. Don't block — continue regardless.

## Phase 2: Profile

Check if `agents.md` exists at the HQ root.

**If it exists:** Read it, show the current profile summary, and ask the user if they want to update it. If they decline, skip to Phase 3.

**If it doesn't exist (or user wants to update):** Ask 3 questions via AskUserQuestion, one at a time:

1. "What's your name?"
2. "What do you do? (role, industry)"
3. "What are your main goals for HQ?"

Write `agents.md` with:

```markdown
# {Name}'s Profile

## About
{Name} — {role}

## Goals
{goals}

## Setup
- Created: {YYYY-MM-DD}
- Run `/personal-interview` for a deeper profile with voice and communication style.
```

If running non-interactively and no user response is received, use defaults ("HQ User") and continue.

## Phase 3: Knowledge Repo

Check if `repos/public/knowledge-personal` exists.

If not, scaffold it:

```bash
mkdir -p repos/public/knowledge-personal
cd repos/public/knowledge-personal
git init
echo "# Personal Knowledge\n\nYour personal knowledge base." > README.md
git add -A && git commit -m "init: personal knowledge repo"
```

Then create the symlink:

```bash
ln -sf ../../repos/public/knowledge-personal knowledge/personal
```

Run `qmd update 2>/dev/null || true` to reindex.

If it already exists, report that and skip.

## Phase 4: Summary

Display what was done and suggest next steps:

```
✓ Prerequisites checked
✓ Profile created/updated (agents.md)
✓ Knowledge repo ready (knowledge/personal)

Next steps:
  /personal-interview  ← deep profile with voice + communication style
  /newcompany          ← scaffold a company workspace
  /startwork           ← begin your first work session
```
