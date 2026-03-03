---
description: Scaffold a new company with full infrastructure
allowed-tools: Read, Write, Edit, Bash, AskUserQuestion
argument-hint: [company-slug]
visibility: public
---

# /newcompany - Company Scaffolding

Create a new company with complete infrastructure in one operation.

**Args:** $ARGUMENTS

## Process

### 1. Get Company Slug

If no args, ask: "Company slug (lowercase, hyphens only)?"
Validate: no spaces, lowercase only, hyphens allowed, doesn't already exist in `companies/manifest.yaml`.

### 2. Interactive Setup

Ask (batch):
1. Company name (human-readable)?
2. GitHub org? (if any, or "none")
3. Existing repos to associate? (paths or "none")
4. Settings needed? (API keys, credentials — or "none for now")
5. Existing skills to assign? (or "none")

### 3. Scaffold Directory

`companies/` is a symlink to `~/Documents/GHQ/companies/`. All company data lives outside the repo.
Scaffold directly in the symlink target:

```bash
mkdir -p ~/Documents/GHQ/companies/{slug}/settings
mkdir -p ~/Documents/GHQ/companies/{slug}/knowledge
mkdir -p ~/Documents/GHQ/companies/{slug}/policies
mkdir -p ~/Documents/GHQ/companies/{slug}/projects
```

Verify the directory is accessible through the repo symlink:
```bash
ls companies/{slug}/
```

### 4. Create knowledge/INDEX.md

```bash
cat > companies/{slug}/knowledge/INDEX.md << 'EOF'
# {Name} Knowledge Index

Knowledge files scoped to {Name}.

## Files

| File | Description |
|------|-------------|
| INDEX.md | This file — navigable map of {Name} knowledge |

## Notes

- Add files here as {Name} knowledge grows.
- Never mix {Name} knowledge into other company-scoped outputs.
- Registered in `companies/manifest.yaml` under `{slug}.knowledge`.
EOF
```

### 5. Update manifest.yaml

**manifest.yaml**: Add entry with ALL fields populated (no nulls):
```yaml
{slug}:
  repos: [{repo paths or empty array}]
  settings: companies/{slug}/settings/
  skills: [{skill ids or empty array}]
  knowledge: companies/{slug}/knowledge/
  deploy: []
  vercel_projects: []
  qmd_collections:
    - {slug}
```

Read the current `companies/manifest.yaml`, then append the new entry at the end. All fields must be present — use empty arrays `[]` rather than `null` for missing lists.

### 6. Create qmd Collection (offer)

Ask: "Create a qmd collection named '{slug}' for this company's knowledge? (yes/no)"

If yes:
```bash
qmd collection add companies/{slug}/knowledge --name {slug} --mask "**/*.md"
qmd update 2>/dev/null || true
```

If no: skip — user can add it later with `qmd collection add`.

### 7. Write Company README

Write `companies/{slug}/README.md`:

```markdown
# {Name}

Brief description of the company and its relationship to GHQ.

## Repos

{list of associated repos, or "None yet."}

## Skills

{list of assigned skills, or "None assigned."}

## Knowledge

Located at `companies/{slug}/knowledge/`.

## Settings

Credentials and config at `companies/{slug}/settings/` (excluded from version control via .claudeignore).

## Policies

Company-scoped rules at `companies/{slug}/policies/`.
```

### 8. Reindex

```bash
qmd update 2>/dev/null || true
```

### 9. Report

```
Company {slug} scaffolded:
  Directory:  companies/{slug}/
  Knowledge:  companies/{slug}/knowledge/INDEX.md
  Policies:   companies/{slug}/policies/
  Projects:   companies/{slug}/projects/
  Settings:   companies/{slug}/settings/
  Manifest:   updated
  qmd:        collection "{slug}" {created | skipped}
```

## Rules

- `companies/` is a symlink to `~/Documents/GHQ/companies/` — never commit company data to the repo
- All fields in manifest.yaml must be non-null (use empty arrays `[]`, not `null`)
- Knowledge directory with INDEX.md is mandatory — always create one
- Always update manifest.yaml and run qmd update in the same operation
- Never create a company that already exists in manifest.yaml
- Validate slug: lowercase, hyphens only, no spaces
- Use `skills` (not `workers`) in manifest.yaml — GHQ uses skills, not workers
- settings/ directory is excluded from version control — never commit credentials
