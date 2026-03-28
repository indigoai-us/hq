---
description: Interactive setup wizard for HQ Starter Kit
allowed-tools: Read, Write, Edit, AskUserQuestion, Glob, Bash
visibility: public
---

# HQ Setup Wizard

Quick setup to get your HQ running. Takes ~5 minutes.

## Phase 0: Bootstrap

Run the setup script to install dependencies, configure hooks, and optionally set up Indigo MCP:

```bash
./setup.sh
```

This handles: node/npm/jq checks, qmd installation, script permissions, directory structure, Indigo MCP setup, and knowledge indexing.

If setup.sh has already been run (qmd installed, hooks executable), skip to Phase 1.

## Phase 1: Identity

Ask these 3 questions. One at a time.

1. **What's your name?**
2. **What do you do?** (1-2 sentences — your roles, work, domain)
3. **What are your goals for using HQ?** (what do you want AI workers to help with?)

Use "personal" as the company/context name.

## Phase 2: Generate Files

### Repos directory (required)

All repos — code, knowledge, company projects — live under `repos/`. This is the single canonical location for every cloned or created repository in HQ.

```bash
mkdir -p repos/public repos/private
```

### Company structure
```bash
mkdir -p companies/personal/settings companies/personal/data companies/personal/knowledge
```

### Knowledge repos

HQ knowledge bases are independent git repos symlinked into `knowledge/`. This keeps each knowledge base versioned separately and shareable.

For each knowledge base the user wants to create:

1. Create the repo directory:
```bash
mkdir -p repos/public/knowledge-{name}
cd repos/public/knowledge-{name}
git init
echo "# {Name} Knowledge Base" > README.md
git add . && git commit -m "init knowledge repo"
cd -
```

2. Symlink into HQ:
```bash
ln -s ../../repos/public/knowledge-{name} knowledge/{name}
```

**At minimum, create one knowledge repo for the user's personal/company context:**
```bash
# Personal knowledge repo
mkdir -p repos/private/knowledge-personal
cd repos/private/knowledge-personal
git init
echo "# Personal Knowledge Base" > README.md
git add . && git commit -m "init knowledge repo"
cd -

# Symlink into company knowledge
ln -s ../../../repos/private/knowledge-personal companies/personal/knowledge/personal
```

**The starter kit's bundled knowledge (Ralph, workers, ai-security-framework, etc.) ships as plain directories. Explain to the user:**
```
Bundled knowledge (Ralph, workers, security framework) ships as plain directories.
To version them independently, you can convert any to a repo later:

  1. Move: mv knowledge/Ralph repos/public/knowledge-ralph
  2. Init: cd repos/public/knowledge-ralph && git init && git add . && git commit -m "init"
  3. Symlink: ln -s ../../repos/public/knowledge-ralph knowledge/Ralph
  4. Add to .gitignore: knowledge/Ralph

This is optional — plain directories work fine for read-only knowledge.
```

### Profile files

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

Add to `.gitignore` if not already present:
```
# Knowledge repo contents (tracked by their own git)
knowledge/*/
!knowledge/Ralph/
!knowledge/workers/
!knowledge/ai-security-framework/
!knowledge/dev-team/
!knowledge/design-styles/
!knowledge/hq-core/
!knowledge/loom/
!knowledge/projects/
```

### Index
```bash
qmd update 2>/dev/null || qmd index . 2>/dev/null || true
```

## Phase 3: Summary

```
HQ Setup Complete!

Created:
- repos/public/, repos/private/ (ALL repos — code, knowledge, projects)
- companies/personal/ (settings, data, knowledge)
- companies/personal/knowledge/profile.md
- companies/personal/knowledge/voice-style.md
- agents.md
- Knowledge repo: repos/private/knowledge-personal/ → companies/personal/knowledge/personal

Dependencies:
✓ claude (Claude Code CLI)
✓ qmd (semantic search) — or skipped
✓ gh (GitHub CLI) — or skipped

Next steps:
1. Run /personal-interview — deep interview to build your voice + profile
2. Run /newworker — create your first worker
3. Run /prd — plan your first project
4. Run /search <topic> — find relevant knowledge in HQ
```

## Rules

- Run setup.sh first if dependencies aren't installed
- Ask questions one at a time
- Use defaults when user says "skip"
- Never overwrite existing files without asking
- Create parent directories as needed
- For CLI tools (gh, vercel): inform but don't block setup if missing
- Always use relative paths for symlinks (../../repos/... not absolute paths)
