---
description: Research {PRODUCT} codebase and generate PRD for {Company}/{Product} features
allowed-tools: Task, Read, Glob, Grep, Write, Bash, AskUserQuestion
argument-hint: [feature description] [optional: DEV-xxx]
visibility: public
---

# /{product}-prd — {PRODUCT} Feature Planning & PRD Generation

Research-first PRD generator for the {PRODUCT} monorepo ({Company}/{Product}). Produces a technical PLAN in the repo AND an orchestrator-compatible prd.json in HQ.

**User's input:** $ARGUMENTS

**Important:** Do NOT implement. Just research + plan + generate PRD files.

---

## {PRODUCT} Monorepo Reference

### Apps

| App | Purpose |
|-----|---------|
| `apps/web-front` | B2B SaaS dashboard (Next.js) — automation, messaging, analytics, agents |
| `apps/web-admin` | Admin dashboard (Next.js) |
| `apps/web-client` | B2C customer portal (Next.js) |
| `apps/web-client-edge` | Edge layer for web-client (CloudFront) |
| `apps/web-front-edge` | Edge layer for web-front (CloudFront) |
| `apps/function` | Lambda functions + SST infra definitions |
| `apps/infra` | SST infrastructure deployment for web apps, APIs, services |
| `apps/{company}` | FastAPI REST API + background workers (Python) |
| `apps/messaging` | SST v2 messaging pipeline — SMS/Twilio, events |
| `apps/cdp` | RudderStack CDP on GKE (Pulumi) |
| `apps/cube` | Cube.js analytics backend |
| `apps/platforms` | Shopify integration APIs |
| `apps/rest` | REST API infrastructure (SST-managed) |
| `apps/docs` | MCP documentation site |

### Libs

| Lib | Purpose |
|-----|---------|
| `libs/core/*` | Domain logic — 20+ sub-libs: account, ads, ai, auth, billing, brand, conversation, dashboard, email, integration, kb, mcp, messaging, tracking, workflow |
| `libs/web` | Shared web utils, API clients, hooks, **shared types** (`libs/web/src/types/`) |
| `libs/ui` | Tailwind component library / design system |
| `libs/db` | Prisma schema, migrations, seed (PostgreSQL) |
| `libs/infra` | Shared SST infra utils, secrets (`libs/infra/secret.ts`) |
| `libs/api/shopify` | Shopify API client |
| `libs/schema` | JSON/TS schemas and validation |
| `libs/util` | Common utilities |

### Key Infra Files (`apps/function/infra/`)

`tables.ts` (DynamoDB defs), `agents.ts` (queues, lambdas, API routes), `messaging.ts` (EventBridge), `event.ts` (hook API), `cockpit.ts` (cockpit API), `etl.ts` (ETL pipelines), `conversation.ts`, `brand.ts`, `realtime.ts`, `mcp.ts`, `shortener.ts`, `flow.ts`, `index.ts` (entry point)

### Tooling

Nx 20.6, Bun, SST Ion (serverless), Prisma (Postgres ORM), Next.js v16, React 19, Tailwind v4

---

## Architecture Principles (HARD — enforce in every story)

1. **Start simple, add incrementally** — ship smallest useful version. Complexity in follow-up PRs
2. **Preserve existing behavior** — extend, don't rewrite. Optional params, additive types, new branches. Never change how existing callers behave
3. **DynamoDB for new data** — unless feature genuinely requires relational joins/transactions with existing Postgres tables. Define in `apps/function/infra/tables.ts`. Avoids Prisma migrations + schema coupling
4. **Isolate the feature** — infra → `infra/<feature>.ts`, backend → `src/<feature>/`, frontend → `app/<feature>/`, API → `app/api/<feature>/`, types → `libs/web/src/types/<feature>.ts`, domain → `libs/core/<feature>/`
5. **Gate with permissions** — admin roles or beta permissions for incremental rollout before enabling for all

---

## Reference Implementation: Agents Feature

Gold standard for adding features to {PRODUCT}:
- DynamoDB tables in `infra/tables.ts` — `id: string` hash key, SST `link` to Lambdas + Next.js
- SQS FIFO queue + DLQ in `infra/agents.ts` for async processing
- Lambda processor subscribed to SQS — `src/agents/processor.ts`
- EventBridge subscription on `messagingEventBus` in `infra/messaging.ts` (~12 lines)
- Hook API route — `POST /agents/events` on existing `hookApi`
- Next.js API routes — thin CRUD in `app/api/automation-rules/` using DynamoDBDocumentClient
- Frontend isolation — entire UI under `app/agents/` with own layout, context, nav
- Admin gating — `session.role?.includes('admin')`, `adminOnly` nav filtering
- Secrets linking — `agentsSecrets` array from `libs/infra/secret.ts`
- Shared types — `libs/web/src/types/automation-rules.ts`

---

## Code Patterns Catalog

### DynamoDB Table (`apps/function/infra/tables.ts`)
```typescript
export const myTable = new sst.aws.Dynamo('MyTable', {
  fields: { id: 'string' },
  primaryIndex: { hashKey: 'id' },
});
// Composite key + TTL:
export const myLogTable = new sst.aws.Dynamo('MyLog', {
  fields: { pk: 'string', sk: 'string' },
  primaryIndex: { hashKey: 'pk', rangeKey: 'sk' },
  ttl: 'expiresAt',
});
```

### SQS FIFO Queue + DLQ
```typescript
const myDLQ = new sst.aws.Queue('MyDLQ', { fifo: { contentBasedDeduplication: false } });
export const myQueue = new sst.aws.Queue('MyQueue', {
  fifo: { contentBasedDeduplication: false },
  visibilityTimeout: '3 minutes',
  dlq: { queue: myDLQ.arn, retry: 3 },
});
```

### Lambda + Queue Subscription
```typescript
const myProcessor = new sst.aws.Function('MyProcessor', {
  handler: 'apps/function/src/<feature>/processor.handler',
  timeout: '2 minutes',
  link: [myQueue, myTable, ...secrets],
  tags: { application: '<feature>' },
});
myQueue.subscribe(myProcessor.arn);
```

### EventBridge Subscription (`infra/messaging.ts`)
```typescript
messagingEventBus.subscribe('MyHandler', {
  handler: 'apps/function/src/<feature>/event.handler',
  link: [myQueue, myTable, ...secrets],
}, {
  pattern: { detailType: ['event.type1', 'event.type2'] },
});
```

### Cron (Scheduled Lambda)
```typescript
new sst.aws.Cron('MyCron', {
  schedule: 'rate(1 hour)',
  function: { handler: 'apps/function/src/<feature>/scheduler.handler', timeout: '5 minutes', link: [...] },
});
```

### Next.js API Route (DynamoDB CRUD)
```typescript
import { DynamoDBDocumentClient, ScanCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { Resource } from 'sst';
const dynamoClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
// GET: ScanCommand with FilterExpression on Resource.MyTable.name
// PUT: PutCommand with Item on Resource.MyTable.name
```

### Permission Gating
```typescript
// Page level:
if (!session.role?.includes('admin')) redirect(Routes.front.home);
// Nav filtering:
const navItems = allItems.filter(i => i.adminOnly ? hasAdminRole : true);
```

### Shared Types (`libs/web/src/types/<feature>.ts`)
Types imported by both frontend and backend. Union types, entity types, option arrays for UI dropdowns, validation constants.

---

## Step 1: Parse Input

If `$ARGUMENTS` provided, use as feature description. Extract optional Linear issue ID (e.g., "DEV-123 notification system").

If empty, ask: "What {PRODUCT} feature do you want to plan?"

## Step 2: Research {PRODUCT} Codebase

**This is the key step.** Research BEFORE asking questions.

**2a. Semantic search:**
```bash
qmd vsearch "<feature keywords>" -c {product} --json -n 15
```

**2b. Read relevant infra:**
- `repos/private/{product}/apps/function/infra/index.ts` — what's wired
- `repos/private/{product}/apps/function/infra/tables.ts` — existing DynamoDB tables
- Any infra file related to the feature area

**2c. Find similar features:**
Based on search results, read 2-3 most relevant existing feature directories to understand patterns.

**2d. Check types and domain logic:**
- Search `libs/web/src/types/` for relevant type defs
- Search `libs/core/` for relevant domain modules
- Search `libs/db/src/constants/` for relevant constants

**2e. Git history:**
```bash
cd repos/private/{product} && git log --oneline -20 -- <relevant paths>
```

**2f. Check existing PRDs:**
```bash
qmd search "<feature keywords> prd" --json -n 5
```

## Step 3: Present Research Findings

```
## {PRODUCT} Codebase Research

**Related existing code:**
- {list of relevant files/modules found}

**Existing patterns to follow:**
- {e.g., "DynamoDB table pattern in tables.ts: hash key id, optional sort key"}

**Integration points identified:**
- {e.g., "EventBridge messagingEventBus in infra/messaging.ts"}

**Apps affected:**
- {which apps under apps/ and libs/}

**Potential risks:**
- {overlaps, hot paths, shared file modifications}

**Open questions from research:**
- {what research couldn't determine}
```

## Step 4: Focused Interview (2 batches)

Research replaces most generic discovery. Ask only what research couldn't determine.

**Batch 1: Problem + Success**
1. Core problem or goal?
2. What does success look like? (measurable)
3. Who benefits? (brand admins, internal ops, end users)

**Batch 2: Scope + Decisions**
4. MVP scope — what's in, what's explicitly out?
5. Data store? Default: DynamoDB. Only Postgres if joins needed
   A. DynamoDB (default — no migrations)
   B. Postgres (needs relational joins with existing tables)
   C. Both (hybrid)
6. New infra needed?
   A. DynamoDB tables only
   B. Tables + SQS queue + Lambda processor
   C. Tables + EventBridge subscription
   D. Other: [specify]
7. Rollout strategy?
   A. Permission gated (admin/beta — default)
   B. Immediate (all users)
   C. Staged (specific brands first)
8. Linear issue? (if not in $ARGUMENTS)
   A. Yes: [issue ID]
   B. No, create one

Users respond: "1A, 2C, 3B" etc.

## Step 5: Generate PLAN-{name}.md

Write to `repos/private/{product}/PLAN-{name}.md`:

```markdown
# PLAN: {Feature Name}

## Problem
{1-2 sentences}

## Solution
{2-3 sentences describing the approach}

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Data store | DynamoDB / Postgres | {why} |
| Integration point | {where it connects} | {why} |
| Rollout strategy | Permission gated / Immediate | {why} |
| New infra | {tables, queues, etc.} | {what they do} |
| Apps affected | {list} | {what changes in each} |

## Changes Overview

### New Files
| File | Purpose |
|------|---------|
| `apps/function/infra/{feature}.ts` | SST infra definition |
| `apps/function/src/{feature}/handler.ts` | Lambda handler |

### Modified Files
| File | Change | Backward compat |
|------|--------|-----------------|
| `apps/function/infra/index.ts` | Import new infra module | Additive only |

## Implementation Steps

### US-001: {title}
{What this step does, why it comes first}
- Creates: {files}
- Modifies: {files}
- Verifiable by: {how to check}

### US-002: {title}
{depends on US-001}
...

## Code Patterns to Follow
{Include ONLY patterns relevant to this feature, from the catalog above}

## Non-Goals
{What's explicitly out of scope}

## Open Questions
{Remaining unknowns}

---
*HQ tracking: `companies/{company}/projects/{name}/prd.json`*
*Execute: `/run-project {name}` or `/execute-task {name}/US-001`*
```

## Step 6: Generate prd.json + README.md

Create `companies/{company}/projects/{name}/` with two files.

### prd.json (source of truth)

```json
{
  "name": "{name}",
  "description": "{1-sentence goal}",
  "branchName": "feature/{name}",
  "userStories": [
    {
      "id": "US-001",
      "title": "{title}",
      "description": "As a {user}, I want {feature} so that {benefit}",
      "acceptanceCriteria": [
        "{Specific verifiable criterion}",
        "bun run test, bun check, bun lint all pass"
      ],
      "e2eTests": [],
      "priority": 0,
      "passes": false,
      "files": ["{repo-relative paths from PLAN Changes Overview}"],
      "labels": [],
      "dependsOn": [],
      "notes": "",
      "model_hint": ""
    }
  ],
  "metadata": {
    "createdAt": "{ISO8601}",
    "company": "{company}",
    "goal": "{Overall project goal}",
    "successCriteria": "{Measurable outcome}",
    "qualityGates": ["bun run test", "bun check", "bun lint"],
    "repoPath": "repos/private/{product}",
    "baseBranch": "main",
    "linearCredentials": "companies/{company}/settings/linear/credentials.json",
    "planPath": "repos/private/{product}/PLAN-{name}.md",
    "architectureDecisions": ["{derived from PLAN Key Decisions table}"],
    "relatedWorkers": [],
    "knowledge": ["{relevant file paths discovered in research}"]
  }
}
```

**Story rules:**
- Every story starts `passes: false`
- Every story includes `"bun run test, bun check, bun lint all pass"` in AC
- UI stories also include `"Verify in browser using browser tools"` in AC
- `files[]` populated from PLAN Changes Overview
- Order: infra → backend → frontend → cleanup
- Each story completable in one AI session

### README.md (derived from prd.json)

```markdown
# {name}

**Goal:** {metadata.goal}
**Success:** {metadata.successCriteria}
**Repo:** repos/private/{product}
**Branch:** {branchName}

## Technical Plan
See [PLAN-{name}.md](../../../repos/private/{product}/PLAN-{name}.md) for detailed implementation plan with key decisions, file paths, and code patterns.

## Overview
{description}

## Architecture Decisions
{metadata.architectureDecisions as bullet list}

## Quality Gates
- `bun run test`
- `bun check`
- `bun lint`

## User Stories

### US-001: {title}
**Priority:** {priority} | **Depends on:** {dependsOn or "None"}

**Acceptance Criteria:**
- [ ] {criterion}

## Non-Goals
{from PLAN}

## Open Questions
{from PLAN}
```

## Step 7: Sync to Linear ({Product})

1. Read `companies/{company}/settings/linear/credentials.json`
2. Read `companies/{company}/settings/linear/config.json`
3. **Validate `workspace === "voyage"`** (cross-posting guard — ABORT if mismatch)
4. Create Linear project → link to best-fit initiative
5. Create one issue per story (team routing per CLAUDE.md {Product} table, default DEV)
6. Store `linearProjectId` in prd.json metadata, `linearIssueId` on each story
7. Best-effort — log errors, never block

## Step 8: Sync Board

Read `companies/{company}/board.json`. Upsert entry:
- Match by `prd_path === "companies/{company}/projects/{name}/prd.json"`
- Set `status: "prd_created"`, update timestamps
- If not found, append new entry

## Step 9: Register with Orchestrator

Read `workspace/orchestrator/state.json`. Append/update:
```json
{
  "name": "{name}",
  "state": "READY",
  "prdPath": "companies/{company}/projects/{name}/prd.json",
  "updatedAt": "{ISO8601}",
  "storiesComplete": 0,
  "storiesTotal": N,
  "checkedOutFiles": []
}
```

## Step 10: Learn + Reindex

1. `npx tsx scripts/prd-to-beads.ts --project={name}` (silent)
2. Run `/learn` with build-activity scope
3. `qmd update 2>/dev/null || true`
4. Regenerate `companies/{company}/projects/INDEX.md`

## Step 11: Confirm & STOP

```
Project **{name}** created with {N} user stories.

Files:
  companies/{company}/projects/{name}/prd.json   (orchestrator source of truth)
  companies/{company}/projects/{name}/README.md   (human-readable view)
  repos/private/{product}/PLAN-{name}.md                  (technical implementation plan)

Linear: {project URL} ({N} issues in {team})

To execute (new session):
  /run-project {name}
  /execute-task {name}/US-001
```

**Then run `/handoff` and end session.** Do NOT implement.

---

## Rules

- **Research before questions** — Step 2 BEFORE Step 4
- **prd.json is orchestrator truth** — PLAN-{name}.md is implementation reference
- **All stories start `passes: false`**
- **Do NOT use EnterPlanMode** — this command IS planning
- **Do NOT use TodoWrite** — PRD stories track tasks
- **HARD BLOCK: Do NOT implement** — ONLY create PLAN + PRD files. NEVER edit {PRODUCT} source during /{product}-prd
- **STOP after creation** — run `/handoff`, end session. Execution requires fresh session
- **Company hardcoded** — always {Company}, always `repos/private/{product}`, always {Product} Linear
- **Architecture principles are HARD** — every story must comply with the 5 principles
- **No speculative features** — only plan what was asked for
- **Full file paths** — implementer should start coding from the PLAN
- **Flag risks** — Prisma migrations, hot code paths, shared infra modifications
- **Backward compatibility** — for every modified file, explain how existing callers are unaffected
