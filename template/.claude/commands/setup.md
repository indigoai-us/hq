---
description: Interactive setup wizard for HQ Starter Kit
allowed-tools: Read, Write, Edit, AskUserQuestion, Glob, Bash
visibility: public
---

# HQ Setup Wizard

Quick setup to get your HQ running. Takes ~5 minutes.

## Phase 0: Welcome

Before checking anything, print this welcome block:

```
Welcome to HQ — your personal AI operating system.

HQ is a folder on your computer that becomes the infrastructure for your AI workforce.
You have access to 1,000 employees willing to work. HQ is the office, the org chart,
and the job descriptions that put them to work.

This setup takes ~5 minutes. After that, you'll have:
  - A configured HQ tailored to your role
  - Educational materials to guide your first week
  - A clear path from "just installed" to "shipping projects autonomously"

Let's get started.
```

## Phase 1: Dependencies

Check silently. Only prompt if missing.

**Claude Code CLI**:
```bash
which claude
```
If missing:
```
Claude Code CLI not found. Required to run HQ.

Install: npm install -g @anthropic-ai/claude-code
```

**qmd** (search):
```bash
which qmd
```
If missing:
```
qmd not found. HQ uses qmd for semantic search across knowledge, workers, and code.

Install: cargo install qmd
  OR: brew install tobi/tap/qmd

After install, index HQ: qmd index .
```

**GitHub CLI** (`gh`):
```bash
which gh
```
If missing:
```
GitHub CLI not found. Required for PRs, repo management, and worker deployments.

Install: brew install gh
Then authenticate: gh auth login
```
If installed but not authenticated (`gh auth status` exits non-zero):
```
GitHub CLI installed but not authenticated.

Run: gh auth login
```

**Vercel CLI**:
```bash
which vercel
```
If missing:
```
Vercel CLI not found. Needed if you deploy sites or previews from HQ.

Install: npm install -g vercel
Then authenticate: vercel login

Skip if you don't use Vercel.
```
If installed but not authenticated (`vercel whoami` exits non-zero):
```
Vercel CLI installed but not authenticated.

Run: vercel login
```

Post-install: run `qmd index .` if qmd was just installed or no index exists.

After dependency checks complete, print:
```
These tools form your toolkit:
  - Claude Code: your AI interface (the terminal, not chat)
  - qmd: how HQ searches its own knowledge
  - gh: how HQ publishes to GitHub
  - vercel: how HQ deploys to the web
```

## Phase 2: Identity

Ask these 3 questions. One at a time.

1. **What's your name?**
2. **What do you do?** (1-2 sentences — your roles, work, domain)
3. **What are your goals for using HQ?** (what do you want AI workers to help with?)

Use "personal" as the company/context name.

After collecting answers, print:
```
HQ will use this to personalize your workers, knowledge, and project context.

Key concept: HQ learns who you are so your AI workforce has the context
to make good decisions without you supervising every step.
```

## Phase 3: Generate Files

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
!knowledge/getting-started/
```

### Index
```bash
qmd update 2>/dev/null || qmd index . 2>/dev/null || true
```

## Phase 4: Summary + Education

Print the file creation summary:
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
✓ vercel (Vercel CLI) — or skipped

Knowledge Repos:
Your knowledge bases can be independent git repos symlinked into knowledge/.
This lets you version, share, and publish each knowledge base separately.
See "Knowledge Repos" in CLAUDE.md for details.
```

Then print the education kit section:
```
══════════════════════════════════════
  Your HQ Education Kit
══════════════════════════════════════

Three guides have been included to help you learn HQ:

  1. Quick Start Guide — What HQ is, how it works, the daily workflow
     knowledge/getting-started/quick-start-guide.md

  2. Cheatsheet — Daily reference card for commands and cadence
     knowledge/getting-started/cheatsheet.md

  3. Learning Path — 11-module progression from beginner to advanced
     knowledge/getting-started/learning-path.md
```

Auto-open the quick start guide:
```bash
open knowledge/getting-started/quick-start-guide.md 2>/dev/null || true
```

Then print the first-week roadmap:
```
══════════════════════════════════════
  Your First Week
══════════════════════════════════════

Day 1 (today):
  1. Read the Quick Start Guide (just opened)
  2. Run /personal-interview — deep interview to build your voice + profile
  3. Try /startwork — see what your board looks like

Week 1:
  4. Pick one real project and run /brainstorm
  5. Turn it into a PRD with /prd
  6. Execute it with /run-project
  7. Close every session with /handoff

The single most important rule: plan mode always.
"AI in ask mode is not AGI. AI in plan mode can be."

Full book: empire.institute/book
Community: empire.institute
```

## Rules

- Ask questions one at a time
- Use defaults when user says "skip"
- Never overwrite existing files without asking
- Create parent directories as needed
- For CLI tools (gh, vercel): inform but don't block setup if missing. These are "recommended" not "required" (except claude itself)
- Always use relative paths for symlinks (../../repos/... not absolute paths)
