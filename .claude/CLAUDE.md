# HQ - Personal OS for AI Workers

Personal OS for orchestrating AI workers, projects, and content.

## Key Files

- `agents.md` - Your profile, preferences, companies (load for writing/communication tasks)
- `workers/registry.yaml` - Worker index
- `USER-GUIDE.md` - Full command reference

## Structure

```
HQ/
├── .claude/commands/   # 16 slash commands
├── agents.md           # Your profile
├── companies/          # Company-scoped resources (optional)
│   └── {company}/      # settings/, data/, knowledge/
├── knowledge/          # HQ-level (Ralph, workers, security, pure-ralph, projects)
├── projects/           # Project PRDs
├── workers/            # Worker definitions
│   ├── dev-team/       # 13 code workers
│   └── content-*/      # 5 content workers
├── social-content/     # Content drafts
│   └── drafts/         # x/, linkedin/
└── workspace/
    ├── checkpoints/    # Manual saves
    ├── threads/        # Auto-saved sessions
    ├── orchestrator/   # Project state
    ├── learnings/      # Task insights
    └── content-ideas/  # Idea capture
```

## Workers

Workers are autonomous agents with defined skills. They *do things*.

| Type | Purpose | Examples |
|------|---------|----------|
| CodeWorker | Implement features, fix bugs | dev-team/* |
| ContentWorker | Draft content, maintain voice | content-brand, content-sales |
| SocialWorker | Post to platforms | x-worker |
| ResearchWorker | Analysis, market research | analyst |
| OpsWorker | Reports, automation | cfo-worker |

**Run a worker:** `/run {worker} {skill}`

**Build a worker:** `/newworker`

## Commands

### Session Management
| Command | Purpose |
|---------|---------|
| `/checkpoint` | Save state + context status |
| `/handoff` | Prepare for fresh session |
| `/reanchor` | Pause and realign |
| `/nexttask` | Find next thing to work on |
| `/remember` | Capture learnings as rules in relevant files |

### Projects
| Command | Purpose |
|---------|---------|
| `/prd` | Generate PRD through discovery |
| `/run-project` | Execute project via Ralph loop |
| `/execute-task` | Run single task with workers |

### Workers
| Command | Purpose |
|---------|---------|
| `/run` | List/execute workers |
| `/newworker` | Create new worker |
| `/metrics` | View execution metrics |

### System
| Command | Purpose |
|---------|---------|
| `/search` | Semantic + full-text search across HQ (qmd-powered) |
| `/search-reindex` | Reindex and re-embed HQ for qmd search |
| `/cleanup` | Audit and clean HQ |
| `/setup` | Interactive setup wizard |
| `/exit-plan` | Force exit from plan mode |

## Auto-Checkpoint (PostToolsHook)

Sessions auto-save to `workspace/threads/` after:
- Worker skill completion (via `/run`)
- Git commit
- File generation (reports, social drafts)
- Significant file edits in project repos

**Thread Format:** `T-{timestamp}-{slug}.json`

**Why:** Prevents lost work, enables session resumption, provides audit trail.

## Auto-Handoff (Context Limit)

When context usage reaches 70% (remaining drops to 30%), automatically run `/handoff`.

**Rules:**
- Check context status line — when `remaining_percentage` ≤ 30, trigger handoff
- Before handoff, finish current atomic task (don't interrupt mid-edit)
- Notify user: "Context at {X}% remaining. Running /handoff to preserve continuity."
- Run `/handoff` with summary of remaining work
- This overrides manual handoff — don't wait for user to request it

## Search (qmd)

HQ can be indexed with [qmd](https://github.com/tobi/qmd) for local semantic + full-text search.

**Commands (run via Bash tool):**
- `qmd search "<query>" --json -n 10` — BM25 keyword search (fast, default)
- `qmd vsearch "<query>" --json -n 10` — semantic/conceptual search
- `qmd query "<query>" --json -n 10` — hybrid BM25 + vector + re-ranking (best quality, slower)

**Slash commands:** `/search <query>`, `/search-reindex`

## Core Principles

1. **Infrastructure scales, effort doesn't** - Build reusable systems
2. **Workers should grow smarter** - Capture learnings in knowledge bases
3. **Context is precious** - Checkpoint often, don't let work evaporate
4. **Test before ship** - If you can't verify it works, you can't ship it
5. **E2E tests prove it works** - Unit tests check code; E2E tests check the product

## Testing Requirements (MANDATORY)

**HARD RULE: Nothing ships without passing tests.**

**Full E2E Testing Guide:** [knowledge/testing/e2e-cloud.md](../knowledge/testing/e2e-cloud.md)

### Before Marking Any Task Complete

1. **Write tests FIRST** - Tests define what "done" means
2. **Run all tests** - New and existing tests must pass
3. **Verify in context** - Run the actual feature, not just unit tests
4. **E2E for user flows** - Anything a user touches needs E2E coverage

### E2E Testing Standards

For web apps:
- Use Playwright for browser automation
- Test actual user flows end-to-end
- Screenshot on failure for debugging
- Test on the actual URLs the user will see

For CLI apps:
- Run the actual binary, not source
- Test the URLs it opens in a real browser
- Verify the full flow works (CLI → browser → callback)

### Quality Gate Checklist

Before any PR or task completion:
- [ ] Unit tests written and passing
- [ ] E2E tests written and passing
- [ ] Manual verification performed
- [ ] No regressions in existing tests

### Test Failure = Task Incomplete

If tests fail, the task is NOT done. Fix the code or fix the tests, but never skip them.

## Pure Ralph Learnings

Cross-project patterns discovered through `/pure-ralph` execution. These learnings transcend individual tasks and apply across HQ.

<!--
Format for adding learnings:

### [Category] Title
**Discovered:** Project name or context
**Pattern:** What to do
**Impact:** Why this matters across projects
-->

### [PRD] Keep Acceptance Criteria Verifiable
**Discovered:** purist-ralph-loop project
**Pattern:** Write acceptance criteria that can be checked programmatically or by reading specific files/outputs
**Impact:** Enables autonomous verification; vague criteria cause task failures or require human intervention

### [Workflow] Single-Task Focus Prevents Context Bloat
**Discovered:** purist-ralph-loop project
**Pattern:** Each Claude session handles exactly one task, reads only what's needed
**Impact:** Fresh context per task prevents accumulated confusion; easier to debug failures

### [Self-Improvement] Two-Level Learning System
**Discovered:** purist-ralph-loop project
**Pattern:** Task-level learnings go in workflow prompts; cross-project learnings go in CLAUDE.md
**Impact:** Keeps learnings appropriately scoped; prevents prompt bloat while capturing valuable insights

### [PRD] Script/Schema Compatibility
**Discovered:** hq-installer launch failure
**Pattern:** When updating PRD schema (e.g., `features` → `userStories`), also update all scripts that consume PRDs
**Impact:** Schema mismatches cause silent failures; pure-ralph found 0/0 tasks because script expected `features` but PRD had `userStories`

### [Workflow] Pure Ralph Must Switch Branches
**Discovered:** hq-installer launch failure
**Pattern:** Pure Ralph must checkout the branch specified in `prd.branchName` before starting work
**Impact:** Without branch switching, work happens on wrong branch, PRs go to wrong place, changes get mixed

### [PRD] Include baseBranch for Feature Branches
**Discovered:** electron-direct-auth setup
**Pattern:** PRDs should include `metadata.baseBranch` (e.g., "staging", "main") so Pure Ralph creates feature branches from the correct base
**Impact:** Without baseBranch, new feature branches are created from whatever branch happens to be checked out, leading to stale code or wrong base

### [Testing] E2E Tests Must Cover Real User Flows
**Discovered:** indigo-cli-tools webauth blank screen issue
**Pattern:** Write E2E tests that exercise the actual user flow - run the CLI, open the URL in Playwright, verify the page renders correctly
**Impact:** Without E2E tests, broken features ship to users; unit tests pass but the product doesn't work

### [Testing] Test Before Marking Complete
**Discovered:** indigo-cli-tools webauth blank screen issue
**Pattern:** Never mark a task as `passes: true` without running tests AND manually verifying the feature works
**Impact:** Shipping untested code wastes user time and erodes trust; catching issues before shipping is 10x cheaper than debugging in production

### [PRD] Structure PRDs for Test-First Execution
**Discovered:** protofit-coach-behavior project
**Pattern:** PRDs should include: (1) E2E tests inline with each user story, (2) T-X.0 tasks that write tests BEFORE T-X.1+ implementation tasks, (3) verification commands for every task, (4) Phase 0 that creates all test infrastructure
**Impact:** Ensures tests exist before implementation; prevents "will add tests later" that never happens; makes acceptance criteria executable

### [PRD] Define What "Passes" Means Explicitly
**Discovered:** protofit-coach-behavior project
**Pattern:** PRDs should include explicit verification criteria - what console output means success, what exit codes to expect, examples of passing vs failing output
**Impact:** Removes ambiguity about task completion; executor knows exactly what to check; prevents premature task completion

### [Testing] Test Phase 0 Pattern
**Discovered:** protofit-coach-behavior project
**Pattern:** Always start projects with a "Phase 0 - Test Infrastructure" that writes ALL test files first (they will fail, that's expected)
**Impact:** Forces test-first thinking; tests define the contract before implementation; makes it impossible to skip testing
