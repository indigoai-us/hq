---
description: Generate a Product Requirements Document for project execution
allowed-tools: Task, Read, Glob, Grep, Write, Bash, AskUserQuestion
argument-hint: [project/feature description]
---

# /prd - Project Planning

Create PRDs with full HQ context awareness.

**User's input:** $ARGUMENTS

## The Job

1. Scan HQ context (workers, knowledge, existing projects)
2. Discovery interview (batched questions)
3. Generate structured PRD
4. Save to `projects/{name}/`

**Important:** Do NOT implement. Just create the PRD.

## Step 1: Scan HQ Context

Before asking questions, explore HQ:

```bash
# Workers available
cat workers/registry.yaml

# Existing projects (check for overlap)
ls projects/

# Knowledge bases
ls knowledge/
ls companies/*/knowledge/
```

Present findings:
```
Scanned HQ:
- Workers: frontend-dev, backend-dev, database-dev...
- Existing projects: {list or "none"}
- Relevant knowledge: {if any match keywords}

This appears to be: [company-specific | personal | HQ infrastructure]
```

## Step 2: Get Project Name

Ask for project slug. Check if `projects/{name}` exists:
- If exists: "Project exists. Continue editing or choose different name?"
- If new: proceed

## Step 3: Discovery Interview

Ask questions in batches. Format:

```
1. What's the core problem or goal?
   A. Option one
   B. Option two
   C. Other: [specify]

2. What does success look like?
   A. Measurable outcome 1
   B. Measurable outcome 2
```

Users respond: "1A, 2C"

**Batch 1: Problem & Success**
- Core problem/goal?
- What does success look like? (measurable)
- Who benefits?

**Batch 2: Scope & Constraints**
- What's in scope for MVP?
- Hard constraints (time, tech)?
- Dependencies on other projects?

**Batch 3: Quality Gates** (required)
```
What quality commands must pass for each user story?
   A. pnpm typecheck && pnpm lint
   B. npm run typecheck && npm run lint
   C. None (no automated checks)
   D. Other: [specify]
```

## Step 4: Generate PRD

Create `projects/{name}/` folder with:

**projects/{name}/README.md:**
```markdown
# {Project Name}

**Goal:** {1-sentence goal}
**Success:** {measurable outcome}

## Overview
{Brief description}

## Quality Gates
- `{command}` - {description}

## User Stories

### US-001: [Title]
**Description:** As a [user], I want [feature] so that [benefit].

**Acceptance Criteria:**
- [ ] Specific verifiable criterion

### US-002: [Title]
...

## Non-Goals
{What's out of scope}

## Technical Considerations
{Constraints, dependencies}

## Open Questions
{Remaining questions}
```

## Story Guidelines

- Each story completable in one AI session
- Acceptance criteria must be verifiable (not "works correctly")
- Order: schema → backend → UI → integration
- Keep stories atomic (one deliverable each)

## Step 5: Populate Project Context

After creating the PRD, offer to populate project context using the schema from `knowledge/project-context/schema.md`.

**Ask:**
```
Project PRD created. Would you like to populate project context?

Context helps workers understand the project deeply, not just tasks.

1. Manual - I'll create empty templates, you fill them in
2. Automatic - Analyze target repo and extract context (if target_repo exists)
3. Conversational - Interview you about the project
4. Skip - Create PRD only (warning: workers may lack context)
```

### Option 1: Manual Mode

Create `projects/{name}/context/` with template files:

```bash
mkdir -p projects/{name}/context
```

Copy templates from `knowledge/project-context/templates/`:
- `overview.md` (required)
- `architecture.md` (required)
- `domain.md` (required)
- `decisions.md` (recommended)
- `stakeholders.md` (recommended)

Update frontmatter with today's date:
```yaml
---
last_updated: {today}
last_verified: {today}
verified_by: prd-command
---
```

Tell user: "Templates created in `projects/{name}/context/`. Please fill in the sections."

### Option 2: Automatic Mode

If `target_repo` is specified in the PRD:

1. **Scan for existing docs:**
   - README.md, README, docs/*.md
   - package.json, pyproject.toml, Cargo.toml
   - .env.example, docker-compose.yml
   - Directory structure

2. **Extract and populate:**
   - `overview.md`: From README.md purpose section
   - `architecture.md`: From package.json deps, directory structure
   - `domain.md`: From README terminology, code comments

3. **Present draft for confirmation:**
   ```
   Extracted context from target repo:

   overview.md:
   - Purpose: [extracted]
   - Goals: [extracted or "needs input"]

   Confirm or edit? [Y/edit/skip]
   ```

4. Save confirmed context to `projects/{name}/context/`

### Option 3: Conversational Mode

Interview user in batches:

**Batch 1: Overview**
```
1. What problem does this project solve?
2. What are the main goals?
3. What is explicitly NOT in scope?
4. What's the current state? (planning/building/stable)
```

**Batch 2: Architecture**
```
1. What's the tech stack?
   A. Node.js + TypeScript
   B. Python
   C. Other: [specify]

2. Key architectural patterns?
   A. Monolith
   B. Microservices
   C. Serverless
   D. Other: [specify]
```

**Batch 3: Domain**
```
1. What are the 3-5 key domain terms someone needs to know?
2. Any business rules or constraints?
```

Populate context files from responses.

### Option 4: Skip

Warn user:
```
⚠️ Skipping context population.

Workers may lack project understanding. You can add context later:
  /run context-manager discover {name}
```

## Step 6: Complete

Tell user:
```
Project **{name}** created with {N} user stories.
Location: projects/{name}/README.md
{If context populated: "Context: projects/{name}/context/"}

Next: Run /execute to create tasks and assign workers.
```

## Rules

- Scan HQ first, ask questions second
- Batch questions (don't overwhelm)
- **Do NOT use EnterPlanMode** - this skill IS planning
- **Do NOT use TodoWrite** - PRD stories track tasks
