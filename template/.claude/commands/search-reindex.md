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

Run `qmd status` for live counts. Current collections (17):

| Collection | Path | Pattern |
|---|---|---|
| `hq` | `~/Documents/HQ` | `**/*.{md,json,yaml,yml}` |
| `{product}` | `~/Documents/HQ/repos/private/{product}` | `**/*.{ts,tsx,js,jsx,md,json,yaml,yml,sql,css,prisma}` |
| `{company}` | `~/Documents/HQ/companies/{company}/knowledge` | `**/*.md` |
| `{company}` | `~/Documents/HQ/companies/{company}/knowledge` | `**/*.md` |
| `personal` | `~/Documents/HQ/companies/personal/knowledge` | `**/*.md` |
| `{company}` | `~/Documents/HQ/companies/{company}/knowledge` | `**/*.md` |
| `{company}` | `~/Documents/HQ/companies/{company}/knowledge` | `**/*.md` |
| `{company}` | `~/Documents/HQ/companies/{company}/knowledge` | `**/*.md` |
| `{company}` | `~/Documents/HQ/companies/{company}/knowledge` | `**/*.md` |
| `{company}` | `~/Documents/HQ/companies/{company}/knowledge` | `**/*.md` |
| `{company}` | `~/Documents/HQ/companies/{company}/knowledge` | `**/*.md` |
| `{company}` | `~/Documents/HQ/companies/{company}/knowledge` | `**/*.md` |
| `{company}` | `~/Documents/HQ/companies/{company}/knowledge` | `**/*.md` |
| `{company}` | `~/Documents/HQ/companies/{company}/knowledge` | `**/*.{md,mdx}` |
| `{company}` | `~/Documents/HQ/companies/{company}/knowledge` | `**/*.md` |
| `{company}` | `~/Documents/HQ/companies/{company}/knowledge` | `**/*.md` |
| `{company}` | `~/Documents/HQ/companies/{company}/knowledge` | `**/*.md` |

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
qmd collection add ~/Documents/HQ --name hq --mask "**/*.{md,json,yaml,yml}"
qmd context add qmd://hq "HQ knowledge base: company knowledge, AI worker definitions, project PRDs, slash commands, reports, social drafts, and session threads."
qmd context add qmd://hq/knowledge "HQ-level knowledge bases: Ralph coding methodology, worker framework patterns, dev-team practices, design styles, security framework, project templates."
qmd context add qmd://hq/.claude/commands "Claude Code slash commands: 44 agent skills for session management, worker execution, project management, content creation, design, deployment."
qmd context add qmd://hq/companies "17 company-scoped directories each with knowledge bases, settings, and data."
qmd context add qmd://hq/workers "AI worker definitions with YAML configs and skill markdown files. Top-level ops workers, dev-team, content team, social team, pr-team, gardener-team, gemini-team."
qmd context add qmd://hq/projects "Project PRDs and READMEs for active and planned projects across all companies."
qmd context add qmd://hq/workspace "Runtime workspace: session threads, checkpoints, orchestrator state, reports, social drafts, content ideas, metrics."

# {PRODUCT} collection
qmd collection add ~/Documents/HQ/repos/private/{product} --name {product} --mask "**/*.{ts,tsx,js,jsx,md,json,yaml,yml,sql,css,prisma}"
qmd context add qmd://{product} "{PRODUCT} monorepo: Nx monorepo for {Product}/{Product}. Apps (web-admin, web-client, web-front, function, {company}, cdp) + libs (core, db, ui, web, util, schema). Next.js, React 19, TypeScript, SST, Prisma, PostgreSQL."
qmd context add qmd://{product}/apps "Application code: Next.js web apps, AWS Lambda functions, {Product} SMS platform, CDP."
qmd context add qmd://{product}/libs "Shared libraries: db/Prisma schemas, core feature modules (auth, billing, brand, conversation, ai, workflow), UI components, utilities."

# Company collections (one per company knowledge base)
for co in {company} {company} personal {company} {company} {company} {company} {company} {company} {company} {company} {company} {company} {company}; do
  qmd collection add ~/Documents/HQ/companies/$co/knowledge --name $co --mask "**/*.md"
  qmd context add qmd://$co "$co company knowledge base"
done
# {company} uses mdx too
qmd collection add ~/Documents/HQ/companies/{company}/knowledge --name {company} --mask "**/*.{md,mdx}"
qmd context add qmd://{company} "{company} company knowledge base"

qmd embed
```
