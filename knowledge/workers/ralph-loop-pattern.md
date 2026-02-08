# Ralph Loop Pattern: Context-Preserving Task Execution

## Problem
Long implementation sessions drain orchestrator context. By task 7, context is 80%+ full, responses slow, risk of forgetting earlier decisions.

## Solution
Orchestrator stays lean. Sub-agents do heavy lifting.

```
┌─────────────────────────────────────┐
│         ORCHESTRATOR                │
│  - Reads PRD                        │
│  - Picks ONE task (passes: false)   │
│  - Spawns sub-agent with task spec  │
│  - Reads checkpoint when done       │
│  - Updates PRD (passes: true)       │
│  - Repeats until all pass           │
│                                     │
│  Context usage: ~10-20% (stays low) │
└─────────────────────────────────────┘
              │
              ▼ spawn
┌─────────────────────────────────────┐
│         SUB-AGENT                   │
│  - Receives: task spec, file paths  │
│  - Implements feature               │
│  - Runs back pressure               │
│  - Commits code                     │
│  - Writes checkpoint                │
│  - Exits                            │
│                                     │
│  Context: fresh per task, 100% avail│
└─────────────────────────────────────┘
```

## Implementation

### 1. Orchestrator Prompt Pattern

When starting a Ralph loop:

```
I am the orchestrator. I will:
1. Read PRD to find next task
2. Use Task tool to spawn implementation agent
3. Wait for checkpoint
4. Update PRD and continue

I will NOT write code directly. Sub-agents handle implementation.
```

### 2. Sub-Agent Spawn Template

```typescript
// Use Task tool with Bash subagent for implementation
Task({
  subagent_type: "Bash",  // or custom "implement" agent
  prompt: `
    ## Task: ${task.id} - ${task.title}

    ## Acceptance Criteria
    ${task.acceptance_criteria.join('\n')}

    ## Files to Create/Modify
    ${task.files.join('\n')}

    ## Instructions
    1. Read existing code in ${task.files[0]} (if exists)
    2. Implement the feature
    3. Run: npm run typecheck && npm run build
    4. If pass, commit with message: "feat(${task.id}): ${task.title}"
    5. Write checkpoint to workspace/checkpoints/${task.id}.json

    ## Checkpoint Format
    {
      "task_id": "${task.id}",
      "completed_at": "ISO8601",
      "summary": "what was done",
      "files_touched": ["paths"],
      "build_passed": true/false
    }

    Exit when checkpoint is written.
  `
})
```

### 3. Worker Config Addition

```yaml
# workers/assistant/email/worker.yaml
execution:
  mode: on-demand
  spawn_per_task: true  # KEY: spawn sub-agent per task
  orchestrator_only: true  # orchestrator doesn't implement directly
```

### 4. HQ CLAUDE.md Addition

Add to `.claude/CLAUDE.md`:

```markdown
## Ralph Loop Execution (Multi-Task Projects)

For projects with 3+ tasks:

1. **Act as orchestrator only** - don't implement directly
2. **Spawn sub-agents** for each task using Task tool
3. **Keep context lean** by delegating implementation

### Spawning Implementation Agents

Use Task tool with focused prompts:

- Include ONLY the current task spec
- List specific files to modify
- Specify back pressure commands
- Require checkpoint on completion

### Example

Instead of:
```
[Orchestrator reads PRD, implements task 1, implements task 2...]
```

Do:
```
[Orchestrator reads PRD]
[Spawns agent for task 1]
[Reads checkpoint]
[Spawns agent for task 2]
[Reads checkpoint]
...
```
```

## Context Budget Guidelines

| Role | Target Context | Activities |
|------|---------------|------------|
| Orchestrator | <30% | Read PRD, spawn agents, read checkpoints |
| Sub-agent | 100% fresh | Implement ONE task, full context available |

## CI E2E Verification (Automated Quality Gate)

**HARD RULE: For repositories with E2E workflows, CI tests MUST pass before setting `passes: true`.**

This ensures code is not just tested locally, but verified in the actual CI environment that runs on every push. Local tests may pass while CI fails due to environment differences, missing dependencies, or race conditions. CI is the source of truth.

### When This Applies

CI E2E verification is **required** when:
- The repository has `.github/workflows/e2e.yml`
- The task involves user-facing changes (UI, CLI, API endpoints)
- The task touches code covered by E2E tests

CI E2E verification is **optional** when:
- Task is documentation-only
- Task is infrastructure/config changes without user impact
- No E2E workflow exists in the repository

### Complete Workflow: Push to Verified Completion

```
Push Code --> Trigger E2E Workflow --> Poll for Results --> Download agent-results.json
                                                                    |
                                              ┌─────────────────────┼──────────────────┐
                                              ▼                     ▼                  ▼
                                          PASSED              FAILED              TIMEOUT
                                     Set passes:true     Fix & re-push       Mark BLOCKED
                                     Log CI run ID      Log failure details   Log timeout
```

### Step 1: Push Your Changes

```bash
git push origin feature/{project-name}
```

### Step 2: Trigger E2E Workflow (if not auto-triggered)

The E2E workflow triggers automatically on push to non-main branches. If it does not trigger automatically, run manually:

```bash
# Trigger E2E workflow for current branch
gh workflow run e2e.yml --ref $(git branch --show-current)
```

### Step 3: Wait for CI Results (15-minute timeout)

```bash
# Wait for the most recent workflow run to complete (max 15 minutes)
MAX_WAIT=900  # 15 minutes in seconds
START_TIME=$(date +%s)
WORKFLOW_NAME="E2E Tests"

echo "Waiting for '$WORKFLOW_NAME' to complete (timeout: 15 minutes)..."

while true; do
    ELAPSED=$(($(date +%s) - START_TIME))
    if [ $ELAPSED -gt $MAX_WAIT ]; then
        echo "TIMEOUT: E2E workflow did not complete within 15 minutes"
        echo "Task BLOCKED - cannot mark as complete without CI verification"
        exit 1
    fi

    # Get the most recent run for current branch
    RUN_STATUS=$(gh run list \
        --workflow=e2e.yml \
        --branch=$(git branch --show-current) \
        --limit=1 \
        --json status,conclusion,headSha \
        --jq '.[0] | "\(.status)|\(.conclusion)|\(.headSha)"')

    STATUS=$(echo "$RUN_STATUS" | cut -d'|' -f1)
    CONCLUSION=$(echo "$RUN_STATUS" | cut -d'|' -f2)
    HEAD_SHA=$(echo "$RUN_STATUS" | cut -d'|' -f3)
    CURRENT_SHA=$(git rev-parse HEAD)

    # Verify the run is for our commit
    if [ "$HEAD_SHA" != "$CURRENT_SHA" ]; then
        echo "Latest run is for different commit. Waiting for new run..."
        sleep 15
        continue
    fi

    case "$STATUS" in
        completed)
            if [ "$CONCLUSION" = "success" ]; then
                echo "E2E tests PASSED - task can be marked complete"
                exit 0
            else
                echo "E2E tests FAILED with conclusion: $CONCLUSION"
                echo "Task BLOCKED - fix failing tests before marking complete"
                exit 1
            fi
            ;;
        in_progress|queued|requested|waiting|pending)
            echo "Status: $STATUS (elapsed: ${ELAPSED}s)..."
            sleep 15
            ;;
        *)
            echo "Unknown status: $STATUS"
            sleep 15
            ;;
    esac
done
```

### Step 4: Download and Parse agent-results.json

After CI completes, download the agent-friendly results artifact for detailed analysis:

```bash
# Get the run ID for the latest E2E run on this branch
RUN_ID=$(gh run list \
    --workflow=e2e.yml \
    --branch=$(git branch --show-current) \
    --limit=1 \
    --json databaseId \
    --jq '.[0].databaseId')

# Download agent-friendly results
gh run download $RUN_ID -n e2e-results-json

# Quick status check
jq '.status' e2e-results-json/agent-results.json
# Output: "passed" or "failed"

# Get summary counts
jq '.summary' e2e-results-json/agent-results.json
# Output: {"total":21,"passed":21,"failed":0,"skipped":0,"flaky":0,"duration":4523}
```

#### Parsing Failures from agent-results.json

When tests fail, extract structured failure details:

```bash
# List all failed tests
jq -r '.failures[] | "\(.suite) > \(.test)"' e2e-results-json/agent-results.json

# Get failure details with error messages
jq '.failures[] | {test: .test, file: "\(.file):\(.line)", error: .error.message}' \
    e2e-results-json/agent-results.json

# Get full stack traces
jq -r '.failures[] | "=== \(.test) ===\n\(.error.stack // "no stack")\n"' \
    e2e-results-json/agent-results.json

# Get screenshot paths for debugging
jq -r '.failures[] | select(.screenshot) | "\(.test): \(.screenshot)"' \
    e2e-results-json/agent-results.json
```

#### Download Failure Artifacts

```bash
# Download screenshots, traces, videos (only uploaded on failure)
gh run download $RUN_ID -n e2e-failures

# View trace locally
npx playwright show-trace e2e-failures/*/trace.zip
```

### Step 5: Handle Results

#### On SUCCESS: Mark Task Complete

```bash
# Set passes: true in PRD with CI verification in notes
# Include run ID and test counts for audit trail
```

Example PRD notes entry:
```json
{
  "passes": true,
  "notes": "Worker: backend-dev. Implemented auth middleware. CI E2E verified: workflow run #123 passed (21/21 tests). Commit: abc1234."
}
```

#### On FAILURE: Keep Task In Progress

1. **DO NOT mark task as complete** -- keep `passes: false`
2. **Download and analyze failure details** from agent-results.json
3. **Log failure details to checkpoint:**

```json
{
  "task_id": "TASK-001",
  "status": "in_progress",
  "ci_verification": {
    "workflow_run_id": 123456,
    "conclusion": "failure",
    "failed_tests": ["Landing Page > page loads with correct title"],
    "error_messages": ["Expected: 'HQ - Download', Received: 'HQ'"],
    "artifacts_downloaded": true
  },
  "completed_at": null,
  "summary": "Implementation done, CI E2E tests failing. 1/21 tests failed."
}
```

4. **Fix the issue** in your code or tests
5. **Commit and push the fix**
6. **Repeat from Step 2**

#### On TIMEOUT (15 minutes): Mark Task BLOCKED

If CI does not produce a result within 15 minutes:

1. **Mark task as BLOCKED** -- do not mark complete or failed
2. **Log timeout to checkpoint:**

```json
{
  "task_id": "TASK-001",
  "status": "blocked",
  "ci_verification": {
    "status": "timeout",
    "timeout_seconds": 900,
    "last_known_status": "in_progress",
    "branch": "feature/my-project",
    "commit": "abc1234"
  },
  "summary": "CI E2E workflow did not complete within 15 minutes. Check GitHub Actions UI for status."
}
```

3. **Recovery:** Check GitHub Actions UI for the actual status, then resume verification manually

### Quick Reference Commands

```bash
# Check if E2E workflow exists
ls .github/workflows/e2e.yml

# Trigger E2E workflow manually
gh workflow run e2e.yml --ref $(git branch --show-current)

# View recent E2E runs for this branch
gh run list --workflow=e2e.yml --branch=$(git branch --show-current)

# Watch a specific run in real-time
gh run watch

# View failed run details
gh run view --log-failed

# Download test artifacts
gh run download --name e2e-failures
gh run download --name e2e-results-json

# One-liner: download results and show failure summary
gh run download $(gh run list --workflow=e2e.yml --limit=1 --json databaseId -q '.[0].databaseId') -n e2e-results-json && \
jq -r '"Status: \(.status)\nTotal: \(.summary.total) | Passed: \(.summary.passed) | Failed: \(.summary.failed)\n" + if (.failures | length > 0) then "Failures:\n" + (.failures | map("  - \(.suite) > \(.test): \(.error.message | split("\n")[0])") | join("\n")) else "All tests passed." end' e2e-results-json/agent-results.json
```

### Emergency Skip (Audit Required)

In rare cases where CI is broken and cannot be fixed immediately, an emergency skip is permitted **only with full documentation**.

#### When Emergency Skip Is Acceptable

- GitHub Actions is experiencing an outage (verify at status.github.com)
- The E2E workflow itself has a bug unrelated to the task's code changes
- External service dependency (Vercel, Browserbase) is down
- Critical hotfix that cannot wait for CI recovery

#### Emergency Skip Process

1. **Verify the CI issue is external** -- not caused by your code changes
2. **Run tests locally** as a substitute verification:
   ```bash
   cd tests/e2e
   BASE_URL=https://preview-url.vercel.app npm test
   ```
3. **Document the skip in task notes** with full justification:

```json
{
  "passes": true,
  "notes": "Worker: backend-dev. Implemented feature X. CI SKIPPED: GitHub Actions outage (status.github.com incident #1234). Manual verification performed: ran Playwright locally against preview URL https://my-app-abc123.vercel.app, all 21 tests passed. Local test output saved to workspace/checkpoints/TASK-001-local-e2e.txt. Issue filed: #456 to re-verify when CI recovers."
}
```

4. **Log the skip in the checkpoint:**

```json
{
  "task_id": "TASK-001",
  "status": "completed_with_skip",
  "ci_verification": {
    "status": "skipped",
    "reason": "GitHub Actions outage - status.github.com incident #1234",
    "manual_verification": {
      "method": "local Playwright against preview URL",
      "url": "https://my-app-abc123.vercel.app",
      "result": "21/21 passed",
      "output_file": "workspace/checkpoints/TASK-001-local-e2e.txt"
    },
    "follow_up_issue": "#456"
  }
}
```

5. **File a follow-up issue** to re-run CI verification when the outage is resolved
6. **Never skip without documentation** -- undocumented skips are a violation of the quality gate

#### What Is NOT an Acceptable Reason to Skip

- "Tests are flaky" -- fix the flaky test instead
- "CI is slow" -- wait for the 15-minute timeout
- "I tested locally and it works" -- CI exists because local testing is insufficient
- "It's just a small change" -- small changes can cause regressions

## Benefits

1. **Orchestrator stays fast** - small context, quick responses
2. **Sub-agents get full context** - fresh start per task
3. **Checkpoints preserve state** - handoff without context loss
4. **Parallel execution possible** - spawn multiple sub-agents
5. **CI verification prevents regressions** - code is proven in production-like environment

## Anti-Patterns

- Orchestrator implements code directly
- Sub-agent works on multiple tasks
- Skipping checkpoints between tasks
- Loading full PRD into sub-agent (only current task)
- Marking `passes: true` without CI E2E verification
- Skipping CI verification without documented audit trail
- Ignoring CI failures and proceeding to next task
