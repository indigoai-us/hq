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

Run `qmd status` for live counts. Default collections:

| Collection | Path | Pattern | Contents |
|---|---|---|---|
| `hq-infra` | `$HQ_ROOT/.claude` | `**/*.{md,yaml,yml,json,sh}` | Commands, skills, policies, hooks |
| `hq-workers` | `$HQ_ROOT/workers` | `**/*.{md,yaml,yml,json}` | Worker defs + skill files |
| `hq-knowledge` | `$HQ_ROOT/knowledge` | `**/*.{md,yaml,yml}` | Shared knowledge bases |
| `hq-projects` | `$HQ_ROOT/projects` | `**/*.{md,json}` | PRDs + READMEs |
| `{product}` | `$HQ_ROOT/repos/private/{product}` | `**/*.{ts,tsx,js,jsx,md,json,yaml,yml,sql,css,prisma}` | Product codebase |

Each company added via `/newcompany` gets its own collection:

| Collection | Path | Pattern |
|---|---|---|
| `{company-slug}` | `$HQ_ROOT/companies/{company-slug}` | `**/*.md` |

> **Note:** Do NOT create a monolithic `hq` collection at HQ root — it double-indexes company/repo content and misses `.claude/` (qmd skips dotdirs during traversal). Use the 4 `hq-*` sub-collections above instead.

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

# HQ sub-collections (4 focused collections, NOT one monolithic hq)
qmd collection add $HQ_ROOT/.claude --name hq-infra --mask "**/*.{md,yaml,yml,json,sh}"
qmd context add qmd://hq-infra "HQ infrastructure: commands, skills, policies, hooks, scripts."

qmd collection add $HQ_ROOT/workers --name hq-workers --mask "**/*.{md,yaml,yml,json}"
qmd context add qmd://hq-workers "AI worker definitions and skill files."

qmd collection add $HQ_ROOT/knowledge --name hq-knowledge --mask "**/*.{md,yaml,yml}"
qmd context add qmd://hq-knowledge "Shared knowledge bases: methodology, design, testing, security."

qmd collection add $HQ_ROOT/projects --name hq-projects --mask "**/*.{md,json}"
qmd context add qmd://hq-projects "Project PRDs and documentation."

# {PRODUCT} collection (if you have a main product repo)
qmd collection add $HQ_ROOT/repos/private/{product} --name {product} --mask "**/*.{ts,tsx,js,jsx,md,json,yaml,yml,sql,css,prisma}"
qmd context add qmd://{product} "{PRODUCT} monorepo description."

# Company collections (one per company)
# Add each company slug from companies/manifest.yaml:
for co in personal {your-company-1} {your-company-2}; do
  qmd collection add $HQ_ROOT/companies/$co --name $co --mask "**/*.md"
  qmd context add qmd://$co "$co company knowledge base"
done

qmd update
qmd embed
```
