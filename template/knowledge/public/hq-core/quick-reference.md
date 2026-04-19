---
type: reference
domain: [operations, engineering]
status: canonical
tags: [quick-reference, directory-structure, commands, workers, knowledge-bases]
relates_to: []
---

# HQ Quick Reference

## Directory Structure

```
HQ/
├── .claude/commands/   # Slash commands (44)
├── agents.md           # {your-name}'s profile
├── companies/          # Company-scoped resources (14 companies)
│   └── {co}/
│       ├── knowledge/  # Embedded git repo (company knowledge)
│       ├── policies/   # Standing operational rules
│       ├── repos/      # Symlinks → repos/{pub|priv}/
│       ├── settings/   # Credentials & config
│       ├── workers/    # Company-scoped workers
│       ├── data/       # Exports, reports
│       └── board.json  # OKR board
├── knowledge/
│   ├── public/         # Symlinks → repos/public/knowledge-*
│   └── private/        # Symlinks → repos/private/knowledge-*
├── projects/           # Project PRDs
├── repos/
│   ├── public/         # Open-source repos
│   └── private/        # Private repos
├── settings/           # Orchestrator config
├── workers/
│   └── public/         # Shareable workers (dev-team, content-*, social-*, gardener-*, gemini-*, etc.)
└── workspace/
    ├── checkpoints/    # Session saves
    ├── orchestrator/   # Ralph loop workflow state
    ├── reports/        # Generated reports
    ├── social-drafts/  # Social content pipeline
    └── threads/        # Session threads + handoff.json
```

## Companies (14)

| Company | Workers | Key Resources |
|---------|---------|---------------|
| {company} | cfo, analyst, infobip-admin, gtm, qa, deploy | Stripe, Gusto, Deel, QB, Shopify, Linear (voyage) |
| {company} | cmo | AWS (Route 53), Linear, LinkedIn, Loops |
| personal | x-user, invoices, social-council | Slack, Gmail, LinkedIn, X |
| keptwork | site-builder, research-agent | Stripe |
| golden-thread | — | Band/music |
| haven-slay | — | Artist site + admin |
| holler-mgmt | — | Artist manager monorepo |
| brandstage | — | BrandStage AI |
| estate-manager | — | Estate platform |
| tonal | — | Shopify store |
| moonflow | — | Expo mobile app |
| dominion | — | Domain management |
| hpo | — | GTM/growth |

## Workers

**Public (`workers/public/`):** frontend-designer, qa-tester, security-scanner, pretty-mermaid, site-builder, knowledge-tagger, exec-summary, accessibility-auditor, performance-benchmarker

**Dev Team (17):** `workers/public/dev-team/`
project-manager, task-executor, architect, backend-dev, database-dev, frontend-dev, infra-dev, motion-designer, code-reviewer, knowledge-curator, product-planner, dev-qa-tester, codex-engine, codex-coder, codex-reviewer, codex-debugger, reality-checker

**Content Team (5):** `workers/public/content-*/`
content-brand, content-sales, content-product, content-legal, content-shared

**Social Team (5):** `workers/public/social-*/`
social-shared, social-strategist, social-reviewer, social-publisher, social-verifier

**Gardener Team (3):** `workers/public/gardener-team/`
garden-scout, garden-auditor, garden-curator

**Gemini Team (3):** `workers/public/gemini-*/`
gemini-coder, gemini-reviewer, gemini-frontend

**Company Workers:** Located at `companies/{co}/workers/`. See manifest.yaml for full list per company.

## Commands (44)

**Session:** `/startwork`, `/reanchor`, `/checkpoint`, `/handoff`, `/recover-session`, `/remember`, `/learn`
**Workers:** `/run`, `/newworker`
**Projects:** `/plan`, `/run-project`, `/execute-task`, `/understand-project`, `/idea`, `/goals`, `/dashboard`, `/tdd`, `/quality-gate`
**Content:** `/contentidea`, `/suggestposts`, `/preview-post`, `/post`, `/post-results`, `/social-setup`
**Communication:** `/email`, `/checkemail`, `/imessage`
**Design:** `/generateimage`
**System:** `/cleanup`, `/garden`, `/search`, `/search-reindex`, `/publish-kit`, `/harness-audit`, `/model-route`, `/update-hq`
**Company:** `/newcompany`, `/launch-brand`, `/pb-connect`, `/bootcamp-student`, `/personal-interview`
**Linear:** `/check-linear-voyage`, `/{product}-prd`
**Deploy:** `/pr`

## Command ↔ Skill Shapes

Every command exists as `.claude/commands/{name}.md` (the slash-command entry point) and most have a paired `.claude/skills/{name}/SKILL.md` (the Skill-tool canonical logic). Two valid shapes:

**Consolidated (default for new commands)** — `.md` is a ~20-line delegator stub, `SKILL.md` holds the canonical logic. One source of truth, no drift. Converted pairs (Phase 3.1 audit): `search`, `audit-log`, `brainstorm`, `startwork`, `plan`, `handoff`, `learn`, `execute-task`.

**Thin-router split (only one)** — `run-project`. The `.md` is the canonical docs/flags/examples source (622 lines). The `SKILL.md` is a ~66-line bash wrapper that execs `scripts/run-project.sh`. They stay forked because one is human-facing documentation and the other is a dispatch shim — different jobs, neither redundant.

**Intentional exceptions (metadata stubs, no SKILL.md)** — `review`, `investigate`, `retro`, `document-release`, `review-plan`. These are frontmatter-only commands that dispatch prompts; no skill logic to split.

**Rule for new commands:** start with the consolidated shape — write the canonical logic in `SKILL.md`, leave `.md` as a stub copying `.claude/commands/startwork.md`'s shape (frontmatter → H1 → intro → `## Steps` → `## After`). Only fork if you have a genuine thin-router reason like `run-project`.

## Knowledge Bases

**Public** (`knowledge/public/`): Ralph, ai-security-framework, agent-browser, curious-minds, design-styles, dev-team, gemini-cli, hq-core, loom, projects, workers

**Private** (`knowledge/private/`): linear

**Company-level** (`companies/{co}/knowledge/`): All 14 companies have embedded git repos.

## Policies

Standing operational rules per company. Location: `companies/{co}/policies/*.md`
Cross-cutting rules: `.claude/policies/*.md` (47 policies)
Spec: `knowledge/public/hq-core/policies-spec.md`. Template: `companies/_template/policies/example-policy.md`
