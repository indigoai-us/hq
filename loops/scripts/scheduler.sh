#!/usr/bin/env bash
# scheduler.sh -- Core scheduler daemon for GHQ autonomous operations
#
# Reads companies/manifest.yaml for enabled companies, checks for running
# agents via pid files, ranks open unblocked tasks, and spawns one Claude
# Code agent per company running /run-loop on the top-ranked task.
#
# Usage:
#   scheduler.sh                  # Run scheduler (spawn agents)
#   scheduler.sh --dry-run        # Show dispatch plan without spawning
#   scheduler.sh --help           # Show this help
#
# Environment:
#   GHQ_ROOT    Override GHQ root directory (default: auto-detected)
#   BD_CMD      Override bd command path (default: "bd")
#
# Designed to run via cron every 15 minutes.
#
# Exit codes:
#   0  Success
#   1  Invalid arguments
#   2  Configuration error
#   3  Blocked hours -- scheduler did not dispatch

set -euo pipefail

# ─────────────────────────────────────────────────
# Resolve GHQ root
# ─────────────────────────────────────────────────
if [[ -n "${GHQ_ROOT:-}" ]]; then
  GHQ="$GHQ_ROOT"
else
  SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
  GHQ="$(cd "$SCRIPT_DIR/../.." && pwd)"
fi

# ─────────────────────────────────────────────────
# Constants
# ─────────────────────────────────────────────────
MANIFEST="$GHQ/companies/manifest.yaml"
SCHEDULER_YAML="$GHQ/.claude/scheduler.yaml"
AGENTS_DIR="$GHQ/loops/agents"
LOG_PREFIX="[scheduler]"
BD="${BD_CMD:-bd}"
DRY_RUN=false
MAX_RETRIES=3

# ─────────────────────────────────────────────────
# Usage
# ─────────────────────────────────────────────────
usage() {
  cat <<'EOF'
Usage: scheduler.sh [--dry-run] [--help]

Options:
  --dry-run   Show dispatch plan without spawning agents
  --help      Show this help

Environment:
  GHQ_ROOT    Override GHQ root directory
  BD_CMD      Override bd command path
EOF
}

# ─────────────────────────────────────────────────
# Logging
# ─────────────────────────────────────────────────
log()  { echo "$LOG_PREFIX $(date -u +%H:%M:%S) $*"; }
warn() { echo "$LOG_PREFIX $(date -u +%H:%M:%S) WARN: $*" >&2; }
err()  { echo "$LOG_PREFIX $(date -u +%H:%M:%S) ERROR: $*" >&2; }

# ─────────────────────────────────────────────────
# Parse arguments
# ─────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      err "Unknown argument: $1"
      usage
      exit 1
      ;;
  esac
done

# ─────────────────────────────────────────────────
# Validate configuration files
# ─────────────────────────────────────────────────
if [[ ! -f "$MANIFEST" ]]; then
  err "Manifest not found: $MANIFEST"
  exit 2
fi

if [[ ! -f "$SCHEDULER_YAML" ]]; then
  err "Scheduler config not found: $SCHEDULER_YAML"
  exit 2
fi

# ─────────────────────────────────────────────────
# Ensure agents directory exists
# ─────────────────────────────────────────────────
mkdir -p "$AGENTS_DIR"

# ─────────────────────────────────────────────────
# Parse scheduler.yaml
# ─────────────────────────────────────────────────
SCHEDULER_CONFIG=$(python3 -c "
import yaml, sys, json

with open(sys.argv[1]) as f:
    config = yaml.safe_load(f)

result = {
    'blocked_hours': config.get('blocked_hours', []),
    'digest_hour': config.get('digest_hour', -1)
}
print(json.dumps(result))
" "$SCHEDULER_YAML") || { err "Failed to parse scheduler.yaml"; exit 2; }

BLOCKED_HOURS=$(echo "$SCHEDULER_CONFIG" | jq -r '.blocked_hours[]' 2>/dev/null || true)
DIGEST_HOUR=$(echo "$SCHEDULER_CONFIG" | jq -r '.digest_hour')

# ─────────────────────────────────────────────────
# Check blocked hours
# ─────────────────────────────────────────────────
CURRENT_HOUR=$(date -u +%-H)
for blocked_hour in $BLOCKED_HOURS; do
  if [[ "$CURRENT_HOUR" -eq "$blocked_hour" ]]; then
    log "Blocked hours: current UTC hour ($CURRENT_HOUR) is in blocked_hours list. Not dispatching."
    exit 3
  fi
done

# ─────────────────────────────────────────────────
# Run daily digest if it's digest_hour
# ─────────────────────────────────────────────────
if [[ "$DIGEST_HOUR" != "-1" && "$CURRENT_HOUR" -eq "$DIGEST_HOUR" ]]; then
  TODAY=$(date +%Y-%m-%d)
  DIGEST_FILE="$GHQ/loops/digests/$TODAY.md"
  DIGEST_SCRIPT="$GHQ/loops/scripts/digest.sh"
  if [[ ! -f "$DIGEST_FILE" && -x "$DIGEST_SCRIPT" ]]; then
    log "Digest hour: generating daily digest for $TODAY"
    if $DRY_RUN; then
      log "[dry-run] Would run: $DIGEST_SCRIPT --date $TODAY"
    else
      "$DIGEST_SCRIPT" --date "$TODAY" 2>&1 | while IFS= read -r line; do log "  $line"; done || warn "Digest generation failed"
    fi
  fi
fi

# ─────────────────────────────────────────────────
# Run strategy planner for enabled companies
# ─────────────────────────────────────────────────
PLANNER_SCRIPT="$GHQ/loops/scripts/strategy-planner.sh"
if [[ -x "$PLANNER_SCRIPT" ]]; then
  log "Running strategy planner for enabled companies..."
  if $DRY_RUN; then
    log "[dry-run] Would run: $PLANNER_SCRIPT --all --dry-run"
  else
    "$PLANNER_SCRIPT" --all 2>&1 | while IFS= read -r line; do log "  [planner] $line"; done || warn "Strategy planner failed"
  fi
fi

# ─────────────────────────────────────────────────
# Parse manifest.yaml for enabled companies
# ─────────────────────────────────────────────────
COMPANIES_JSON=$(python3 -c "
import yaml, sys, json

with open(sys.argv[1]) as f:
    manifest = yaml.safe_load(f)

companies = []
for slug, config in (manifest or {}).items():
    sched = config.get('scheduler', {})
    companies.append({
        'slug': slug,
        'enabled': sched.get('enabled', False),
        'max_agents': sched.get('max_agents', 1),
        'epic': config.get('epic', '')
    })

print(json.dumps(companies))
" "$MANIFEST") || { err "Failed to parse manifest.yaml"; exit 2; }

# ─────────────────────────────────────────────────
# Handle a dead agent: read lockfile, check task
# status, retry or escalate
# ─────────────────────────────────────────────────
handle_dead_agent() {
  local company="$1"
  local dead_pid="$2"
  local pid_file="$AGENTS_DIR/${company}.pid"
  local lock_file="$AGENTS_DIR/${company}.lock"

  # Read lockfile to identify the task
  local task_id=""
  if [[ -f "$lock_file" ]]; then
    task_id=$(cat "$lock_file")
  fi

  if [[ -z "$task_id" ]]; then
    warn "Dead agent for $company (pid $dead_pid) but no lockfile found. Cleaning up."
    rm -f "$pid_file"
    return
  fi

  log "Dead agent detected: company=$company pid=$dead_pid task=$task_id"

  # Check task status in bd
  local task_json
  task_json=$($BD show "$task_id" --json 2>/dev/null) || {
    warn "Failed to query task $task_id. Cleaning up stale files."
    rm -f "$pid_file" "$lock_file"
    return
  }

  local task_status
  task_status=$(echo "$task_json" | jq -r '.[0].status // .status // "unknown"')

  if [[ "$task_status" == "closed" ]]; then
    # Clean exit: task was completed before the process died
    log "Task $task_id is closed (clean exit). Cleaning up files."
    rm -f "$pid_file" "$lock_file"
    return
  fi

  if [[ "$task_status" != "in_progress" ]]; then
    # Task is in some other state (open, blocked, etc.) -- just clean up
    log "Task $task_id status is '$task_status' (not in_progress). Cleaning up files."
    rm -f "$pid_file" "$lock_file"
    return
  fi

  # Task is still in_progress -- agent crashed
  # Get current retry count from task metadata
  local retry_count
  retry_count=$(echo "$task_json" | jq -r '.[0].metadata.retryCount // .metadata.retryCount // "0"')
  # Ensure it's a number
  retry_count=$((retry_count + 0))

  local new_retry_count=$((retry_count + 1))

  log "Agent crashed: task=$task_id retries=$retry_count/$MAX_RETRIES"

  if [[ "$new_retry_count" -le "$MAX_RETRIES" ]]; then
    # Increment retry count and move task back to open for retry
    log "Retrying task $task_id (attempt $new_retry_count/$MAX_RETRIES)"

    # Update retry count in task metadata
    $BD update "$task_id" --metadata "{\"retryCount\": $new_retry_count, \"lastCrash\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\", \"crashPid\": $dead_pid}" 2>/dev/null || {
      warn "Failed to update retry metadata for $task_id"
    }

    # Move task back to open
    $BD update "$task_id" --status open 2>/dev/null || {
      warn "Failed to reopen task $task_id"
    }

    log "Task $task_id moved back to open (retry $new_retry_count/$MAX_RETRIES)"
  else
    # Max retries exceeded -- block task and create a decision for the user
    log "Max retries ($MAX_RETRIES) exceeded for task $task_id. Escalating to user."

    # Update metadata with failure info
    $BD update "$task_id" --metadata "{\"retryCount\": $new_retry_count, \"lastCrash\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\", \"crashPid\": $dead_pid, \"blocked_reason\": \"max_retries_exceeded\"}" 2>/dev/null || {
      warn "Failed to update failure metadata for $task_id"
    }

    # Block the task
    $BD update "$task_id" --status blocked 2>/dev/null || {
      warn "Failed to block task $task_id"
    }

    # Create a decision task for the user
    $BD create \
      --title "DECISION: Task $task_id failed after $MAX_RETRIES retries" \
      -d "Task '$task_id' has crashed $MAX_RETRIES times. Last crash: pid $dead_pid, company: $company. Please investigate the agent log at $AGENTS_DIR/${company}.log and decide: retry, reassign, or close the task." \
      --type decision \
      --priority 0 \
      --labels "scheduler,escalation,$company" \
      --metadata "{\"company\": \"$company\", \"action\": \"retry_decision\", \"failed_task\": \"$task_id\"}" 2>/dev/null || {
      warn "Failed to create decision task for $task_id"
    }

    log "Decision task created for user review of $task_id"
  fi

  # Clean up stale pid and lock files
  rm -f "$pid_file" "$lock_file"
}

# ─────────────────────────────────────────────────
# Recover dead agents across all companies
# ─────────────────────────────────────────────────
recover_dead_agents() {
  for pid_file in "$AGENTS_DIR"/*.pid; do
    [[ -f "$pid_file" ]] || continue
    local pid
    pid=$(cat "$pid_file")
    if ! kill -0 "$pid" 2>/dev/null; then
      local company
      company=$(basename "$pid_file" .pid)
      handle_dead_agent "$company" "$pid"
    fi
  done
}

# Count running agents for a specific company
count_company_agents() {
  local company="$1"
  local count=0
  local pid_file="$AGENTS_DIR/${company}.pid"
  if [[ -f "$pid_file" ]]; then
    local pid
    pid=$(cat "$pid_file")
    if kill -0 "$pid" 2>/dev/null; then
      ((count++))
    fi
  fi
  echo "$count"
}

# ─────────────────────────────────────────────────
# Recover any dead agents before dispatching
# ─────────────────────────────────────────────────
recover_dead_agents
log "Dead agent recovery complete."

# ─────────────────────────────────────────────────
# Get the top-ranked open unblocked task for a company
# ─────────────────────────────────────────────────
get_top_task() {
  local company="$1"
  local epic="$2"

  # Get open tasks for this company's epic, sorted by priority
  local tasks
  tasks=$($BD list --parent "$epic" --status open --json 2>/dev/null) || {
    warn "Failed to query tasks for $company (epic: $epic)"
    echo ""
    return
  }

  # Filter out blocked tasks and rank by priority (lower = higher priority)
  local blocked
  blocked=$($BD blocked --parent "$epic" --json 2>/dev/null) || blocked="[]"

  python3 -c "
import json, sys

tasks = json.loads(sys.argv[1])
blocked = json.loads(sys.argv[2])

# Build set of blocked task IDs
blocked_ids = set()
for b in blocked:
    blocked_ids.add(b.get('id', ''))

# Filter to open, unblocked tasks
candidates = []
for t in tasks:
    tid = t.get('id', '')
    status = t.get('status', '')
    if status == 'open' and tid not in blocked_ids:
        candidates.append(t)

if not candidates:
    print('')
    sys.exit(0)

# Score: priority (lower = higher priority, so invert)
# Priority 0 = highest = score 5, Priority 4 = lowest = score 1
def score(task):
    p = task.get('priority', 3)
    return (5 - p)

candidates.sort(key=score, reverse=True)

# Print the top task as JSON
print(json.dumps(candidates[0]))
" "$tasks" "$blocked" 2>/dev/null || echo ""
}

# ─────────────────────────────────────────────────
# Dispatch loop
# ─────────────────────────────────────────────────
DISPATCHED=0

log "Starting scheduler dispatch..."
if $DRY_RUN; then
  log "[dry-run] Dispatch plan (no agents will be spawned):"
fi

# Use process substitution to avoid subshell (preserves DISPATCHED counter)
while IFS= read -r company_entry; do
  slug=$(echo "$company_entry" | jq -r '.slug')
  enabled=$(echo "$company_entry" | jq -r '.enabled')
  epic=$(echo "$company_entry" | jq -r '.epic')

  # Skip disabled companies
  if [[ "$enabled" != "true" ]]; then
    log "Skipping $slug (scheduler.enabled: false)"
    continue
  fi

  # Check per-company agent limit
  max_agents=$(echo "$company_entry" | jq -r '.max_agents')
  running_for_company=$(count_company_agents "$slug")
  if [[ "$running_for_company" -ge "$max_agents" ]]; then
    log "Skipping $slug ($running_for_company/$max_agents agents running)"
    continue
  fi

  # Find top-ranked task for this company
  TOP_TASK=$(get_top_task "$slug" "$epic")
  if [[ -z "$TOP_TASK" ]]; then
    log "No open unblocked tasks for $slug"
    continue
  fi

  TASK_ID=$(echo "$TOP_TASK" | jq -r '.id')
  TASK_TITLE=$(echo "$TOP_TASK" | jq -r '.title')
  TASK_PRIORITY=$(echo "$TOP_TASK" | jq -r '.priority')

  if $DRY_RUN; then
    log "[dry-run] Would dispatch $slug: task $TASK_ID ($TASK_TITLE) [priority=$TASK_PRIORITY]"
    continue
  fi

  # Write lockfile with task ID BEFORE spawning
  LOCK_FILE="$AGENTS_DIR/${slug}.lock"
  echo "$TASK_ID" > "$LOCK_FILE"
  log "Wrote lockfile: $LOCK_FILE (task: $TASK_ID)"

  # Spawn Claude Code agent in background running /run-loop
  log "Spawning agent for $slug: /run-loop $TASK_ID ($TASK_TITLE)"

  PID_FILE="$AGENTS_DIR/${slug}.pid"
  LOG_FILE="$AGENTS_DIR/${slug}.log"

  # Spawn agent in background
  nohup claude -p --dangerously-skip-permissions \
    "/run-loop $TASK_ID" \
    > "$LOG_FILE" 2>&1 &

  AGENT_PID=$!
  echo "$AGENT_PID" > "$PID_FILE"

  log "Agent spawned: pid=$AGENT_PID, task=$TASK_ID, company=$slug"
  ((DISPATCHED++))
done < <(echo "$COMPANIES_JSON" | jq -c '.[]')

if $DRY_RUN; then
  log "[dry-run] Dispatch plan complete."
else
  log "Dispatch complete. Agents dispatched: $DISPATCHED"
fi
