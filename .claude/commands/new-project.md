---
description: Scaffold a new project under a company with epic and directory structure
allowed-tools: Read, Write, Edit, Bash, AskUserQuestion
argument-hint: [project-slug] [--company company-slug]
visibility: public
---

# /new-project - Project Scaffolding

Create a new project with a beads epic and directory structure under a company.

**Args:** $ARGUMENTS

## Hierarchy

```
Project Epic (root, created here) ← /new-project creates this
└── Task (future)                 ← created by /plan
    ├── Subtask 1
    └── Subtask 2
```

## Process

### 1. Get Project Slug

Parse $ARGUMENTS for a project slug and optional `--company` flag.

If no slug provided, ask: "Project slug (lowercase, hyphens only)?"

Validate:
- Lowercase only, hyphens allowed, no spaces
- Not empty

### 2. Select Company

Read `companies/manifest.yaml` to list available companies.

If `--company` flag provided and matches a company, use it.
Otherwise, list companies and ask:

```
Available companies:
  1. {slug}
  2. {slug}
  ...

Which company does this project belong to?
```

### 3. Check for Duplicates

Check existing project epics under the selected company:

```bash
bd list --type epic --json
```

Filter results by company label. If a project with a similar name/slug already exists:
"A project '{title}' ({epic-id}) already exists under {company}. Continue anyway? (yes/no)"

### 4. Interactive Setup

Ask (batch):
1. Project name (human-readable)?
2. Brief description (1-2 sentences)?
3. Associated repos? (paths or "none")
4. Skills this project will use? Show relevant skills from `.claude/skills/*/SKILL.md` (or "none")
5. Success criteria? (what does success look like for this project — 2-3 bullet points)

### 5. Create Project Epic in Beads

```bash
bd create "{Project Name}" \
  --type epic \
  --description "{description}

## Success Criteria
{success criteria bullet points from step 4}" \
  --labels "{company-slug},{project-slug}" \
  --json
```

Capture the epic ID from the JSON output.

Then create a sentinel task to keep the epic open:

```bash
bd create "🔒 Project sentinel — do not close" \
  --parent {epic-id} \
  --type task \
  --description "Permanent blocked task that prevents the project epic from being closed when all real tasks complete. Never close or delete this task." \
  --silent
bd set-state {sentinel-id} blocked
```

### 6. Scaffold Project Directory

```bash
mkdir -p companies/{company-slug}/projects/{project-slug}/knowledge
```

### 7. Create knowledge/CLAUDE.md

Write `companies/{company-slug}/projects/{project-slug}/knowledge/CLAUDE.md`:

```markdown
# {Project Name} Knowledge Index

Knowledge files scoped to {Project Name}.

## Files

| File | Description |
|------|-------------|
| CLAUDE.md | This file — navigable map of {Project Name} knowledge |

## Notes

- Add files here as project knowledge grows.
- This project belongs to {Company Name} ({company-slug}).
```

### 8. Write Project README

Write `companies/{company-slug}/projects/{project-slug}/README.md`:

```markdown
# {Project Name}

{description}

## Details

- **Company:** {Company Name} ({company-slug})
- **Epic:** {epic-id}
- **Repos:** {list of repos, or "None yet."}
- **Skills:** {list of skills, or "None assigned."}

## Knowledge

Located at `companies/{company-slug}/projects/{project-slug}/knowledge/`.

## Tasks

Create tasks under this project with:
  /plan {description}

View tasks:
  bd children {epic-id} --pretty
```

### 9. Lint Check

Run `bd lint` from the company directory and verify the new epic passes. If it fails, fix the description to include the missing section before continuing.

```bash
cd companies/{company-slug}
bd lint
```

### 10. Reindex

```bash
qmd update 2>/dev/null || true
```

### 11. Report

```
Project {project-slug} scaffolded:
  Epic:       {epic-id} (root, company: {company-slug})
  Directory:  companies/{company-slug}/projects/{project-slug}/
  Knowledge:  companies/{company-slug}/projects/{project-slug}/knowledge/CLAUDE.md

Next steps:
  /plan {description}    (create tasks under this project)
  bd children {epic-id} --pretty  (view project tasks)
```

## Rules

- Projects are always epics (type=epic) — only projects are epics, and they are root-level (no parent)
- Project directory lives under `companies/{company-slug}/projects/{project-slug}/`
- Always create a beads epic — never just scaffold files without an epic
- Validate slug: lowercase, hyphens only, no spaces
- Never create a project under a company that doesn't exist in manifest.yaml
- Check for duplicate projects before creating
- Every project epic gets a blocked sentinel task — never close or delete it
- Skills, not workers — reference skill IDs from `.claude/skills/`
