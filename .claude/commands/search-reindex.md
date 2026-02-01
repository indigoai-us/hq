---
description: Reindex and re-embed HQ for qmd search
allowed-tools: Bash
argument-hint: [--force]
visibility: public
---

# /search-reindex - Rebuild Search Index

Re-index and re-embed HQ content for qmd search.

**Args:** $ARGUMENTS

## Process

### 1. Update index (re-scan files)
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

## Full Reset

To completely rebuild:
```bash
qmd cleanup
qmd collection add ~/Documents/HQ --name hq --mask "**/*.md"
qmd context add qmd://hq "HQ knowledge base: company knowledge, AI worker definitions, project PRDs, slash commands, reports, social drafts, and session threads."
qmd context add qmd://hq/knowledge "HQ-level knowledge bases: Ralph coding methodology, worker framework patterns, dev-team practices, design styles, security framework, project templates."
qmd context add qmd://hq/.claude/commands "Claude Code slash commands: agent skills for session management, worker execution, project management, content creation, design, deployment."
qmd context add qmd://hq/companies "Company-scoped directories (your companies -- configure in companies/ dir) each with knowledge bases, settings, and data."
qmd context add qmd://hq/workers "AI worker definitions with YAML configs and skill markdown files. Top-level ops workers, 12-person dev-team, 5-person content team."
qmd context add qmd://hq/projects "Project PRDs and READMEs for active and planned projects across all companies."
qmd context add qmd://hq/workspace "Runtime workspace: session threads, checkpoints, orchestrator state, reports, social drafts, content ideas, metrics."
qmd embed
```
