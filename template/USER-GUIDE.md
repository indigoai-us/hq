# HQ User Guide

Personal OS for orchestrating work across companies, workers, and AI.

## Commands

### Session Management
| Command | What it does |
|---------|--------------|
| `/startwork` | Pick company/project/repo, gather context |
| `/reanchor` | Show recent state, ask what to focus on |
| `/checkpoint` | Save progress to `workspace/checkpoints/` |
| `/handoff` | Prepare handoff for fresh session |
| `/recover-session` | Recover dead sessions that hit context limits |
| `/remember` | Capture learnings (delegates to `/learn`) |
| `/learn` | Auto-capture learnings from task execution |

### Workers
| Command | What it does |
|---------|--------------|
| `/run` | List workers |
| `/run {worker}` | Show worker's skills |
| `/run {worker} {skill}` | Execute skill |
| `/newworker` | Create new worker |

### Projects
| Command | What it does |
|---------|--------------|
| `/prd` | Plan new project, create PRD |
| `/run-project` | Execute project via Ralph loop |
| `/execute-task` | Execute single task with worker coordination |
| `/understand-project` | Deep-dive project understanding |
| `/idea` | Capture project idea without full PRD |
| `/goals` | View and manage OKR structure |
| `/dashboard` | Generate visual goals dashboard |
| `/tdd` | Enforce test-driven development cycle |
| `/quality-gate` | Pre-commit quality checks (typecheck, lint, test) |

### Content & Social
| Command | What it does |
|---------|--------------|
| `/post` | Post or schedule content to X/LinkedIn via Post-Bridge |

### Deploy & Ops
| Command | What it does |
|---------|--------------|
| `/pr` | PR operations |

### Company & Infrastructure
| Command | What it does |
|---------|--------------|
| `/newcompany` | Scaffold new company with full infrastructure |
| `/personal-interview` | Deep interview to populate profile/voice |

### System
| Command | What it does |
|---------|--------------|
| `/cleanup` | Audit and clean HQ |
| `/garden` | Detect stale, duplicate, inaccurate content |
| `/search` | Search across HQ and indexed repos |
| `/search-reindex` | Reindex qmd collections |
| `/harness-audit` | Score HQ setup quality |
| `/model-route` | Recommend optimal Claude model |
| `/update-hq` | Upgrade HQ from latest starter kit |

## Workers

```
/run                    # see all
/run frontend-designer audit
/run qa-tester smoke-test
```

**Public (`workers/public/`):**

| Worker | Purpose |
|--------|---------|
| frontend-designer | UI generation |
| qa-tester | Automated website testing (Playwright) |
| security-scanner | Security scanning |
| pretty-mermaid | Mermaid diagram generation |
| site-builder | Static site generation |
| knowledge-tagger | Knowledge classification |
| exec-summary | Executive summary generation |
| accessibility-auditor | Accessibility checks |
| performance-benchmarker | Performance analysis |

**Dev Team (17):** `workers/public/dev-team/`
project-manager, task-executor, architect, backend-dev, database-dev, frontend-dev, infra-dev, motion-designer, code-reviewer, knowledge-curator, product-planner, dev-qa-tester, codex-engine, codex-coder, codex-reviewer, codex-debugger, reality-checker

**Content Team (5):** `workers/public/content-*/`
content-brand, content-sales, content-product, content-legal, content-shared (library)

**Social Team (5):** `workers/public/social-*/`
social-shared (library), social-strategist, social-reviewer, social-publisher, social-verifier

**Gardener Team (3):** `workers/public/gardener-team/`
garden-scout, garden-auditor, garden-curator

**Gemini Team (3):** `workers/public/gemini-*/`
gemini-coder, gemini-reviewer, gemini-frontend

**Company Workers** (`companies/{co}/workers/`):

| Worker | Company | Purpose |
|--------|---------|---------|
| cfo-{company} | {Product} | Financial reporting (Stripe, Gusto, Deel, Shopify) |
| {company}-analyst | {Product} | Data analysis |
| infobip-admin | {Product} | Infobip channel management |
| {company}-gtm | {Product} | GTM operations |
| lr-qa | {Product} | QA testing |
| {product}-deploy | {Product} | Deployment automation |
| cmo-{company} | {Product} | Social/content (X, LinkedIn) |
| x-{your-name} | Personal | X/Twitter posting |
| invoices | Personal | Invoice generation |
| social-council | Personal | Social strategy council |
| pr-coordinator | {company} | PR campaign coordination |
| pr-strategist | {company} | PR strategy |
| pr-writer | {company} | PR content writing |
| pr-outreach | {company} | Journalist outreach |
| pr-monitor | {company} | Media monitoring |
| {company}-site-builder | {company} | Site generation |
| {company}-research-agent | {company} | Research automation |

## Companies (14)

Each company owns its settings, data, and knowledge.

```
companies/
├── {company}/    # SMS/e-commerce + AI platform
├── {company}/         # AI venture
├── personal/       # Personal tools + social
├── {company}/  # Band/music
├── {company}/     # Artist site + admin
├── {company}/    # Artist management
├── {company}/      # PR agency
├── {company}/     # {Product} AI
├── {company}/ # Estate platform
├── {company}/       # Agency + tools
├── {company}/          # Shopify store
├── {company}/       # Wellness mobile app
├── {company}/       # Domain management
└── {company}/            # GTM/growth
```

## Projects

PRDs live at `companies/{co}/projects/{name}/prd.json` (source of truth) with `README.md` (human-readable).

```
/prd "Build dashboard"          # creates PRD
/run-project customer-cube      # execute via Ralph loop
```

## Directory Structure

```
HQ/
├── .claude/
│   ├── commands/      # Slash commands (44)
│   ├── hooks/         # Lifecycle hooks (8)
│   ├── policies/      # Cross-cutting rules (47)
│   └── skills/        # Skill definitions (3)
├── agents-profile.md  # {your-name}'s profile
├── agents-companies.md # Company contexts
├── companies/         # Company-scoped resources (14)
│   └── {co}/
│       ├── knowledge/ # Embedded git repo
│       ├── policies/  # Company rules
│       ├── settings/  # Credentials & config
│       ├── workers/   # Company-scoped workers
│       ├── data/      # Exports, reports
│       ├── repos/     # Symlinks → repos/{pub|priv}/
│       ├── projects/  # PRDs
│       └── board.json # OKR board
├── knowledge/
│   ├── public/        # Symlinks → repos/public/knowledge-*
│   └── private/       # Symlinks → repos/private/knowledge-*
├── repos/
│   ├── public/        # Open-source repos
│   └── private/       # Private repos
├── settings/          # Orchestrator config, contacts
├── workers/
│   └── public/        # Shareable workers (dev-team, content-*, social-*, gardener-*, gemini-*, etc.)
└── workspace/
    ├── checkpoints/   # Session saves
    ├── orchestrator/  # Ralph loop workflow state
    ├── reports/       # Generated reports
    ├── social-drafts/ # Social content pipeline
    └── threads/       # Session threads + handoff.json
```

## Typical Session

1. `/startwork` or `/reanchor` - see state, pick focus
2. Do work
3. `/checkpoint` - save progress
4. `/handoff` - prep for next session

## Knowledge Bases

**Public** (in `knowledge/public/`):
- `Ralph/` - coding methodology
- `workers/` - worker framework
- `hq-core/` - thread schema, HQ patterns
- `dev-team/` - dev team patterns
- `design-styles/` - image generation style guides
- `projects/` - project templates
- `loom/` - Loom agent patterns (reference)
- `ai-security-framework/` - security practices
- `agent-browser/` - browser automation patterns
- `curious-minds/` - book/learning content
- `gemini-cli/` - Gemini CLI patterns

**Private** (in `knowledge/private/`):
- `linear/` - Linear integration knowledge

**Company-level** (in `companies/{co}/knowledge/`):
- All 14 companies have embedded git repos
