# Worker Context Needs Registry

This directory documents what project context each worker type needs to do their best work.

## Why This Exists

Workers perform better when they have the right context. But different workers need different information:

- A **CodeWorker** needs architecture and domain knowledge
- A **ContentWorker** needs product overview and brand guidelines
- A **SocialWorker** needs voice guides more than technical details

This registry maps worker types to their context needs, so:
1. Projects can ensure they have the context workers need
2. Workers can declare what context they require
3. The context-manager can audit projects for missing context

## How It Works

### 1. Worker Types Define Defaults

Each worker type (CodeWorker, ContentWorker, etc.) has default context needs in `registry.yaml`:

```yaml
worker_types:
  CodeWorker:
    context_needs:
      required:
        - file: overview.md
        - file: architecture.md
        - file: domain.md
      recommended:
        - file: decisions.md
```

### 2. Individual Workers Can Override

Specific workers can extend or override their type's defaults:

```yaml
workers:
  architect:
    extends: CodeWorker
    overrides:
      required:
        - file: decisions.md   # Promoted from recommended
```

### 3. External Context

Some workers need context beyond project files:

```yaml
external_context:
  - type: brand_guidelines
    when: "Working on user-facing features"
```

## Declaring Context Needs for New Workers

When creating a worker with `/newworker`, you'll be asked about context needs. Your answer will be added here.

### Option 1: Use Type Defaults

If your worker's needs match its type, no entry is needed:

```yaml
# No entry needed - uses CodeWorker defaults
```

### Option 2: Override Type Defaults

If your worker has specific needs:

```yaml
workers:
  my-new-worker:
    extends: CodeWorker
    overrides:
      required:
        - file: decisions.md
          reason: "Must review past decisions before implementation"
    additional_external:
      - type: api_specs
        path: docs/api/
        when: "Always - integrates with external APIs"
```

### Option 3: Custom Needs

For workers with unique requirements:

```yaml
workers:
  special-worker:
    description: "Does something unique"
    context_needs:
      required:
        - file: overview.md
          reason: "Custom reason"
      optional:
        - file: custom-context.md
          reason: "Project-specific context"
```

## Context File Reference

These files come from the [Project Context Schema](../project-context/schema.md):

| File | Purpose | Typical Users |
|------|---------|---------------|
| `overview.md` | Purpose, goals, current state | All workers |
| `architecture.md` | Stack, structure, patterns | CodeWorker, OpsWorker |
| `domain.md` | Glossary, concepts, rules | CodeWorker, ContentWorker, ResearchWorker |
| `decisions.md` | Architectural decision records | CodeWorker (especially architects) |
| `stakeholders.md` | People, systems, communication | All workers needing coordination |
| `learnings.md` | Patterns, gotchas, tips | All workers (read), CodeWorker (write) |

## External Context Types

Beyond project context, workers may need:

| Type | Description | Example Path |
|------|-------------|--------------|
| `brand_guidelines` | Voice, tone, visual guidelines | `companies/{company}/knowledge/brand-guidelines.md` |
| `messaging_frameworks` | Key messages, positioning | `companies/{company}/knowledge/messaging/` |
| `voice_style_guide` | Personal voice/style rules | `knowledge/{user}/voice-style.md` |
| `profile` | User background and preferences | `knowledge/{user}/profile.md` |
| `security_framework` | Security scanning rules | `knowledge/ai-security-framework/` |
| `api_specs` | API documentation | `docs/api/` or external URLs |

## Usage by Context-Manager

The context-manager worker uses this registry to:

1. **Audit projects** - Check if projects have the context that assigned workers need
2. **Recommend context** - Suggest which context files to create based on worker assignments
3. **Validate completeness** - Ensure required context exists before worker execution

Example audit workflow:
```
/run context-manager audit --project {company}-nx
```

Output:
```
Project: {company}-nx
Assigned workers: architect, backend-dev, frontend-dev

Missing required context:
- decisions.md (required by: architect)

Missing recommended context:
- learnings.md (recommended by: architect, backend-dev, frontend-dev)
```

## Schema

The registry follows a schema to enable validation:

```yaml
version: string        # Schema version
updated: date          # Last update date
worker_types:          # Type-level defaults
  TypeName:
    description: string
    context_needs:
      required: [...]
      recommended: [...]
      optional: [...]
    external_context: [...]
workers:               # Worker-specific overrides
  worker-id:
    extends: TypeName
    overrides: {...}
    additional_external: [...]
```
