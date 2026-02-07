---
description: Reindex and re-embed all qmd collections (HQ + repos)
allowed-tools: Bash
argument-hint: [--force]
visibility: public
---

# /search-reindex - Rebuild Search Index

Re-index and re-embed all qmd collections (HQ knowledge + indexed codebases).

**Args:** $ARGUMENTS

## Collections

| Collection | Path | Pattern | Files |
|---|---|---|---|
| `hq` | `~/Documents/HQ` | `**/*.md` | (depends on your HQ) |
| `myproject` | `~/Documents/HQ/repos/myproject` | `**/*.{ts,tsx,js,jsx,md,json,yaml,yml,sql,css}` | (depends on your project) |

Configure your collections based on your needs.

## Process

### 1. Update index (re-scan all collections)
```bash
qmd update
```

### 2. Re-embed

If `--force` in $ARGUMENTS:
```bash
qmd embed -f
```

Otherwise (incremental — only new/changed files):
```bash
qmd embed
```

### 3. Show status
```bash
qmd status
```

Display collection stats, document count, embedding coverage.

## When to Reindex

Run after:
- Adding new knowledge bases or company docs
- Creating new workers or skills
- Generating reports or content
- Major workspace changes
- Significant code changes in indexed repos

## Adding a New Repo Collection

Convention: any actively-worked repo in `repos/` can get a qmd collection.

```bash
qmd collection add {path} --name {repo-name} --mask "**/*.{ts,tsx,js,jsx,md,json,yaml,yml,sql,css,prisma}"
qmd context add qmd://{repo-name} "{1-sentence description}"
qmd context add qmd://{repo-name}/{subdir} "{subdirectory description}"
qmd embed
```

Then update this command's Collections table and Full Reset section.

## Full Reset

To completely rebuild all collections:
```bash
qmd cleanup

# HQ collection
qmd collection add ~/Documents/HQ --name hq --mask "**/*.md"
qmd context add qmd://hq "HQ knowledge base: company knowledge, AI worker definitions, project PRDs, slash commands, reports, social drafts, and session threads."
qmd context add qmd://hq/knowledge "HQ-level knowledge bases: Ralph coding methodology, worker framework patterns, dev-team practices, design styles, security framework, project templates."
qmd context add qmd://hq/.claude/commands "Claude Code slash commands: agent skills for session management, worker execution, project management, content creation, design, deployment."
qmd context add qmd://hq/companies "Company-scoped directories each with knowledge bases, settings, and data."
qmd context add qmd://hq/workers "AI worker definitions with YAML configs and skill markdown files. Dev-team, content team, and custom workers."
qmd context add qmd://hq/projects "Project PRDs and READMEs for active and planned projects."
qmd context add qmd://hq/workspace "Runtime workspace: session threads, checkpoints, orchestrator state, reports, social drafts, content ideas, metrics."

# Add any project repo collections
qmd collection add ~/Documents/HQ/repos/{project-name} --name {project-name} --mask "**/*.{ts,tsx,js,jsx,md,json,yaml,yml,sql,css,prisma}"
qmd context add qmd://{project-name} "{Project description: tech stack, purpose}"
qmd context add qmd://{project-name}/apps "{Application code description}"
qmd context add qmd://{project-name}/libs "{Shared libraries description}"

qmd embed
```
