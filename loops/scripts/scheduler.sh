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
    'max_concurrent_agents': config.get('max_concurrent_agents', 2),
    'cooldown_after_failure': config.get('cooldown_after_failure', 900),
    'daily_budget': config.get('daily_budget', 50.0),
    'blocked_hours': config.get('blocked_hours', [])
}
print(json.dumps(result))
" "$SCHEDULER_YAML") || { err "Failed to parse scheduler.yaml"; exit 2; }

MAX_CONCURRENT=$(echo "$SCHEDULER_CONFIG" | jq -r '.max_concurrent_agents')
BLOCKED_HOURS=$(echo "$SCHEDULER_CONFIG" | jq -r '.blocked_hours[]' 2>/dev/null || true)

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
# Count currently running agents
# ─────────────────────────────────────────────────
count_running_agents() {
  local count=0
  for pid_file in "$AGENTS_DIR"/*.pid; do
    [[ -f "$pid_file" ]] || continue
    local pid
    pid=$(cat "$pid_file")
    if kill -0 "$pid" 2>/dev/null; then
      ((count++))
    fi
  done
  echo "$count"
}

# Check if a specific company has a running agent
company_has_running_agent() {
  local company="$1"
  local pid_file="$AGENTS_DIR/${company}.pid"
  if [[ -f "$pid_file" ]]; then
    local pid
    pid=$(cat "$pid_file")
    if kill -0 "$pid" 2>/dev/null; then
      return 0  # running
    fi
    # Stale pid file -- process is dead, clean up
    log "Cleaning stale pid file for $company (pid $pid)"
    rm -f "$pid_file"
    return 1
  fi
  return 1  # no pid file
}

# ─────────────────────────────────────────────────
# Check max concurrent agents
# ─────────────────────────────────────────────────
RUNNING=$(count_running_agents)
if [[ "$RUNNING" -ge "$MAX_CONCURRENT" ]]; then
  log "At capacity: $RUNNING/$MAX_CONCURRENT concurrent agents running. Not dispatching new agents."
  if $DRY_RUN; then
    log "[dry-run] Max concurrent agents limit reached ($RUNNING/$MAX_CONCURRENT)"
  fi
  exit 0
fi

SLOTS_AVAILABLE=$((MAX_CONCURRENT - RUNNING))
log "Running agents: $RUNNING/$MAX_CONCURRENT (${SLOTS_AVAILABLE} slots available)"

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

  # Check if company already has a running agent
  if company_has_running_agent "$slug"; then
    log "Skipping $slug (agent already running)"
    continue
  fi

  # Check global slot availability
  CURRENT_RUNNING=$(count_running_agents)
  if [[ "$CURRENT_RUNNING" -ge "$MAX_CONCURRENT" ]]; then
    log "Max concurrent agents limit reached ($CURRENT_RUNNING/$MAX_CONCURRENT). Stopping dispatch."
    break
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
