# GHQ Autonomous Scheduler

The scheduler runs companies autonomously, dispatching Claude Code agents to work on tasks and only escalating to the user via decision tasks.

## Architecture

```
Cron / launchd (every 15 min)
  |
  v
scheduler.sh
  |
  +-- Phase 1: Parse config (scheduler.yaml + manifest.yaml)
  +-- Phase 2: Check constraints (blocked hours, max concurrent)
  +-- Phase 3: Recover dead agents (pid check -> retry or escalate)
  +-- Phase 4: Dispatch new agents (one per enabled company)
  +-- Phase 5: Digest (at configured digest_hour)
```

## Components

### scheduler.sh (core daemon)

**Location:** `loops/scripts/scheduler.sh`

The main entry point. Designed to run via cron/launchd every 15 minutes.

**What it does:**

1. Reads `companies/manifest.yaml` for enabled companies
2. Reads `.claude/scheduler.yaml` for global config
3. Checks blocked hours (exits with code 3 if blocked)
4. Generates daily digest at the configured hour
5. Detects dead agents via pid files, triggers recovery
6. Counts running agents, respects `max_concurrent_agents`
7. For each enabled company without a running agent:
   - Queries bd for the top-ranked open unblocked task
   - Writes a lockfile (`loops/agents/{company}.lock`) with the task ID
   - Spawns a Claude Code agent running `/run-loop {task-id}`
   - Writes the agent PID to `loops/agents/{company}.pid`

**Flags:**
- `--dry-run` -- Show dispatch plan without spawning agents
- `--help` -- Show usage

**Environment:**
- `GHQ_ROOT` -- Override GHQ root directory
- `BD_CMD` -- Override bd command path

**Exit codes:**
- `0` -- Success
- `1` -- Invalid arguments
- `2` -- Configuration error
- `3` -- Blocked hours (did not dispatch)

### strategy-planner.sh (task generation)

**Location:** `loops/scripts/strategy-planner.sh`

Reads `companies/{company}/strategy.yaml` and creates draft tasks to fill cadence gaps. Idempotent -- running twice creates no duplicates.

**What it does:**

1. Parses `strategy.yaml` for cadence definitions (e.g., "2 videos/week")
2. Queries bd for existing tasks in the current cadence period
3. Compares against target counts
4. Creates draft tasks for any gaps found
5. Tags each task with `cadence_id`, `cadence_period`, `cadence_slot` metadata

**Flags:**
- `--company <slug>` -- Plan for one company
- `--all` -- Plan for all enabled companies
- `--dry-run` -- Show what would be created
- `--strategy-file <path>` + `--epic <id>` -- Direct mode (skip manifest lookup)

### digest.sh (daily summary)

**Location:** `loops/scripts/digest.sh`

Generates a daily markdown digest at `loops/digests/YYYY-MM-DD.md`.

**Sections:**
- Summary table (completed, in-progress, blocked, decisions, open counts)
- Per-company breakdown:
  - Completed tasks (closed today)
  - In-progress tasks
  - Blocked tasks (with dependency info)
  - Pending decisions (with `bd-resolve` commands)
  - Open backlog (top 5)

**Flags:**
- `--date YYYY-MM-DD` -- Generate for a specific date
- `--dry-run` -- Print to stdout, do not write file

### check-escalation.sh (policy engine)

**Location:** `loops/scripts/check-escalation.sh`

Checks a company's escalation policy before an agent takes action.

**Policy types:**
- `always_ask` -- Always escalate to user
- `autonomous` -- Agent proceeds freely
- `ask_once_then_remember` -- Ask first time, remember answer
- `ask_until_confident` -- Ask until N consistent answers recorded

**Returns:** `ask` or `autonomous` (stdout)

### bd-resolve.sh (decision resolution)

**Location:** `loops/scripts/bd-resolve.sh`

Resolves a decision task with a user answer. Closes the decision, records the answer in metadata, writes to preferences.yaml for learning.

### read-preferences.sh / write-preference.sh

**Location:** `loops/scripts/read-preferences.sh`, `loops/scripts/write-preference.sh`

Read and write user preferences for the ask_once_then_remember and ask_until_confident escalation policies.

## Configuration

### .claude/scheduler.yaml (global)

```yaml
max_concurrent_agents: 2      # Max agents across all companies
cooldown_after_failure: 900    # Seconds before retrying after failure
daily_budget: 50.00            # USD spend cap per day
blocked_hours:                 # UTC hours when scheduler must not dispatch
  - 2
  - 3
  - 4
digest_hour: 23                # UTC hour for daily digest (-1 to disable)
```

### companies/manifest.yaml (per-company)

Each company entry includes scheduler config:

```yaml
company-slug:
  symlink: company-slug
  epic: ghq-xxx              # Root epic for this company's tasks
  scheduler:
    enabled: true             # Enable/disable autonomous scheduling
    max_agents: 1             # Max concurrent agents for this company
```

### companies/{slug}/strategy.yaml (cadence planning)

```yaml
cadences:
  - id: weekly-video
    frequency: "2/week"
    goal: "Publish 2 videos per week"
    task_template:
      title: "Video production"
      description: "Produce and publish a video"
      type: task
      priority: 2
      labels:
        - video
        - content
```

### companies/{slug}/policies/escalation.yaml

```yaml
default_policy: always_ask
policies:
  deploy:
    type: always_ask
    description: "Always ask before deploying"
  commit:
    type: autonomous
    description: "Agent may commit freely"
  refactor:
    type: ask_once_then_remember
    description: "Ask first time, then remember"
  pricing:
    type: ask_until_confident
    confidence_threshold: 3
    description: "Ask until 3 consistent answers"
```

## File Layout

```
.claude/
  scheduler.yaml              # Global scheduler config

companies/
  manifest.yaml               # Company registry with scheduler flags
  {slug}/
    strategy.yaml             # Cadence definitions for task generation
    policies/
      escalation.yaml         # Action escalation rules
      preferences.yaml        # Learned user preferences (auto-managed)

loops/
  agents/
    {company}.pid             # PID of running agent
    {company}.lock            # Task ID the agent is working on
    {company}.log             # Agent stdout/stderr
  digests/
    YYYY-MM-DD.md             # Daily digest files
  scripts/
    scheduler.sh              # Core scheduler daemon
    strategy-planner.sh       # Strategy-to-task planner
    digest.sh                 # Daily digest generator
    check-escalation.sh       # Escalation policy checker
    bd-resolve.sh             # Decision resolver
    read-preferences.sh       # Read user preferences
    write-preference.sh       # Write user preference
    test-scheduler.sh         # Unit tests for scheduler
    test-strategy-planner.sh  # Unit tests for strategy planner
    test-digest.sh            # Unit tests for digest
    test-escalation.sh        # Unit tests for escalation
    test-integration.sh       # End-to-end integration test
```

## Failure Recovery

When the scheduler detects a dead agent (pid file exists but process is gone):

1. Reads the lockfile to identify which task the agent was working on
2. Checks task status via bd:
   - **Closed**: Clean exit. Removes pid + lock files.
   - **Not in_progress**: Unexpected state. Cleans up files.
   - **in_progress**: Agent crashed.
3. For crashed agents:
   - Increments `retryCount` in task metadata
   - If retries <= 3: moves task back to `open` for retry
   - If retries > 3: blocks task, creates a decision task for user review

## Scheduling (launchd)

The scheduler runs on macOS via launchd. The plist is at the repo root:

**File:** `com.ghq.scheduler.plist`

**Install:**
```bash
cp com.ghq.scheduler.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.ghq.scheduler.plist
```

**Uninstall:**
```bash
launchctl unload ~/Library/LaunchAgents/com.ghq.scheduler.plist
rm ~/Library/LaunchAgents/com.ghq.scheduler.plist
```

**Check status:**
```bash
launchctl list | grep com.ghq.scheduler
```

**Manual trigger:**
```bash
launchctl start com.ghq.scheduler
```

**Logs:**
```bash
tail -f /tmp/ghq-scheduler.log
tail -f /tmp/ghq-scheduler-err.log
```

The plist runs scheduler.sh every 15 minutes (900 seconds) as a background process with low-priority I/O. It has a 10-minute timeout to prevent runaway sessions.

## Testing

### Unit tests (per component)

```bash
./loops/scripts/test-scheduler.sh          # Scheduler dispatch tests
./loops/scripts/test-strategy-planner.sh   # Planner cadence gap tests
./loops/scripts/test-digest.sh             # Digest generation tests
./loops/scripts/test-escalation.sh         # Escalation policy tests
```

### Integration test (full cycle)

```bash
./loops/scripts/test-integration.sh          # Full cycle: plan -> dispatch -> monitor -> recover -> digest
./loops/scripts/test-integration.sh --dry-run # List test scenarios without executing
```

The integration test exercises the complete scheduler lifecycle in an isolated temp directory with a fake bd command. No real agents are spawned. Covers:

1. Enabled company dispatch
2. Clean agent completion (file cleanup)
3. Agent crash with retry (task reopened)
4. Max retries exceeded (decision escalation)
5. Digest generation (valid markdown)
6. Dry-run dispatch planning
7. Strategy planner cadence gap filling
8. Full cycle orchestration (all phases sequential)

## Data Flow

```
strategy.yaml -> strategy-planner.sh -> bd (draft tasks)
                                            |
manifest.yaml -> scheduler.sh --------> bd (rank open tasks)
                     |                      |
                     v                      v
              check constraints      spawn claude /run-loop
                     |                      |
                     v                      v
              dead agent check        loops/agents/{co}.pid
                     |                loops/agents/{co}.lock
                     v
              retry or escalate
                     |
                     v
              digest.sh -> loops/digests/YYYY-MM-DD.md
```
