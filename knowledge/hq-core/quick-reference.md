# HQ Quick Reference

## Directory Structure

```
HQ/
├── .claude/commands/   # Slash commands (22, visibility: public|private in frontmatter)
├── agents.md           # the user's profile
├── companies/          # Company-scoped resources
│   ├── acme/    # LR settings, data, knowledge
│   ├── widgets/         # Widgets Inc settings, data, knowledge
│   ├── designco/         # Design Co settings, data, knowledge
│   ├── personal/       # Personal settings, data, knowledge
│   └── band-tbd/       # Band brand, music, social
├── knowledge/
│   ├── public/         # Symlinks → repos/public/knowledge-* (each folder = own git repo)
│   └── private/        # Symlinks → repos/private/knowledge-* (each folder = own git repo)
├── projects/           # Project PRDs
├── repos/
│   ├── public/         # Open-source repos
│   └── private/        # Private repos
├── settings/           # Symlinks to companies/*/settings/
├── workers/
│   ├── public/         # Shareable workers (dev-team, content-*, qa, etc.)
│   └── private/        # Company/personal workers (cfo, cmo, x-poster, etc.)
└── workspace/
    ├── checkpoints/    # Session saves
    ├── orchestrator/   # Ralph loop workflow state
    ├── reports/        # Generated reports
    └── social-drafts/  # Social content pipeline
```

## Companies

| Company | Contents |
|---------|----------|
| acme | Stripe, Gusto, Deel, QB, Shopify creds; LR metrics/schema |
| widgets | Figma, Linear, Drive, Clerk creds; brand/marketing/verticals/case-studies |
| designco | Brand, products, messaging, social calendar |
| personal | Slack, X, LinkedIn creds; voice/style docs |
| band-tbd | Brand, music, recording, projects, social |

## Workers

**Public (`workers/public/`):**

| Worker | Purpose |
|--------|---------|
| frontend-designer | UI generation |
| qa-tester | Automated website testing (Playwright) |
| security-scanner | Security scanning |

**Dev Team (16):** `workers/public/dev-team/`
project-manager, task-executor, architect, backend-dev, database-dev, frontend-dev, infra-dev, motion-designer, code-reviewer, knowledge-curator, product-planner, dev-qa-tester, codex-engine, codex-coder, codex-reviewer, codex-debugger

**Content Team (5):** `workers/public/content-*/`
content-brand (voice/tone), content-sales (conversion copy), content-product (feature accuracy), content-legal (regulatory), content-shared (shared library)

**Private (`workers/private/`):**

| Worker | Company | Purpose |
|--------|---------|---------|
| cfo-worker | Acme Corp | Financial reporting (Stripe, Gusto, Deel, Shopify) |
| analyst-worker | Acme Corp | Data analysis |
| cmo-worker | Widgets Inc | Marketing ops (Drive, Figma, Linear) |
| cmo-worker-2 | Design Co | Social/content (X, LinkedIn) |
| x-poster | Personal | X/Twitter posting |
| invoices | Personal | Invoice generation |

## Commands

**Session:** `/reanchor`, `/checkpoint`, `/handoff`, `/nexttask`, `/remember`, `/learn`
**Workers:** `/run`, `/newworker`, `/metrics`
**Projects:** `/prd`, `/run-project`, `/execute-task`
**Content:** `/contentidea`, `/suggestposts`, `/scheduleposts`, `/preview-post`, `/post-now`
**Design:** `/generateimage`
**System:** `/cleanup`, `/search`, `/search-reindex`
**Deploy:** `/publish-kit`

*Moved to workers:* svg (frontend-designer), humanize (content-brand)
*Moved to repos:* {repo}-pr ({repo} repo), widgets-deploy (widgets knowledge), {repo}-deploy ({repo}-deploy worker)

## Knowledge Bases

Public (in `knowledge/public/`):
- `Ralph/` - coding methodology
- `workers/` - worker framework
- `hq-core/` - thread schema, HQ patterns
- `dev-team/` - dev team patterns
- `design-styles/` - image generation style guides
- `projects/` - project templates
- `loom/` - Loom agent patterns (reference)
- `ai-security-framework/` - security practices

Private (in `knowledge/private/`):
- `linear/` - Linear integration knowledge

Company-level (in `companies/{co}/knowledge/`):
- `companies/acme/knowledge/` - LR metrics, schema, integrations
- `companies/widgets/knowledge/` - brand, products, verticals, case-studies, ontology
- `companies/designco/knowledge/` - brand, products, messaging
- `companies/personal/knowledge/` - voice, style

## Knowledge Repo Inventory

| Symlink Path | Repo Location | Visibility |
|---|---|---|
| `knowledge/public/Ralph` | `repos/public/ralph-methodology/docs` | public |
| `knowledge/public/ai-security-framework` | `repos/public/knowledge-ai-security` | public |
| `knowledge/public/design-styles` | `repos/public/knowledge-design-styles` | public |
| `knowledge/public/dev-team` | `repos/public/knowledge-dev-team` | public |
| `knowledge/public/hq-core` | `repos/public/knowledge-hq-core` | public |
| `knowledge/public/loom` | `repos/public/knowledge-loom` | public |
| `knowledge/public/workers` | `repos/public/knowledge-workers` | public |
| `knowledge/public/projects` | `repos/public/knowledge-projects` | public |
| `knowledge/private/linear` | `repos/private/knowledge-linear` | private |
| `companies/widgets/knowledge` | `repos/private/knowledge-widgets` | private |
| `companies/acme/knowledge` | `repos/private/knowledge-acme` | private |
| `companies/designco/knowledge` | `repos/private/knowledge-designco` | private |
| `companies/personal/knowledge` | `repos/private/knowledge-personal` | private |
