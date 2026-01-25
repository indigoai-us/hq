# Changelog

## v2.0.0 (2026-01-25)

Major release: Project orchestration, content pipeline, and 18 production workers.

### Project Orchestration
- **`/run-project`** - Execute entire projects via Ralph loop
- **`/execute-task`** - Worker-coordinated task execution
- **`/prd`** - Enhanced PRD generation with HQ context awareness
- `workspace/orchestrator/` - Project state tracking
- `workspace/learnings/` - Captured insights from executions

### Content Pipeline
- **`/contentidea`** - Build raw idea into full content suite (one-liner → post → article)
- **`/suggestposts`** - Research-driven post suggestions aligned with goals
- **`/scheduleposts`** - Smart timing for posting based on content inventory
- `social-content/drafts/` - Platform-specific draft storage (x/, linkedin/)
- `workspace/content-ideas/inbox.jsonl` - Idea capture

### Dev Team (13 workers)
Complete development team for autonomous coding:
- `project-manager` - PRD lifecycle, issue selection
- `task-executor` - Analyze & route to workers
- `architect` - System design, API design
- `backend-dev` - API endpoints, business logic
- `frontend-dev` - React/Next components
- `database-dev` - Schema, migrations
- `qa-tester` - Testing, validation
- `motion-designer` - Animations, polish
- `infra-dev` - CI/CD, deployment
- `code-reviewer` - PR review, quality gates
- `knowledge-curator` - Update knowledge bases
- `product-planner` - Technical specs

### Content Team (5 workers)
Specialized content analysis workers:
- `content-brand` - Voice, messaging, tone
- `content-sales` - Conversion copy, CTAs
- `content-product` - Technical accuracy
- `content-legal` - Compliance, claims
- `content-shared` - Shared utilities (library)

### New Commands
- **`/search`** - Full-text search across threads, checkpoints, PRDs, workers
- **`/design-iterate`** - Design A/B testing with git branches
- **`/metrics`** - Worker execution metrics
- **`/cleanup`** - Audit and clean HQ
- **`/exit-plan`** - Force exit from plan mode

### Auto-Checkpoint
- Sessions auto-save to `workspace/threads/`
- Format: `T-{timestamp}-{slug}.json`
- Triggers: worker completion, git commit, file generation
- Never lose work to context limits

### Knowledge Bases
- `knowledge/hq-core/` - Thread schema, workspace patterns
- `knowledge/ai-security-framework/` - Security best practices
- `knowledge/design-styles/` - Design guidelines + swipes
- `knowledge/dev-team/` - Development patterns
- `knowledge/loom/` - Agent patterns reference
- Updated `knowledge/workers/` with templates

### Registry
- Upgraded to version 2.0 format
- Added team grouping
- Worker type taxonomy (CodeWorker, ContentWorker, SocialWorker, ResearchWorker, OpsWorker, Library)

---

## 2026-01-21

### PRD-First Planning
Added rules to redirect Claude's built-in planning to HQ's PRD system.

**Problem:** Claude Code triggers session-local plan mode for "complex" tasks. These plans live in `.claude/plans/`, are ephemeral, and compete with HQ's persistent PRD workflow.

**Solution:** Skills now redirect to `/newproject` when complex planning is needed. Plans belong in `prd.json` files that persist across sessions and integrate with `/ralph-loop`.

**Changes:**
- All skills: Redirect `EnterPlanMode` → suggest `/newproject` instead
- All skills: Redirect `TodoWrite` → PRD features track tasks

**Result:** Planning happens in the right place (PRD), not session-local files.
