# discover

Discover and extract project context from various sources.

## Arguments

`$ARGUMENTS` = `--project <name>` (required) `--mode <mode>` (optional)

Modes:
- `automatic` (default) - Analyze repo structure and extract context
- `conversational` - Interview user to gather context
- `manual` - User provides content directly

Optional:
- `--repo <path>` - Path to target repository (defaults to project's target_repo from PRD)
- `--update` - Update existing context instead of overwriting (merge new info)

## Process

### Mode: automatic (Repo Analysis)

#### Step 1: Locate Repository

```
1. Read projects/{project}/prd.json
2. Extract target_repo path
3. If --repo provided, use that instead
4. Verify path exists and is accessible
```

#### Step 2: Analyze Repository Sources

Read and analyze these files in order of priority:

**Primary Sources (read first):**
| File | What to Extract |
|------|-----------------|
| `README.md` / `README.rst` | Purpose, goals, setup instructions, architecture overview |
| `package.json` | Name, description, dependencies, scripts, engines |
| `pyproject.toml` | Name, description, dependencies, Python version |
| `Cargo.toml` | Name, description, dependencies, Rust edition |
| `go.mod` | Module name, Go version, dependencies |
| `composer.json` | PHP package info, dependencies |

**Structure Sources:**
| Source | What to Extract |
|--------|-----------------|
| Top-level directories | Architecture patterns (src/, lib/, tests/, docs/) |
| `src/` or `lib/` structure | Code organization, module boundaries |
| `docs/` | Additional context, ADRs, guides |
| `.github/` | CI/CD patterns, workflows |

**Configuration Sources:**
| File | What to Extract |
|------|-----------------|
| `.env.example` | Required environment variables, external services |
| `docker-compose.yml` | Service dependencies, infrastructure |
| `config/` directory | Configuration structure, environments |
| `*.config.js/ts` | Build tools, framework config |

**Code Sources (sample, don't read everything):**
| Source | What to Extract |
|--------|-----------------|
| Type definitions (`*.d.ts`, `types/`) | Domain models |
| API routes | Endpoints, resources |
| Database schemas/migrations | Data models |
| Test file names | Business rules, edge cases |

#### Step 3: Map Extractions to Context Files

**overview.md mapping:**
```
Purpose:
  - README first paragraph or "Description" section
  - package.json "description" field

Goals:
  - README "Goals" or "Objectives" section
  - Infer from feature list if explicit goals missing

Non-Goals:
  - README "Non-Goals" or "Out of Scope" section
  - If missing, leave as "Not yet documented"

Current State:
  - README badges (build status, version)
  - package.json version (0.x = early, 1.x+ = stable)
  - Check for "Alpha", "Beta", "WIP" mentions
```

**architecture.md mapping:**
```
Stack:
  - Language: Detect from package.json/pyproject.toml/Cargo.toml
  - Framework: Top dependencies (react, next, django, fastapi, etc.)
  - Database: Look for db drivers, ORM packages, docker-compose
  - Hosting: Check for vercel.json, netlify.toml, Dockerfile

Structure:
  - Map actual directory tree (top 2 levels)
  - Note patterns: monorepo, src/lib split, feature folders

Patterns:
  - Component libraries → composition pattern
  - Redux/Zustand → centralized state
  - tRPC/GraphQL → typed API pattern

Dependencies:
  - External services from .env.example
  - Key libraries from package.json (non-dev)

Configuration:
  - Required env vars from .env.example
  - Config file locations
```

**domain.md mapping:**
```
Glossary:
  - Type/interface names from definitions
  - README terminology
  - Database table/model names

Concepts:
  - Main types and their relationships
  - Entity names from models

Rules:
  - Validation logic from schemas
  - Business rules from test descriptions
  - Constraints from database schemas
```

#### Step 4: Generate Drafts

For each context file:
1. Copy template from `knowledge/project-context/templates/{file}.md`
2. Replace placeholders with extracted content
3. Mark uncertain content with `[NEEDS REVIEW]`
4. Set frontmatter:
   ```yaml
   ---
   last_updated: {today}
   last_verified: {today}
   verified_by: context-manager
   source: automatic
   ---
   ```

#### Step 5: Present Drafts for Review

Show the user each draft file:
```
## Draft: overview.md

{content}

---
Questions:
1. Is the Purpose accurate?
2. Are there Goals I missed?
3. Should I add anything to Non-Goals?

[Accept] [Edit] [Regenerate]
```

Use `AskUserQuestion` to get approval or edits for each file.

#### Step 6: Write Context Files

1. Create `projects/{project}/context/` directory if needed
2. Write approved files
3. Create optional `context.yaml` manifest:
   ```yaml
   project: {project}
   source: automatic
   generated_at: {timestamp}
   files:
     overview: context/overview.md
     architecture: context/architecture.md
     domain: context/domain.md
   ```

### Incremental Mode (--update)

When `--update` flag is provided:

1. Read existing context files from `projects/{project}/context/`
2. Compare with newly extracted content
3. For each section:
   - If new info found → append with `[NEWLY DISCOVERED]` marker
   - If existing info conflicts → flag with `[CONFLICT - VERIFY]`
   - If existing info unchanged → keep as-is
4. Present diff view to user showing additions/changes
5. Update `last_updated` but keep original `verified_by` if unchanged
6. Write merged content after approval

### Mode: conversational

1. Create interview flow grouped by context section:
   - **Overview questions**: "What problem does this solve?", "What are the main goals?"
   - **Architecture questions**: "What's the tech stack?", "How is the code organized?"
   - **Domain questions**: "What are key terms users should know?", "What business rules exist?"
2. Batch questions to reduce back-and-forth
3. Allow user to paste existing docs/specs
4. Extract structured context from responses
5. Generate context files with source attribution
6. Write to `projects/{project}/context/`

### Mode: manual

1. Present context file templates
2. User fills in content directly
3. Validate against schema
4. Write to `projects/{project}/context/`

## Sources Analyzed

| Source | Extracts |
|--------|----------|
| README.md | Purpose, goals, overview |
| package.json | Stack, dependencies, scripts |
| Directory structure | Architecture patterns |
| .env.example | External dependencies |
| Code comments | Domain concepts, rules |
| API schemas | Domain models |
| Test files | Business rules, edge cases |

## Output

- `projects/{project}/context/overview.md`
- `projects/{project}/context/architecture.md`
- `projects/{project}/context/domain.md`
- `projects/{project}/context/decisions.md` (if ADRs found)
- `projects/{project}/context/stakeholders.md` (if info available)

Each file includes frontmatter:
```yaml
---
last_updated: YYYY-MM-DD
last_verified: YYYY-MM-DD
verified_by: context-manager
source: automatic|conversational|manual
---
```

## Human Checkpoints

- Review draft context before writing
- Confirm accuracy of extracted information
- Approve any inferred content

## Verification

After completion:
1. All required files exist (overview, architecture, domain)
2. Files have valid frontmatter
3. Context can be validated if context.yaml exists
