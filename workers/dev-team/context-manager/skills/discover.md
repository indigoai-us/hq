# discover

Discover and extract project context from various sources.

## Arguments

`$ARGUMENTS` = `--project <name>` (required) `--mode <mode>` (optional)

Modes:
- `automatic` (default) - Analyze repo structure and extract context
- `conversational` - Interview user to gather context
- `manual` - User provides content directly

Optional:
- `--repo <path>` - Path to target repository (defaults to project's target_repo)
- `--update` - Update existing context instead of overwriting

## Process

### Mode: automatic

1. Locate the project's target repository
2. Analyze repository structure:
   - README.md, README.rst
   - package.json, pyproject.toml, Cargo.toml, go.mod
   - Directory structure
   - .env.example, config files
   - Code comments and docstrings
3. Extract information for each context file:
   - **overview.md**: Purpose from README, goals from docs
   - **architecture.md**: Stack from package files, structure from directories
   - **domain.md**: Terms from code, concepts from comments
4. Generate draft context files
5. Present drafts to user for review
6. Write approved context to `projects/{project}/context/`

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
