# Project Context Schema

Standard schema for capturing project context that workers need to understand and work effectively on any project.

## Purpose

Workers perform better when they understand:
- **What** the project does and why it exists
- **How** the project is built (architecture, patterns)
- **Domain** concepts and terminology
- **Decisions** that shaped the current design
- **Who** is involved and their roles

This schema provides a consistent structure so any worker can quickly load project context.

## Directory Structure

Each project with context has a `context/` directory:

```
projects/{project-name}/
├── prd.json              # Project requirements
└── context/              # Project context
    ├── overview.md       # REQUIRED: What and why
    ├── architecture.md   # REQUIRED: How it's built
    ├── domain.md         # REQUIRED: Key concepts
    ├── decisions.md      # RECOMMENDED: Design decisions
    ├── stakeholders.md   # RECOMMENDED: Who's involved
    └── learnings.md      # OPTIONAL: Accumulated insights
```

## Core Files (Required)

### overview.md
Quick introduction for workers who are new to the project.

**Required sections:**
- **Purpose**: What problem does this solve?
- **Goals**: What are we trying to achieve?
- **Non-Goals**: What are we explicitly NOT doing?
- **Current State**: Where is the project right now?

### architecture.md
Technical structure and patterns used in the project.

**Required sections:**
- **Stack**: Technologies, frameworks, tools
- **Structure**: Directory layout and organization
- **Patterns**: Key architectural patterns used
- **Dependencies**: External services, APIs, libraries

### domain.md
Domain-specific knowledge workers need to understand.

**Required sections:**
- **Glossary**: Key terms and definitions
- **Concepts**: Core domain concepts and relationships
- **Rules**: Business rules and constraints

## Recommended Files

### decisions.md
Architectural Decision Records (ADRs) capturing why things are built the way they are.

**Required sections:**
- **Format**: Title, Date, Status, Context, Decision, Consequences
- **Index**: List of all decisions with links

### stakeholders.md
People and systems involved with the project.

**Required sections:**
- **People**: Names, roles, contact info
- **Systems**: Upstream/downstream dependencies
- **Communication**: Where discussions happen

## Optional Files

### learnings.md
Insights accumulated by workers as they work on the project.

**Sections:**
- **Patterns**: What works well
- **Gotchas**: What to watch out for
- **Tips**: Helpful tricks
- **Open Questions**: Unresolved issues

## Frontmatter Requirements

All context files MUST include YAML frontmatter:

```yaml
---
last_updated: 2026-01-27
last_verified: 2026-01-27
verified_by: worker-name
---
```

- `last_updated`: When content was last changed
- `last_verified`: When content was last confirmed accurate
- `verified_by`: Who verified the content

## Validation

Context can be validated against the JSON schema:

```bash
npx ajv validate -s knowledge/project-context/context-schema.json -d context.yaml
```

A `context.yaml` manifest file can optionally be created to list and validate context files:

```yaml
project: my-project
files:
  overview: context/overview.md
  architecture: context/architecture.md
  domain: context/domain.md
  decisions: context/decisions.md
  stakeholders: context/stakeholders.md
```

## Usage

Workers load context before starting work:

1. Check if `projects/{project}/context/` exists
2. Read `overview.md` for quick orientation
3. Read `architecture.md` for technical understanding
4. Read `domain.md` for terminology
5. Check `decisions.md` if making architectural choices
6. Check `learnings.md` for tips and gotchas

## See Also

- [Templates](./templates/) - File templates with required sections
- [context-schema.json](./context-schema.json) - JSON schema for validation
