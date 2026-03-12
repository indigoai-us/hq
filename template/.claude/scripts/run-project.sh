#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# run-project.sh — Externalized Self-Healing Project Orchestrator
#
# Runs each story as an independent `claude -p` headless invocation.
# No context ceiling. Git validation after each story. Retry queue.
# Regression gates every N stories.
#
# Usage:
#   scripts/run-project.sh <project> [flags]
#   scripts/run-project.sh --status
#
# Flags:
#   --resume            Resume from next incomplete story (auto-detected)
#   --status            Show all project statuses, exit
#   --dry-run           Show story order without executing
#   --model MODEL       Override model for all stories
#   --no-permissions    Pass --dangerously-skip-permissions to claude
#   --retry-failed      Re-run previously failed stories only
#   --timeout N         Per-story wall-clock timeout in minutes (default: none)
#   --verbose           Show full claude output
#   --tmux              Launch in tmux session with Remote Control
# =============================================================================

HQ_ROOT="~/Documents/HQ"
export PATH="$HOME/.local/bin:$PATH"
ORCH_DIR="$HQ_ROOT/workspace/orchestrator"
REGRESSION_INTERVAL=3
SESSION_ID="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
RUN_START_EPOCH=$(date +%s)
AUDIT_SCRIPT="$HQ_ROOT/scripts/audit-log.sh"

# --- Git helpers (worktree-compatible) ---
is_git_repo() {
  local dir="${1:-.}"
  [[ -d "$dir/.git" || -f "$dir/.git" ]]
}

USING_WORKTREE=false
WORKTREE_PATH=""
ORIGINAL_REPO_PATH=""

# Create or reuse a git worktree for isolated branch work.
# Sets REPO_PATH to the worktree and USING_WORKTREE=true.
ensure_worktree() {
  local repo_path="$1"
  local branch_name="$2"
  local base_branch="${3:-main}"

  # Check if ANY existing worktree already has this branch checked out
  local existing_wt
  existing_wt=$(git -C "$repo_path" worktree list --porcelain 2>/dev/null \
    | awk -v branch="$branch_name" '
      /^worktree / { wt=$2 }
      /^branch refs\/heads\// {
        b = substr($0, length("branch refs/heads/") + 1)
        if (b == branch) print wt
      }
    ' | head -1)

  if [[ -n "$existing_wt" && -d "$existing_wt" ]]; then
    # If the found worktree IS the main repo itself, skip worktree setup — just use in-place
    local resolved_wt resolved_repo
    resolved_wt=$(cd "$existing_wt" && pwd -P)
    resolved_repo=$(cd "$repo_path" && pwd -P)
    if [[ "$resolved_wt" == "$resolved_repo" ]]; then
      log_info "Branch $branch_name already checked out in main repo — using in-place"
      return 0
    fi
    log_info "Reusing existing worktree: $existing_wt (branch: $branch_name)"
    WORKTREE_PATH="$existing_wt"
    ORIGINAL_REPO_PATH="$REPO_PATH"
    REPO_PATH="$existing_wt"
    USING_WORKTREE=true
    return 0
  fi

  # Slugify branch for new worktree directory name
  local branch_slug="${branch_name//\//-}"
  local wt_path="${repo_path}-wt-${branch_slug}"

  # Create the worktree
  log_info "Creating worktree: $wt_path (branch: $branch_name)"
  if git -C "$repo_path" show-ref --verify --quiet "refs/heads/$branch_name" 2>/dev/null; then
    git -C "$repo_path" worktree add "$wt_path" "$branch_name" 2>&1 || {
      log_err "Failed to create worktree"
      return 1
    }
  else
    git -C "$repo_path" worktree add -b "$branch_name" "$wt_path" "$base_branch" 2>&1 || {
      log_err "Failed to create worktree with new branch"
      return 1
    }
  fi

  # Install dependencies (monorepo needs node_modules)
  if [[ -f "$wt_path/bun.lock" || -f "$wt_path/bun.lockb" ]]; then
    log_info "Installing dependencies in worktree..."
    (cd "$wt_path" && bun install --frozen-lockfile 2>/dev/null || bun install 2>/dev/null) || true
  elif [[ -f "$wt_path/package-lock.json" ]]; then
    (cd "$wt_path" && npm ci 2>/dev/null || npm install 2>/dev/null) || true
  fi

  WORKTREE_PATH="$wt_path"
  ORIGINAL_REPO_PATH="$REPO_PATH"
  REPO_PATH="$wt_path"
  USING_WORKTREE=true
  log_ok "Worktree ready: $wt_path"
}

# Clean up worktree on project completion
cleanup_worktree() {
  if [[ "$USING_WORKTREE" != true || -z "$WORKTREE_PATH" || -z "$ORIGINAL_REPO_PATH" ]]; then
    return 0
  fi

  # Safety: never remove the main repo itself (happens when branchName matches current checkout)
  local resolved_wt resolved_orig
  resolved_wt=$(cd "$WORKTREE_PATH" 2>/dev/null && pwd -P) || return 0
  resolved_orig=$(cd "$ORIGINAL_REPO_PATH" 2>/dev/null && pwd -P) || return 0
  if [[ "$resolved_wt" == "$resolved_orig" ]]; then
    return 0
  fi

  log_info "Cleaning up worktree: $WORKTREE_PATH"

  # Ensure all changes are committed/pushed before removing
  local dirty
  dirty=$(git -C "$WORKTREE_PATH" status --porcelain 2>/dev/null) || true
  if [[ -n "$dirty" ]]; then
    log_warn "Worktree has uncommitted changes — skipping cleanup"
    log_warn "  Manual cleanup: git -C $ORIGINAL_REPO_PATH worktree remove $WORKTREE_PATH"
    return 0
  fi

  git -C "$ORIGINAL_REPO_PATH" worktree remove "$WORKTREE_PATH" 2>/dev/null || {
    log_warn "Failed to remove worktree — manual cleanup needed"
    log_warn "  git -C $ORIGINAL_REPO_PATH worktree remove $WORKTREE_PATH"
  }
}

# Signal-safe cleanup: release checkouts, kill swarm children, then cleanup worktree
cleanup_on_signal() {
  local sig="$1"
  log_warn "Caught signal $sig — cleaning up..."

  # Kill background check-in timer if running
  [[ -n "${CHECKIN_PID:-}" ]] && kill "$CHECKIN_PID" 2>/dev/null || true

  # Kill swarm background processes
  if [[ ${#SWARM_PIDS[@]:-0} -gt 0 ]]; then
    local i=0
    while [[ $i -lt ${#SWARM_PIDS[@]} ]]; do
      local pid="${SWARM_PIDS[$i]}"
      local sid="${SWARM_STORY_IDS[$i]}"
      if kill -0 "$pid" 2>/dev/null; then
        kill "$pid" 2>/dev/null || true
        log_warn "Killed swarm process $sid (PID $pid)"
      fi
      # Release checkout for this story
      if [[ -n "${STATE_FILE:-}" && -f "${STATE_FILE:-}" ]]; then
        release_checkout "$sid" 2>/dev/null || true
      fi
      # Release file locks
      release_swarm_locks "$sid" 2>/dev/null || true
      i=$((i + 1))
    done
  fi

  # Release current sequential story checkout
  if [[ -n "${STORY_ID:-}" && -n "${STATE_FILE:-}" && -f "${STATE_FILE:-}" ]]; then
    release_checkout "$STORY_ID" 2>/dev/null || true
  fi

  # Update state to paused (not in_progress with stale PID)
  if [[ -n "${STATE_FILE:-}" && -f "${STATE_FILE:-}" ]]; then
    jq --arg ts "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
      '.status = "paused" | .updated_at = $ts | .current_tasks = []' \
      "$STATE_FILE" > "$STATE_FILE.tmp" 2>/dev/null \
      && mv "$STATE_FILE.tmp" "$STATE_FILE" 2>/dev/null || true
  fi

  cleanup_worktree
  exit 130
}

trap 'cleanup_on_signal INT' INT
trap 'cleanup_on_signal TERM' TERM
trap 'cleanup_worktree' EXIT

# --- Defaults ---
PROJECT=""
RESUME=false
STATUS=false
DRY_RUN=false
MODEL=""
NO_PERMISSIONS=false
RETRY_FAILED=false
TIMEOUT=""
VERBOSE=false
TMUX_MODE=false
IN_PLACE=false
SWARM_MODE=false
SWARM_MAX=4
CHECKIN_INTERVAL=180  # seconds between check-in status prints
CODEX_AUTOFIX=false

# --- Colors ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

# =============================================================================
# Capture raw args for --tmux passthrough (before parsing consumes them)
# =============================================================================
PASSTHROUGH_ARGS=""
for arg in "$@"; do
  [[ "$arg" != "--tmux" ]] && PASSTHROUGH_ARGS="$PASSTHROUGH_ARGS $arg"
done
PASSTHROUGH_ARGS="${PASSTHROUGH_ARGS# }"

# =============================================================================
# Argument Parsing
# =============================================================================

while [[ $# -gt 0 ]]; do
  case "$1" in
    --resume)       RESUME=true; shift ;;
    --status)       STATUS=true; shift ;;
    --dry-run)      DRY_RUN=true; shift ;;
    --model)        MODEL="$2"; shift 2 ;;
    --no-permissions) NO_PERMISSIONS=true; shift ;;
    --retry-failed) RETRY_FAILED=true; shift ;;
    --timeout)      TIMEOUT="$2"; shift 2 ;;
    --verbose)      VERBOSE=true; shift ;;
    --tmux)         TMUX_MODE=true; shift ;;
    --in-place)     IN_PLACE=true; shift ;;
    --swarm)
      SWARM_MODE=true
      # Optional: --swarm 3 sets max concurrency
      if [[ $# -gt 1 && "$2" =~ ^[0-9]+$ ]]; then
        SWARM_MAX="$2"; shift
      fi
      shift ;;
    --checkin-interval) CHECKIN_INTERVAL="$2"; shift 2 ;;
    --codex-autofix)  CODEX_AUTOFIX=true; shift ;;
    --help|-h)
      cat <<'HELP'
Usage: scripts/run-project.sh <project> [flags]
       scripts/run-project.sh --status

Flags:
  --resume            Resume from next incomplete story (auto-detected)
  --status            Show all project statuses, exit
  --dry-run           Show story order without executing
  --model MODEL       Override model for all stories
  --no-permissions    Pass --dangerously-skip-permissions to claude
  --retry-failed      Re-run previously failed stories only
  --timeout N         Per-story wall-clock timeout in minutes
  --verbose           Show full claude output
  --tmux              Launch in tmux session with Remote Control
  --in-place          Skip worktree creation, work directly on repo checkout
  --swarm [N]         Run eligible stories in parallel (max N concurrent, default 4)
  --checkin-interval N  Seconds between check-in status prints (default: 180)
  --codex-autofix     Auto-fix P1/P2 codex review findings (opt-in)
HELP
      exit 0
      ;;
    -*)
      echo -e "${RED}Unknown flag: $1${NC}" >&2
      exit 1
      ;;
    *)
      PROJECT="$1"; shift ;;
  esac
done

# =============================================================================
# --tmux: Launch in tmux session with Remote Control
# =============================================================================

if [[ "$TMUX_MODE" == true ]]; then
  command -v tmux >/dev/null 2>&1 || { echo -e "${RED}tmux not installed${NC}"; exit 1; }
  [[ -z "$PROJECT" ]] && { echo -e "${RED}--tmux requires a project name${NC}"; exit 1; }

  SESSION_NAME="rp-${PROJECT}"

  # Kill existing session if present (re-launch)
  tmux kill-session -t "$SESSION_NAME" 2>/dev/null || true

  # Launch tmux → interactive claude → /run-project with passthrough flags
  tmux new-session -d -s "$SESSION_NAME" \
    "cd $HQ_ROOT && claude"

  sleep 3  # wait for claude to initialize

  tmux send-keys -t "$SESSION_NAME" \
    "/run-project ${PASSTHROUGH_ARGS}" Enter

  echo -e "\n${GREEN}${BOLD}Launched in tmux: ${SESSION_NAME}${NC}"
  echo -e "  ${BLUE}Attach:${NC}  tmux attach -t ${SESSION_NAME}"
  echo -e "  ${BLUE}RC:${NC}      connect from claude.ai/code or Claude mobile app"
  echo -e "  ${BLUE}Kill:${NC}    tmux kill-session -t ${SESSION_NAME}\n"
  exit 0
fi

# =============================================================================
# Utilities
# =============================================================================

ts() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }
log()      { echo -e "${DIM}[$(date +%H:%M:%S)]${NC} $*"; }
log_info()  { echo -e "${DIM}[$(date +%H:%M:%S)]${NC} ${BLUE}INFO${NC}  $*"; }
log_ok()    { echo -e "${DIM}[$(date +%H:%M:%S)]${NC} ${GREEN}DONE${NC}  $*"; }
log_warn()  { echo -e "${DIM}[$(date +%H:%M:%S)]${NC} ${YELLOW}WARN${NC}  $*"; }
log_err()   { echo -e "${DIM}[$(date +%H:%M:%S)]${NC} ${RED}FAIL${NC}  $*"; }

# =============================================================================
# --status: Show all project statuses
# =============================================================================

if [[ "$STATUS" == true ]]; then
  echo -e "\n${BOLD}Project Status${NC}\n"

  active="" paused="" completed=""
  for state_file in "$ORCH_DIR"/*/state.json; do
    [[ -f "$state_file" ]] || continue
    name=$(jq -r '.project // "unknown"' "$state_file")
    status=$(jq -r '.status // "unknown"' "$state_file")
    total=$(jq -r '(.progress.total // 0) | tonumber' "$state_file" 2>/dev/null || echo 0)
    done_count=$(jq -r '(.progress.completed // 0) | tonumber' "$state_file" 2>/dev/null || echo 0)
    [[ "$total" =~ ^[0-9]+$ ]] || total=0
    [[ "$done_count" =~ ^[0-9]+$ ]] || done_count=0
    if (( total > 0 )); then pct=$(( done_count * 100 / total )); else pct=0; fi

    line="  $name — $done_count/$total ($pct%)"
    case "$status" in
      in_progress) active+="$line\n" ;;
      paused)      paused+="$line\n" ;;
      completed)   completed+="$line\n" ;;
    esac
  done

  echo -e "${GREEN}ACTIVE:${NC}"
  [[ -n "$active" ]] && echo -e "$active" || echo "  (none)"
  echo -e "${YELLOW}PAUSED:${NC}"
  [[ -n "$paused" ]] && echo -e "$paused" || echo "  (none)"
  echo -e "${DIM}COMPLETED:${NC}"
  [[ -n "$completed" ]] && echo -e "$completed" || echo "  (none)"
  echo
  exit 0
fi

# =============================================================================
# Validate project argument
# =============================================================================

if [[ -z "$PROJECT" ]]; then
  echo "Usage: scripts/run-project.sh <project> [flags]"
  echo "       scripts/run-project.sh --status"
  echo ""
  echo "Run scripts/run-project.sh --help for all options."
  exit 1
fi

# =============================================================================
# Resolve PRD Path
# =============================================================================

resolve_prd_path() {
  local project="$1"

  # 1. Known path from existing state.json
  local state_path="$ORCH_DIR/$project/state.json"
  if [[ -f "$state_path" ]]; then
    local known
    known=$(jq -r '.prd_path // empty' "$state_path")
    if [[ -n "$known" && -f "$HQ_ROOT/$known" ]]; then
      echo "$HQ_ROOT/$known"
      return 0
    fi
  fi

  # 2. Direct scan: companies/*/projects/$project/prd.json
  for prd in "$HQ_ROOT"/companies/*/projects/"$project"/prd.json; do
    if [[ -f "$prd" ]]; then
      echo "$prd"
      return 0
    fi
  done

  # 3. HQ-level: projects/$project/prd.json
  if [[ -f "$HQ_ROOT/projects/$project/prd.json" ]]; then
    echo "$HQ_ROOT/projects/$project/prd.json"
    return 0
  fi

  # 4. qmd fallback
  local qmd_result
  qmd_result=$(qmd search "$project prd.json" --json -n 5 2>/dev/null \
    | jq -r '.[].file // empty' 2>/dev/null \
    | grep "/$project/prd.json" \
    | head -1) || true
  if [[ -n "$qmd_result" && -f "$qmd_result" ]]; then
    echo "$qmd_result"
    return 0
  fi

  return 1
}

PRD_PATH=""
PRD_PATH=$(resolve_prd_path "$PROJECT") || true

if [[ -z "$PRD_PATH" || ! -f "$PRD_PATH" ]]; then
  echo -e "${RED}ERROR: prd.json not found for '$PROJECT'.${NC}"
  echo "Run /prd $PROJECT to generate one."
  exit 1
fi

# Relative path for state files
PRD_REL="${PRD_PATH#"$HQ_ROOT/"}"

# Company slug (for audit logging)
COMPANY=$(jq -r '.metadata.company // empty' "$PRD_PATH")

log_info "PRD: $PRD_REL"

# =============================================================================
# Validate PRD
# =============================================================================

validate_prd() {
  local prd_path="$1"

  if ! jq -e '.userStories | type == "array" and length > 0' "$prd_path" >/dev/null 2>&1; then
    echo -e "${RED}ERROR: prd.json has no userStories array (or it's empty).${NC}"
    exit 1
  fi

  local invalid
  invalid=$(jq -r '
    .userStories[] |
    select(
      (.id | not) or
      (.title | not) or
      (.description | not) or
      (has("passes") | not)
    ) | .id // "unknown"
  ' "$prd_path")

  if [[ -n "$invalid" ]]; then
    echo -e "${RED}ERROR: Stories missing required fields (id, title, description, passes):${NC}"
    echo "$invalid"
    exit 1
  fi
}

validate_prd "$PRD_PATH"

# =============================================================================
# Read PRD stats
# =============================================================================

read_prd_stats() {
  TOTAL=$(jq '.userStories | length' "$PRD_PATH")
  COMPLETED=$(jq '[.userStories[] | select(.passes == true)] | length' "$PRD_PATH")
  REMAINING=$((TOTAL - COMPLETED))
}

read_prd_stats

# Resolve repo path for git operations
REPO_PATH=$(jq -r '.metadata.repoPath // empty' "$PRD_PATH")
if [[ -n "$REPO_PATH" && ! "$REPO_PATH" = /* ]]; then
  REPO_PATH="$HQ_ROOT/$REPO_PATH"
fi

# =============================================================================
# Branch Setup (always-worktree for isolation)
# =============================================================================

WORKTREE_ENABLED=$(yq e '.worktree.enabled // true' "$HQ_ROOT/settings/orchestrator.yaml" 2>/dev/null || echo "true")
BRANCH_NAME=$(jq -r '.branchName // empty' "$PRD_PATH")
BASE_BRANCH=$(jq -r '.metadata.baseBranch // "main"' "$PRD_PATH")

if [[ -n "$BRANCH_NAME" && -n "$REPO_PATH" ]] && is_git_repo "$REPO_PATH"; then
  if [[ "$IN_PLACE" == true || "$WORKTREE_ENABLED" != true ]]; then
    # Opt-out: legacy checkout behavior (no worktree)
    current_branch=$(git -C "$REPO_PATH" branch --show-current 2>/dev/null)
    if [[ "$current_branch" != "$BRANCH_NAME" ]]; then
      if git -C "$REPO_PATH" show-ref --verify --quiet "refs/heads/$BRANCH_NAME" 2>/dev/null; then
        log_info "In-place: checking out existing branch: $BRANCH_NAME"
        git -C "$REPO_PATH" checkout "$BRANCH_NAME"
      else
        log_info "In-place: creating branch: $BRANCH_NAME from $BASE_BRANCH"
        git -C "$REPO_PATH" checkout -b "$BRANCH_NAME" "$BASE_BRANCH"
      fi
    fi
  else
    # Default: always use worktree for isolation
    log_info "Creating/reusing worktree for branch: $BRANCH_NAME"
    ensure_worktree "$REPO_PATH" "$BRANCH_NAME" "$BASE_BRANCH" || {
      log_err "Failed to create worktree — aborting"
      exit 1
    }
  fi

  # If REPO_PATH was already a worktree (e.g., prd.json points to one), detect it
  if [[ -f "$REPO_PATH/.git" ]] && [[ "$USING_WORKTREE" != true ]]; then
    USING_WORKTREE=true
    WORKTREE_PATH="$REPO_PATH"
    # Resolve original repo from gitdir
    _gitdir_content=$(cat "$REPO_PATH/.git" 2>/dev/null)
    if [[ "$_gitdir_content" == gitdir:* ]]; then
      _resolved="${_gitdir_content#gitdir: }"
      if [[ "$_resolved" == *"/.git/worktrees/"* ]]; then
        ORIGINAL_REPO_PATH="${_resolved%%/.git/worktrees/*}"
      fi
    fi
    log_info "Detected existing worktree at $REPO_PATH"
  fi
fi

# =============================================================================
# Display Status
# =============================================================================

echo ""
echo -e "${BOLD}=== run-project: $PROJECT ===${NC}"
echo -e "Progress: ${GREEN}$COMPLETED${NC}/$TOTAL ($((TOTAL > 0 ? COMPLETED * 100 / TOTAL : 0))%)"
echo ""

if [[ "$REMAINING" -eq 0 && "$RETRY_FAILED" != true ]]; then
  echo -e "${GREEN}All stories complete.${NC}"
  exit 0
fi

# Show remaining stories
echo -e "${DIM}Remaining:${NC}"
jq -r '.userStories[] | select(.passes != true) | "  \(.id): \(.title)"' "$PRD_PATH"
echo ""

# =============================================================================
# Initialize / Load State
# =============================================================================

PROJECT_DIR="$ORCH_DIR/$PROJECT"
STATE_FILE="$PROJECT_DIR/state.json"
PROGRESS_FILE="$PROJECT_DIR/progress.txt"
EXEC_DIR="$PROJECT_DIR/executions"

mkdir -p "$EXEC_DIR"

if [[ -f "$STATE_FILE" ]]; then
  existing_status=$(jq -r '.status // "unknown"' "$STATE_FILE")
  if [[ "$existing_status" == "completed" && "$RETRY_FAILED" != true ]]; then
    echo -e "${YELLOW}Project already completed. Use --retry-failed to re-run failures.${NC}"
    exit 0
  fi
  # Update status for resume
  jq --arg ts "$(ts)" '.status = "in_progress" | .updated_at = $ts' "$STATE_FILE" > "$STATE_FILE.tmp" \
    && mv "$STATE_FILE.tmp" "$STATE_FILE"
  log_info "Resuming from state.json"

  # Clean stale current_tasks from prior crashed runs (dead PIDs)
  if [[ -f "$STATE_FILE" ]]; then
    _stale_count=0
    while IFS= read -r _pid; do
      if [[ -n "$_pid" && "$_pid" != "null" ]] && ! kill -0 "$_pid" 2>/dev/null; then
        jq --argjson pid "$_pid" \
          '.current_tasks = [.current_tasks[] | select((.pid // .checkedOutBy.pid) != $pid)]' \
          "$STATE_FILE" > "${STATE_FILE}.tmp" && mv "${STATE_FILE}.tmp" "$STATE_FILE"
        ((_stale_count++)) || true
      fi
    done < <(jq -r '.current_tasks[]? | (.pid // .checkedOutBy.pid // empty) | tostring' "$STATE_FILE" 2>/dev/null)
    [[ $_stale_count -gt 0 ]] && log_info "Cleaned $_stale_count stale current_tasks entries from prior run"
  fi

  "$AUDIT_SCRIPT" append --event project_started --project "$PROJECT" \
    ${COMPANY:+--company "$COMPANY"} \
    --action "Resuming project: $TOTAL stories, $COMPLETED completed (resume=true)" \
    --result success \
    --session-id "$SESSION_ID" || true
else
  # Initialize new state
  cat > "$STATE_FILE" <<EOF
{
  "project": "$PROJECT",
  "prd_path": "$PRD_REL",
  "status": "in_progress",
  "started_at": "$(ts)",
  "updated_at": "$(ts)",
  "progress": { "total": $TOTAL, "completed": $COMPLETED, "failed": 0, "in_progress": 0 },
  "current_tasks": [],
  "completed_tasks": [],
  "failed_tasks": [],
  "retry_queue": [],
  "regression_gates": [],
  "orchestrator": "bash-v2"
}
EOF
  echo "[$(ts)] Project started: $PROJECT ($TOTAL stories, $COMPLETED already completed)" >> "$PROGRESS_FILE"
  log_info "Initialized new project state"
  "$AUDIT_SCRIPT" append --event project_started --project "$PROJECT" \
    ${COMPANY:+--company "$COMPANY"} \
    --action "Project started: $TOTAL stories total, resume=false" \
    --result success \
    --session-id "$SESSION_ID" || true
fi

# =============================================================================
# State Schema Migration (current_task → current_tasks[])
# =============================================================================

migrate_state_schema() {
  [[ ! -f "$STATE_FILE" ]] && return 0

  local has_old
  has_old=$(jq 'has("current_task") and (has("current_tasks") | not)' "$STATE_FILE" 2>/dev/null) || return 0

  if [[ "$has_old" == "true" ]]; then
    jq '
      .current_tasks = (if .current_task != null then [.current_task] else [] end) |
      del(.current_task) |
      .orchestrator = "bash-v2"
    ' "$STATE_FILE" > "$STATE_FILE.tmp" && mv "$STATE_FILE.tmp" "$STATE_FILE"
    log_info "Migrated state.json: current_task → current_tasks[]"
  fi
}

migrate_state_schema

# =============================================================================
# Checkout Config (from orchestrator.yaml)
# =============================================================================

CHECKOUT_ENABLED=$(yq e '.checkout.enabled // true' "$HQ_ROOT/settings/orchestrator.yaml" 2>/dev/null || echo "true")
CHECKOUT_STALE_MINUTES=$(yq e '.checkout.stale_timeout_minutes // 30' "$HQ_ROOT/settings/orchestrator.yaml" 2>/dev/null || echo "30")

# Swarm config (CLI flags override yaml)
if [[ "$SWARM_MAX" -eq 4 ]]; then
  SWARM_MAX=$(yq e '.swarm.max_concurrency // 4' "$HQ_ROOT/settings/orchestrator.yaml" 2>/dev/null || echo "4")
fi
if [[ "$CHECKIN_INTERVAL" -eq 180 ]]; then
  CHECKIN_INTERVAL=$(yq e '.swarm.checkin_interval_seconds // 180' "$HQ_ROOT/settings/orchestrator.yaml" 2>/dev/null || echo "180")
fi

# =============================================================================
# Checkout Functions
# =============================================================================

# Clean up stale checkout entries — PID is dead AND older than stale_timeout_minutes
clean_stale_checkouts() {
  [[ "$CHECKOUT_ENABLED" != "true" ]] && return 0
  [[ ! -f "$STATE_FILE" ]] && return 0

  local stale_seconds
  stale_seconds=$(( CHECKOUT_STALE_MINUTES * 60 ))

  # Iterate current_tasks[] and remove entries with dead PIDs past stale timeout
  local task_count
  task_count=$(jq '.current_tasks // [] | length' "$STATE_FILE" 2>/dev/null) || return 0
  [[ "$task_count" -eq 0 ]] && return 0

  local i=0
  while [[ $i -lt $task_count ]]; do
    local checkout_pid checkout_started story_id
    checkout_pid=$(jq -r --argjson idx "$i" '.current_tasks[$idx].checkedOutBy.pid // empty' "$STATE_FILE" 2>/dev/null) || true
    [[ -z "$checkout_pid" ]] && { i=$((i + 1)); continue; }

    # Check if PID is still alive
    if kill -0 "$checkout_pid" 2>/dev/null; then
      i=$((i + 1)); continue  # Still running — leave it
    fi

    # PID is dead — check age
    checkout_started=$(jq -r --argjson idx "$i" '.current_tasks[$idx].checkedOutBy.startedAt // empty' "$STATE_FILE" 2>/dev/null) || true
    story_id=$(jq -r --argjson idx "$i" '.current_tasks[$idx].id // "unknown"' "$STATE_FILE" 2>/dev/null) || true

    if [[ -z "$checkout_started" ]]; then
      # No timestamp — release unconditionally
      jq --arg sid "$story_id" --arg ts "$(ts)" '
        .current_tasks = [.current_tasks[] | select(.id != $sid)] |
        .progress.in_progress = (.current_tasks | length) |
        .updated_at = $ts
      ' "$STATE_FILE" > "$STATE_FILE.tmp" && mv "$STATE_FILE.tmp" "$STATE_FILE"
      log_warn "Released stale checkout (dead PID $checkout_pid, $story_id, no timestamp)"
      task_count=$((task_count - 1))
      continue  # Don't increment — array shifted
    fi

    # Compute age in seconds (macOS-compatible)
    local started_epoch now_epoch pid_age_seconds
    started_epoch=$(date -j -f "%Y-%m-%dT%H:%M:%SZ" "$checkout_started" "+%s" 2>/dev/null) || { i=$((i + 1)); continue; }
    now_epoch=$(date -u +%s)
    pid_age_seconds=$(( now_epoch - started_epoch ))

    if (( pid_age_seconds >= stale_seconds )); then
      jq --arg sid "$story_id" --arg ts "$(ts)" '
        .current_tasks = [.current_tasks[] | select(.id != $sid)] |
        .progress.in_progress = (.current_tasks | length) |
        .updated_at = $ts
      ' "$STATE_FILE" > "$STATE_FILE.tmp" && mv "$STATE_FILE.tmp" "$STATE_FILE"
      log_warn "Released stale checkout: $story_id (dead PID $checkout_pid, ${pid_age_seconds}s old)"
      task_count=$((task_count - 1))
      continue  # Don't increment — array shifted
    fi

    i=$((i + 1))
  done
}

# Attempt to checkout a story. Returns 0 if acquired, 1 if another live PID holds it.
checkout_story() {
  local story_id="$1"
  [[ "$CHECKOUT_ENABLED" != "true" ]] && return 0

  # Check if this specific story is already checked out in current_tasks[]
  local existing_pid
  existing_pid=$(jq -r --arg sid "$story_id" '
    (.current_tasks // [])[] | select(.id == $sid) | .checkedOutBy.pid // empty
  ' "$STATE_FILE" 2>/dev/null) || true

  if [[ -n "$existing_pid" ]]; then
    if kill -0 "$existing_pid" 2>/dev/null; then
      local holder_session
      holder_session=$(jq -r --arg sid "$story_id" '
        (.current_tasks // [])[] | select(.id == $sid) | .checkedOutBy.sessionId // "unknown"
      ' "$STATE_FILE" 2>/dev/null)
      log_warn "Story $story_id is checked out by live PID $existing_pid (session: $holder_session) — skipping"
      return 1
    fi
    # Dead PID — remove stale entry before re-adding
    log_warn "Overriding dead PID $existing_pid checkout for $story_id"
    jq --arg sid "$story_id" --arg ts "$(ts)" '
      .current_tasks = [(.current_tasks // [])[] | select(.id != $sid)] |
      .updated_at = $ts
    ' "$STATE_FILE" > "$STATE_FILE.tmp" && mv "$STATE_FILE.tmp" "$STATE_FILE"
  fi

  # Add checkout entry to current_tasks[]
  jq --arg id "$story_id" --arg pid "$$" --arg ts "$(ts)" --arg sid "$SESSION_ID" '
    .current_tasks = ((.current_tasks // []) + [{
      "id": $id,
      "started_at": $ts,
      "checkedOutBy": {"pid": ($pid | tonumber), "startedAt": $ts, "sessionId": $sid}
    }]) |
    .progress.in_progress = (.current_tasks | length) |
    .updated_at = $ts
  ' "$STATE_FILE" > "$STATE_FILE.tmp" && mv "$STATE_FILE.tmp" "$STATE_FILE"

  return 0
}

# Release checkout after story completion or failure.
# In sequential mode: release by PID match. In swarm: release by story ID.
release_checkout() {
  local story_id="${1:-}"
  [[ "$CHECKOUT_ENABLED" != "true" ]] && return 0
  [[ ! -f "$STATE_FILE" ]] && return 0

  if [[ -n "$story_id" ]]; then
    # Remove specific story from current_tasks[]
    jq --arg sid "$story_id" --arg ts "$(ts)" '
      .current_tasks = [(.current_tasks // [])[] | select(.id != $sid)] |
      .progress.in_progress = (.current_tasks | length) |
      .updated_at = $ts
    ' "$STATE_FILE" > "$STATE_FILE.tmp" && mv "$STATE_FILE.tmp" "$STATE_FILE"
  else
    # Legacy: remove all entries owned by our PID
    jq --arg pid "$$" --arg ts "$(ts)" '
      .current_tasks = [(.current_tasks // [])[] | select(.checkedOutBy.pid != ($pid | tonumber))] |
      .progress.in_progress = (.current_tasks | length) |
      .updated_at = $ts
    ' "$STATE_FILE" > "$STATE_FILE.tmp" && mv "$STATE_FILE.tmp" "$STATE_FILE"
  fi
}

# =============================================================================
# Board Sync → in_progress (best-effort)
# =============================================================================

sync_board() {
  local target_status="$1"
  local company
  company=$(jq -r '.metadata.company // empty' "$PRD_PATH") || return 0
  [[ -z "$company" ]] && return 0

  local board_path
  board_path=$(yq -r --arg co "$company" '.[$co].board_path // empty' "$HQ_ROOT/companies/manifest.yaml" 2>/dev/null) || return 0
  [[ -z "$board_path" || "$board_path" == "null" ]] && return 0

  local board_file="$HQ_ROOT/$board_path"
  [[ -f "$board_file" ]] || return 0

  jq --arg prd "$PRD_REL" --arg st "$target_status" --arg ts "$(ts)" '
    (.projects // []) |= map(
      if .prd_path == $prd then .status = $st | .updated_at = $ts else . end
    )
  ' "$board_file" > "$board_file.tmp" && mv "$board_file.tmp" "$board_file" 2>/dev/null || true
}

clean_stale_checkouts

sync_board "in_progress"

# =============================================================================
# Story Selection (Ralph method: deps → file locks → priority → array order)
# =============================================================================

# Check if a story has file lock conflicts
has_file_conflict() {
  local story_id="$1"
  [[ -z "$REPO_PATH" || ! -d "$REPO_PATH" ]] && return 1  # no repo = no conflicts

  local lock_file="$REPO_PATH/.file-locks.json"
  [[ -f "$lock_file" ]] || return 1  # no locks file = no conflicts

  # Get story's declared files
  local story_files
  story_files=$(jq -r --arg id "$story_id" '
    .userStories[] | select(.id == $id) | .files // [] | .[]
  ' "$PRD_PATH" 2>/dev/null) || return 1
  [[ -z "$story_files" ]] && return 1  # no files declared = no conflicts

  # Check each file against active locks (array schema: {version, locks: [{file, owner, acquired_at}]})
  while IFS= read -r f; do
    [[ -z "$f" ]] && continue
    local locked_by owner_pid
    locked_by=$(jq -r --arg file "$f" --arg self "$story_id" '
      .locks // [] | map(select(.file == $file and .owner.story != $self)) | .[0].owner.story // empty
    ' "$lock_file" 2>/dev/null) || continue
    if [[ -n "$locked_by" ]]; then
      # Verify the owning PID is still alive (stale lock = ignore)
      owner_pid=$(jq -r --arg file "$f" --arg self "$story_id" '
        .locks // [] | map(select(.file == $file and .owner.story != $self)) | .[0].owner.pid // empty
      ' "$lock_file" 2>/dev/null) || true
      if [[ -n "$owner_pid" ]] && ! kill -0 "$owner_pid" 2>/dev/null; then
        continue  # stale lock — owner PID is dead
      fi
      log_warn "  File conflict: $f locked by $locked_by"
      return 0  # has conflict
    fi
  done <<< "$story_files"

  return 1  # no conflicts
}

# Get next incomplete, unblocked, non-conflicting story (priority-aware)
get_next_story() {
  # Re-read PRD each time (execute-task may have updated passes)
  # Selection: unblocked deps → no file conflicts → lowest priority number → array order
  # Optional arg: newline-separated list of IDs to skip
  local skip_list="${1:-}"

  local candidates
  candidates=$(jq -r '
    .userStories as $all |
    [.userStories[] | select(.passes != true)] |
    [.[] | select(
      (.dependsOn // []) | all(. as $dep | $all[] | select(.id == $dep) | .passes == true)
    )] |
    sort_by(.priority // 99) |
    .[].id
  ' "$PRD_PATH") || true

  # Check file locks for each candidate, skip IDs in skip_list
  while IFS= read -r cid; do
    [[ -z "$cid" ]] && continue
    # Skip if in skip list
    if [[ -n "$skip_list" ]] && echo "$skip_list" | grep -qx "$cid"; then
      continue
    fi
    if ! has_file_conflict "$cid"; then
      echo "$cid"
      return 0
    fi
  done <<< "$candidates"

  # All candidates have conflicts or are skipped — return empty
  echo ""
}

get_story_title() {
  jq -r --arg id "$1" '.userStories[] | select(.id == $id) | .title' "$PRD_PATH"
}

# =============================================================================
# Swarm Helpers
# =============================================================================

# Check if a story has non-empty files[] declared in prd.json
story_has_files_declared() {
  local story_id="$1"
  local count
  count=$(jq -r --arg id "$story_id" '
    .userStories[] | select(.id == $id) | .files // [] | length
  ' "$PRD_PATH" 2>/dev/null) || true
  [[ -n "$count" && "$count" -gt 0 ]] && return 0
  return 1
}

# Check if two stories share any declared files (returns 0=overlap, 1=no overlap)
# Empty files[] on either side = overlap (conservative — can't verify safety)
stories_have_file_overlap() {
  local id_a="$1" id_b="$2"

  local files_a files_b
  files_a=$(jq -r --arg id "$id_a" '
    .userStories[] | select(.id == $id) | .files // [] | .[]
  ' "$PRD_PATH" 2>/dev/null) || true
  files_b=$(jq -r --arg id "$id_b" '
    .userStories[] | select(.id == $id) | .files // [] | .[]
  ' "$PRD_PATH" 2>/dev/null) || true

  # Empty files = treat as overlap (unknown surface, can't safely swarm)
  [[ -z "$files_a" || -z "$files_b" ]] && return 0

  # Check intersection
  while IFS= read -r fa; do
    [[ -z "$fa" ]] && continue
    while IFS= read -r fb; do
      [[ -z "$fb" ]] && continue
      [[ "$fa" == "$fb" ]] && return 0  # overlap found
    done <<< "$files_b"
  done <<< "$files_a"

  return 1  # no overlap
}

# Get all stories eligible for concurrent swarm execution.
# Returns story IDs one per line (empty = nothing eligible).
# Selection: deps resolved → has files[] → no active lock conflicts → pairwise no file overlap
get_swarm_candidates() {
  # 1. Get all dep-resolved, incomplete stories (same jq as get_next_story)
  local candidates
  candidates=$(jq -r '
    .userStories as $all |
    [.userStories[] | select(.passes != true)] |
    [.[] | select(
      (.dependsOn // []) | all(. as $dep | $all[] | select(.id == $dep) | .passes == true)
    )] |
    sort_by(.priority // 99) |
    .[].id
  ' "$PRD_PATH") || true

  [[ -z "$candidates" ]] && return 0

  # 2. Filter: must have files[] declared AND no existing lock conflicts
  local eligible_list=""
  local eligible_count=0
  while IFS= read -r cid; do
    [[ -z "$cid" ]] && continue
    if story_has_files_declared "$cid" && ! has_file_conflict "$cid"; then
      eligible_list="${eligible_list}${cid}"$'\n'
      eligible_count=$((eligible_count + 1))
    fi
  done <<< "$candidates"

  [[ "$eligible_count" -eq 0 ]] && return 0

  # 3. Pairwise overlap elimination — greedy selection
  local selected_list=""
  local selected_count=0
  while IFS= read -r cid; do
    [[ -z "$cid" ]] && continue
    local conflict=false
    # Check against all already-selected stories
    while IFS= read -r sel; do
      [[ -z "$sel" ]] && continue
      if stories_have_file_overlap "$cid" "$sel"; then
        conflict=true
        break
      fi
    done <<< "$selected_list"

    if [[ "$conflict" == false ]]; then
      selected_list="${selected_list}${cid}"$'\n'
      selected_count=$((selected_count + 1))
    fi
    # Respect max concurrency cap
    [[ "$selected_count" -ge "$SWARM_MAX" ]] && break
  done <<< "$eligible_list"

  # Output selected candidates
  echo -n "$selected_list" | sed '/^$/d'
}

# =============================================================================
# Dry Run
# =============================================================================

if [[ "$DRY_RUN" == true ]]; then
  echo -e "${BOLD}Dry Run — Story Execution Order:${NC}\n"
  idx=1
  batch_num=0

  # Simulate the selection loop
  temp_prd=$(mktemp)
  cp "$PRD_PATH" "$temp_prd"

  while true; do
    # Get all candidates with resolved deps
    candidates=$(jq -r '
      .userStories as $all |
      [.userStories[] | select(.passes != true)] |
      [.[] | select(
        (.dependsOn // []) | all(. as $dep | $all[] | select(.id == $dep) | .passes == true)
      )] |
      .[].id // empty
    ' "$temp_prd")

    [[ -z "$candidates" ]] && break

    # In swarm mode, show parallel batches
    if [[ "$SWARM_MODE" == true ]]; then
      # Collect candidates that can run in parallel (no file overlap)
      parallel_batch=()
      sequential_fallback=()

      while IFS= read -r cand_id; do
        [[ -z "$cand_id" ]] && continue
        cand_files=$(jq -r --arg id "$cand_id" '.userStories[] | select(.id == $id) | .files // [] | .[]' "$temp_prd" 2>/dev/null)

        # Check overlap with existing batch members
        has_overlap=false
        if [[ -z "$cand_files" ]]; then
          # No files declared — conservative: can't parallelize
          sequential_fallback+=("$cand_id")
          continue
        fi

        if [[ ${#parallel_batch[@]} -gt 0 ]]; then
          for batch_id in "${parallel_batch[@]}"; do
            batch_files=$(jq -r --arg id "$batch_id" '.userStories[] | select(.id == $id) | .files // [] | .[]' "$temp_prd" 2>/dev/null)
            for cf in $cand_files; do
              for bf in $batch_files; do
                if [[ "$cf" == "$bf" ]]; then
                  has_overlap=true; break 3
                fi
              done
            done
          done
        fi

        if [[ "$has_overlap" == false && ${#parallel_batch[@]} -lt "$SWARM_MAX" ]]; then
          parallel_batch+=("$cand_id")
        else
          sequential_fallback+=("$cand_id")
        fi
      done <<< "$candidates"

      if [[ ${#parallel_batch[@]} -gt 1 ]]; then
        batch_num=$((batch_num + 1))
        echo -e "  ${GREEN}── Parallel Batch $batch_num (${#parallel_batch[@]} stories) ──${NC}"
        for pid_story in "${parallel_batch[@]}"; do
          title=$(jq -r --arg id "$pid_story" '.userStories[] | select(.id == $id) | .title' "$temp_prd")
          deps=$(jq -r --arg id "$pid_story" '.userStories[] | select(.id == $id) | .dependsOn // [] | join(", ")' "$temp_prd")
          dep_note=""
          [[ -n "$deps" ]] && dep_note=" ${DIM}(after: $deps)${NC}"
          echo -e "    ${BOLD}$idx.${NC} $pid_story: $title$dep_note"
          jq --arg id "$pid_story" '(.userStories[] | select(.id == $id)).passes = true' "$temp_prd" > "$temp_prd.tmp" \
            && mv "$temp_prd.tmp" "$temp_prd"
          idx=$((idx + 1))
        done
      else
        # Single candidate or all in sequential fallback
        first_cand="${parallel_batch[0]:-${sequential_fallback[0]:-}}"
        [[ -z "$first_cand" ]] && break

        title=$(jq -r --arg id "$first_cand" '.userStories[] | select(.id == $id) | .title' "$temp_prd")
        deps=$(jq -r --arg id "$first_cand" '.userStories[] | select(.id == $id) | .dependsOn // [] | join(", ")' "$temp_prd")
        dep_note=""
        [[ -n "$deps" ]] && dep_note=" ${DIM}(after: $deps)${NC}"
        echo -e "  ${BOLD}$idx.${NC} $first_cand: $title$dep_note"
        jq --arg id "$first_cand" '(.userStories[] | select(.id == $id)).passes = true' "$temp_prd" > "$temp_prd.tmp" \
          && mv "$temp_prd.tmp" "$temp_prd"
        idx=$((idx + 1))
      fi
    else
      # Sequential mode — pick first candidate only
      next=$(echo "$candidates" | head -1)
      [[ -z "$next" ]] && break

      title=$(jq -r --arg id "$next" '.userStories[] | select(.id == $id) | .title' "$temp_prd")
      deps=$(jq -r --arg id "$next" '.userStories[] | select(.id == $id) | .dependsOn // [] | join(", ")' "$temp_prd")

      dep_note=""
      [[ -n "$deps" ]] && dep_note=" ${DIM}(after: $deps)${NC}"
      echo -e "  ${BOLD}$idx.${NC} $next: $title$dep_note"

      # Mark as passed for next iteration
      jq --arg id "$next" '(.userStories[] | select(.id == $id)).passes = true' "$temp_prd" > "$temp_prd.tmp" \
        && mv "$temp_prd.tmp" "$temp_prd"
      idx=$((idx + 1))
    fi
  done

  # Check for blocked stories
  blocked=$(jq -r '[.userStories[] | select(.passes != true)] | length' "$temp_prd")
  if [[ "$blocked" -gt 0 ]]; then
    echo ""
    echo -e "${YELLOW}Blocked (unresolvable deps):${NC}"
    jq -r '.userStories[] | select(.passes != true) | "  \(.id): \(.title) (needs: \(.dependsOn | join(", ")))"' "$temp_prd"
  fi

  if [[ "$SWARM_MODE" == true && "$batch_num" -gt 0 ]]; then
    echo ""
    echo -e "${DIM}Swarm mode: $batch_num parallel batch(es) detected${NC}"
  fi

  rm -f "$temp_prd" "$temp_prd.tmp"
  echo ""
  exit 0
fi

# =============================================================================
# Run a Single Story
# =============================================================================

run_story() {
  local story_id="$1"
  local project="$2"
  local prd_path="$3"

  # Read model_hint from story (story-level override)
  local model_hint
  model_hint=$(jq -r --arg id "$story_id" '.userStories[] | select(.id == $id) | .model_hint // empty' "$HQ_ROOT/$prd_path" 2>/dev/null) || true

  # Read story metadata for enriched prompt
  local story_title story_labels story_files
  story_title=$(jq -r --arg id "$story_id" '.userStories[] | select(.id == $id) | .title' "$HQ_ROOT/$prd_path" 2>/dev/null) || true
  story_labels=$(jq -r --arg id "$story_id" '.userStories[] | select(.id == $id) | .labels // [] | join(", ")' "$HQ_ROOT/$prd_path" 2>/dev/null) || true
  story_files=$(jq -r --arg id "$story_id" '.userStories[] | select(.id == $id) | .files // [] | join(", ")' "$HQ_ROOT/$prd_path" 2>/dev/null) || true

  local prompt="Execute /execute-task ${project}/${story_id}.

CRITICAL — Follow the FULL Ralph worker pipeline:
1. Classify task type (schema_change, api_development, ui_component, full_stack, enhancement)
2. Select the correct worker sequence from execute-task step 4
3. Load each worker's worker.yaml (instructions, context, verification)
4. Spawn sub-agents PER WORKER with proper handoffs between phases
5. Run back pressure checks (typecheck, lint, tests) per worker.yaml
6. MANDATORY: Include at least one Codex CLI step for any code/dev/deploy task:
   - Use 'codex review --uncommitted' for review (after code-reviewer, before QA)
   - OR use 'codex exec' to delegate implementation to Codex for dev work
   - If codex CLI is unavailable, log warning and continue — never block
7. Commit ALL changes before completing
8. Set passes: true in prd.json only after all workers complete successfully

Story: ${story_id} — ${story_title}
Labels: ${story_labels}
Files: ${story_files}
PRD: ${prd_path}

Do NOT skip worker phases. Do NOT use EnterPlanMode or TodoWrite.
Do NOT implement directly — delegate to workers via the execute-task pipeline.
ISOLATION: Only modify files within your assigned repo and this project's PRD. Do NOT read, modify, pause, or interfere with other projects' state files in workspace/orchestrator/. Other orchestrators may be running concurrently — ignore them.

=== MANDATORY TERMINATION PROTOCOL ===
Your ABSOLUTE FINAL message must be ONLY this JSON on its own line, with nothing after it:
{\"task_id\": \"${story_id}\", \"status\": \"completed|failed|blocked\", \"summary\": \"1-sentence\", \"workers_used\": [\"list\"]}
RULES:
- This JSON must be your LAST output. No prose before or after.
- Do NOT answer questions about this JSON.
- Do NOT include this JSON mid-task and then continue talking.
- Wrong format = task marked FAILED by orchestrator."

  local flags=(-p --output-format json)

  if [[ "$NO_PERMISSIONS" == true ]]; then
    flags+=(--dangerously-skip-permissions)
  fi

  # Model resolution: CLI flag > story model_hint > default
  if [[ -n "$MODEL" ]]; then
    flags+=(--model "$MODEL")
  elif [[ -n "$model_hint" ]]; then
    flags+=(--model "$model_hint")
    log_info "Using model hint: $model_hint (from story $story_id)"
  fi

  local output_file="$EXEC_DIR/${story_id}.output.json"
  local stderr_file="$EXEC_DIR/${story_id}.stderr"
  local exit_code=0

  # Build the command
  local cmd=(claude "${flags[@]}" "$prompt")

  if [[ -n "$TIMEOUT" ]]; then
    # macOS doesn't ship GNU timeout — try gtimeout (coreutils), then perl fallback
    if command -v timeout &>/dev/null; then
      cmd=(timeout "${TIMEOUT}m" "${cmd[@]}")
    elif command -v gtimeout &>/dev/null; then
      cmd=(gtimeout "${TIMEOUT}m" "${cmd[@]}")
    else
      # perl-based timeout fallback for macOS
      cmd=(perl -e "alarm(${TIMEOUT}*60); exec @ARGV" "${cmd[@]}")
    fi
  fi

  # Clear orchestrator's checkout lock for this story before subprocess — execute-task will acquire its own.
  # Prevents self-locking: parent PID is alive so execute-task's AskUserQuestion fires
  # but can't resolve in headless (-p) mode.
  if [[ -f "$STATE_FILE" ]]; then
    jq --arg sid "$story_id" --arg ts "$(ts)" '
      .current_tasks = [(.current_tasks // [])[] |
        if .id == $sid then .checkedOutBy = null else . end
      ] |
      .updated_at = $ts
    ' "$STATE_FILE" > "$STATE_FILE.tmp" && mv "$STATE_FILE.tmp" "$STATE_FILE"
  fi

  # Execute (unset CLAUDECODE to allow nested claude sessions)
  if [[ "$VERBOSE" == true ]]; then
    cd "$HQ_ROOT" && env -u CLAUDECODE "${cmd[@]}" 2>"$stderr_file" | tee "$output_file" || exit_code=$?
  else
    cd "$HQ_ROOT" && env -u CLAUDECODE "${cmd[@]}" >"$output_file" 2>"$stderr_file" || exit_code=$?
  fi

  return $exit_code
}

# =============================================================================
# Git State Validation (self-healing)
# =============================================================================

validate_git_state() {
  local story_id="$1"

  { [[ -z "$REPO_PATH" ]] || ! is_git_repo "$REPO_PATH"; } && return 0

  local dirty
  dirty=$(git -C "$REPO_PATH" status --porcelain 2>/dev/null) || return 0

  if [[ -n "$dirty" ]]; then
    log_warn "Sub-agent left uncommitted changes. Auto-committing..."
    git -C "$REPO_PATH" add -A
    git -C "$REPO_PATH" commit -m "[orchestrator] ${story_id}: auto-commit uncommitted work" --no-verify 2>/dev/null || true
  fi
}

get_commit_sha() {
  { [[ -z "$REPO_PATH" ]] || ! is_git_repo "$REPO_PATH"; } && echo "n/a" && return
  git -C "$REPO_PATH" rev-parse --short HEAD 2>/dev/null || echo "n/a"
}

get_changed_files() {
  local story_id="$1"
  { [[ -z "$REPO_PATH" ]] || ! is_git_repo "$REPO_PATH"; } && echo "[]" && return
  # Files changed in last commit
  local _result
  _result=$(git -C "$REPO_PATH" diff-tree --no-commit-id --name-only -r HEAD 2>/dev/null \
    | jq -R -s 'split("\n") | map(select(length > 0))' 2>/dev/null) || true
  # Validate JSON before returning — protects --argjson in update_state_completed
  if [[ -z "$_result" ]] || ! jq -e . <<< "$_result" &>/dev/null; then
    echo "[]"
  else
    echo "$_result"
  fi
}

# =============================================================================
# Codex CLI Review (post-task safety net)
# =============================================================================

run_codex_review() {
  local story_id="$1"

  # Only run for repos with code changes
  { [[ -z "$REPO_PATH" ]] || ! is_git_repo "$REPO_PATH"; } && return 0

  # Check if codex CLI is available
  if ! command -v codex >/dev/null 2>&1; then
    log_warn "Codex CLI not found — skipping post-task review for $story_id"
    return 0
  fi

  # Check if there are recent changes to review (last commit by this story)
  local last_commit_msg
  last_commit_msg=$(git -C "$REPO_PATH" log -1 --format=%s 2>/dev/null) || return 0

  # Only review if the last commit looks like it's from this story
  if ! echo "$last_commit_msg" | grep -qi "$story_id\|orchestrator"; then
    # No obvious story commit — review uncommitted changes if any
    local uncommitted
    uncommitted=$(git -C "$REPO_PATH" diff --stat HEAD 2>/dev/null) || return 0
    [[ -z "$uncommitted" ]] && return 0
  fi

  local story_title
  story_title=$(get_story_title "$story_id")
  local review_file="$EXEC_DIR/${story_id}.codex-review.md"

  log_info "Codex review: $story_id — $story_title"

  # Run codex review on the last commit's changes
  (cd "$REPO_PATH" && codex review \
    "Review the latest changes for $story_id ($story_title). Check for: correctness, security, performance, style consistency. Flag any issues but do not modify files." \
    2>&1) > "$review_file" || true

  if [[ -s "$review_file" ]]; then
    local findings
    findings=$(wc -l < "$review_file" | tr -d ' ')
    log_ok "Codex review saved: $review_file ($findings lines)"

    # Check for critical findings
    if grep -qi "critical\|high.*severity\|security.*vuln\|injection" "$review_file" 2>/dev/null; then
      log_warn "Codex found potentially critical issues — see $review_file"
    fi
    # Return severity for autofix integration
    CODEX_REVIEW_SEVERITY=0
    if grep -qi "P1\|critical\|high.*severity\|security.*vuln\|injection" "$review_file" 2>/dev/null; then
      CODEX_REVIEW_SEVERITY=4
    elif grep -qi "P2\|medium.*severity\|potential.*bug\|missing.*validation" "$review_file" 2>/dev/null; then
      CODEX_REVIEW_SEVERITY=3
    fi

    # Codex autofix: if enabled and severity >= 3, spawn fix agent
    if [[ "$CODEX_AUTOFIX" == "true" && "$CODEX_REVIEW_SEVERITY" -ge 3 ]]; then
      run_codex_fix_agent "$story_id" "$review_file"
    fi
  else
    log_info "Codex review: no findings for $story_id"
    rm -f "$review_file"
    CODEX_REVIEW_SEVERITY=0
  fi
}

# =============================================================================
# Codex Autofix (opt-in: --codex-autofix)
# =============================================================================

run_codex_fix_agent() {
  local story_id="$1"
  local review_file="$2"

  log_info "Codex autofix: spawning fix agent for $story_id (severity=$CODEX_REVIEW_SEVERITY)"

  local fix_prompt
  fix_prompt="You are a targeted code fix agent. A codex review found P1/P2 issues in story $story_id.

Review file contents:
$(cat "$review_file" 2>/dev/null)

Repository path: $REPO_PATH

Instructions:
1. Read each P1/P2 finding from the review
2. Fix ONLY the specific issues flagged — do not refactor, do not add features
3. After fixing, run the project's quality gates if available
4. Commit fixes with message: [codex-autofix] $story_id: fix P1/P2 findings

Do NOT modify the PRD. Do NOT run unrelated changes."

  local fix_output="$EXEC_DIR/${story_id}.codex-fix.json"

  timeout 300 claude -p "$fix_prompt" \
    --output-format json \
    --max-turns 15 \
    ${NO_PERMISSIONS:+--dangerously-skip-permissions} \
    > "$fix_output" 2>&1 || {
    log_warn "Codex fix agent failed or timed out for $story_id (non-blocking)"
    return 0
  }

  log_ok "Codex autofix completed for $story_id — see $fix_output"

  # Re-run codex review to verify fixes (one pass only, no recursion)
  local old_autofix="$CODEX_AUTOFIX"
  CODEX_AUTOFIX=false  # prevent recursion
  run_codex_review "$story_id"
  CODEX_AUTOFIX="$old_autofix"

  return 0
}

# =============================================================================
# Doc Sweep (post-project: update 4 documentation layers)
# =============================================================================

run_doc_sweep() {
  local project="$1"
  local prd_path="$2"

  log_info "Doc sweep: scanning 4 layers for $project"

  # Build story summary from completed tasks
  local story_summary
  story_summary=$(jq -r '.userStories[] | select(.passes == true) | "- \(.id): \(.title)"' "$HQ_ROOT/$prd_path" 2>/dev/null) || true
  [[ -z "$story_summary" ]] && { log_warn "Doc sweep: no completed stories found"; return 0; }

  local repo_path="$REPO_PATH"
  local company="$COMPANY"
  local branch="${BRANCH_NAME:-main}"

  local prompt
  prompt="You are running a post-project documentation sweep for project '$project'.

The following stories were completed:
$story_summary

PRD: $prd_path
Repo: $repo_path
Company: $company

Update 4 documentation layers based on what changed:

1. INTERNAL DOCS (team-facing: tech guides, SOPs, manuals, ontology, taxonomy)
   - Path: ${repo_path}/docs/ or similar MDX dirs
   - Check if completed stories introduced new APIs, services, patterns, config not documented
   - Create/update MDX files as needed
   - Only document what actually changed — no boilerplate

2. EXTERNAL DOCS (customer/vendor-facing documentation)
   - Path: ${repo_path}/docs/ or published doc site
   - Check if user-facing features need documentation updates
   - Skip if project has no external surface

3. REPO KNOWLEDGE (agent context)
   - Path: ${repo_path}/.claude/CLAUDE.md and ${repo_path}/.claude/policies/
   - Update CLAUDE.md with new patterns, gotchas, file locations discovered during project
   - Add policies for recurring issues found during execution

4. COMPANY KNOWLEDGE (business knowledge)
   - Path: $HQ_ROOT/companies/${company}/knowledge/
   - This is a SEPARATE git repo — commit here independently
   - cd companies/${company}/knowledge/ && git add -A && git commit -m 'docs: update from $project completion'
   - Update architecture docs, integration docs, process docs as needed

Rules:
- Commit repo docs to the repo branch ($branch)
- Commit company knowledge to the knowledge repo (separate git)
- Do NOT create boilerplate — only document what actually changed
- Do NOT use EnterPlanMode or TodoWrite
- Output JSON: {\"layers_updated\": [\"internal\",\"external\",\"repo_knowledge\",\"company_knowledge\"], \"files_touched\": [], \"summary\": \"1-sentence\"}"

  local flags=(-p --output-format json)

  if [[ "$NO_PERMISSIONS" == true ]]; then
    flags+=(--dangerously-skip-permissions)
  fi

  if [[ -n "$MODEL" ]]; then
    flags+=(--model "$MODEL")
  fi

  local output_file="$EXEC_DIR/doc-sweep.output.json"
  local stderr_file="$EXEC_DIR/doc-sweep.stderr"

  local cmd=(claude "${flags[@]}" "$prompt")
  local exit_code=0

  cd "$HQ_ROOT" && env -u CLAUDECODE "${cmd[@]}" >"$output_file" 2>"$stderr_file" || exit_code=$?

  if [[ $exit_code -eq 0 ]]; then
    log_ok "Doc sweep completed — see $output_file"
    "$AUDIT_SCRIPT" append --event doc_sweep_completed --project "$project" \
      ${company:+--company "$company"} \
      --action "Doc sweep: 4 layers scanned" \
      --result success \
      --session-id "$SESSION_ID" || true
  else
    log_warn "Doc sweep failed (exit=$exit_code) — non-blocking, see $stderr_file"
    "$AUDIT_SCRIPT" append --event doc_sweep_failed --project "$project" \
      ${company:+--company "$company"} \
      --action "Doc sweep failed" \
      --result fail \
      --error "exit=$exit_code" \
      --session-id "$SESSION_ID" || true
  fi

  # Remove legacy flag file
  rm -f "$PROJECT_DIR/doc-sweep-flag.json" 2>/dev/null || true
}

# =============================================================================
# Regression Gate
# =============================================================================

run_regression_gate() {
  local after_story="$1"
  local gates
  gates=$(jq -r '.metadata.qualityGates // [] | .[]' "$PRD_PATH" 2>/dev/null) || return 0
  [[ -z "$gates" ]] && return 0
  [[ -z "$REPO_PATH" || ! -d "$REPO_PATH" ]] && return 0

  log_info "Running regression gates after $after_story..."

  # Baseline file captures pre-existing error counts at project start
  local baseline_file="$PROJECT_DIR/regression-baseline.json"

  local gate_passed=true
  while IFS= read -r gate; do
    [[ -z "$gate" ]] && continue
    log "  Gate: $gate"
    local output
    local exit_code=0
    output=$(cd "$REPO_PATH" && eval "$gate" 2>&1) || exit_code=$?

    if [[ $exit_code -eq 0 ]]; then
      log_ok "  Passed: $gate"
      continue
    fi

    # Gate failed — check if errors are pre-existing (baseline comparison)
    # Count error lines (heuristic: lines containing "error" case-insensitive)
    local err_count
    err_count=$(echo "$output" | grep -ci "error" 2>/dev/null || echo "0")
    local gate_key
    gate_key=$(echo "$gate" | tr ' ' '_')

    # Capture baseline on first regression gate run
    if [[ ! -f "$baseline_file" ]]; then
      log "  Capturing baseline error counts..."
      # Run gate against baseBranch to get pre-existing error count.
      # When using a worktree, ORIGINAL_REPO_PATH stays on baseBranch — no checkout needed.
      # When in-place, fall back to stash/checkout on REPO_PATH.
      local baseline_repo="${ORIGINAL_REPO_PATH:-$REPO_PATH}"
      local base_err_count=0
      local base_exit=0
      local base_output=""
      if [[ -n "$ORIGINAL_REPO_PATH" ]]; then
        # Worktree mode: original repo is already on baseBranch
        base_output=$(cd "$baseline_repo" && eval "$gate" 2>&1) || base_exit=$?
      else
        # In-place mode: stash, checkout baseBranch, measure, restore
        local base_branch
        base_branch=$(jq -r '.metadata.baseBranch // "main"' "$PRD_PATH" 2>/dev/null || echo "main")
        local current_branch
        current_branch=$(cd "$REPO_PATH" && git branch --show-current)
        local stashed=false
        if (cd "$REPO_PATH" && ! git diff --quiet HEAD 2>/dev/null); then
          (cd "$REPO_PATH" && git stash push -q 2>/dev/null) && stashed=true
        fi
        base_output=$(cd "$REPO_PATH" && git checkout "$base_branch" -q 2>/dev/null && eval "$gate" 2>&1) || base_exit=$?
        (cd "$REPO_PATH" && git checkout "$current_branch" -q 2>/dev/null) || log_warn "  Failed to checkout back to $current_branch"
        [[ "$stashed" == true ]] && (cd "$REPO_PATH" && git stash pop -q 2>/dev/null) || true
      fi
      if [[ $base_exit -ne 0 ]]; then
        base_err_count=$(echo "$base_output" | grep -ci "error" 2>/dev/null || echo "0")
      fi
      # Initialize baseline file
      echo "{}" > "$baseline_file"
      jq --arg key "$gate_key" --argjson count "$base_err_count" \
        '. + {($key): $count}' "$baseline_file" > "$baseline_file.tmp" \
        && mv "$baseline_file.tmp" "$baseline_file"
    fi

    local baseline_count
    baseline_count=$(jq -r --arg key "$gate_key" '.[$key] // 0' "$baseline_file" 2>/dev/null || echo "0")

    if [[ "$err_count" -le "$baseline_count" ]]; then
      log_warn "  $gate: $err_count errors (≤ baseline $baseline_count — pre-existing, not a regression)"
    else
      log_err "  REGRESSION: $gate — $err_count errors (baseline: $baseline_count, +$((err_count - baseline_count)) new)"
      gate_passed=false
    fi
  done <<< "$gates"

  # Record gate result
  jq --arg story "$after_story" --arg ts "$(ts)" --argjson pass "$([[ "$gate_passed" == true ]] && echo true || echo false)" '
    .regression_gates += [{"after_story": $story, "passed": $pass, "timestamp": $ts}]
  ' "$STATE_FILE" > "$STATE_FILE.tmp" && mv "$STATE_FILE.tmp" "$STATE_FILE"

  if [[ "$gate_passed" == false ]]; then
    echo ""
    echo -e "${RED}Regression gate failed after $after_story.${NC}"
    if [[ -t 0 ]]; then
      echo "Options:"
      echo "  1) Continue anyway"
      echo "  2) Pause (resume later with --resume)"
      echo "  3) Abort"
      read -rp "Choice [1-3]: " choice
      case "$choice" in
        1) return 0 ;;
        2) jq --arg ts "$(ts)" '.status = "paused" | .updated_at = $ts' "$STATE_FILE" > "$STATE_FILE.tmp" \
             && mv "$STATE_FILE.tmp" "$STATE_FILE"
           log_warn "Paused. Resume with: scripts/run-project.sh --resume $PROJECT"
           exit 0 ;;
        *) exit 1 ;;
      esac
    else
      log_warn "Non-interactive: auto-pausing after regression failure."
      jq --arg ts "$(ts)" '.status = "paused" | .updated_at = $ts' "$STATE_FILE" > "$STATE_FILE.tmp" \
        && mv "$STATE_FILE.tmp" "$STATE_FILE"
      exit 1
    fi
  fi
}

# =============================================================================
# Project Reanchor
# =============================================================================

run_project_reanchor() {
  local project_name="$1"
  local completed_count="$2"
  local reanchor_num=$((completed_count / 3))
  local reanchor_file="$EXEC_DIR/reanchor-${reanchor_num}.md"

  log_info "Project reanchor #${reanchor_num}: evaluating remaining stories after ${completed_count} completions"

  # Build context: recent outputs + codex reviews
  local recent_outputs=""
  local recent_reviews=""
  for f in "$EXEC_DIR"/*.output.json; do
    [[ -f "$f" ]] && recent_outputs="$recent_outputs $(basename "$f")"
  done
  for f in "$EXEC_DIR"/*.codex-review.md; do
    [[ -f "$f" ]] && recent_reviews="$recent_reviews $(basename "$f")"
  done

  local reanchor_prompt="You are a project reanchor agent. Your job is to evaluate whether remaining story specs are still valid after ${completed_count} stories have been completed.

Read the PRD at: ${PRD_PATH}
Read progress at: ${EXEC_DIR}/../../progress.txt (if exists)

For each remaining story (passes != true), evaluate:
1. Are acceptance criteria still accurate given what was implemented?
2. Did a completed story partially address this story's work?
3. Any new required work discovered from execution?
4. Is this story now unnecessary?

Output a markdown report with:
- Summary of findings
- Per-story assessment (keep/modify/remove recommendation)
- Specific AC changes needed (if any)
- New work discovered (if any)

IMPORTANT: Do NOT modify the PRD. Only write your analysis report.
Write your report to: ${reanchor_file}"

  # Best-effort, non-blocking — don't fail the loop
  timeout 300 claude -p "$reanchor_prompt" \
    --output-format json \
    --max-turns 10 \
    > "$EXEC_DIR/reanchor-${reanchor_num}.output.json" 2>&1 || {
    log_warn "Project reanchor #${reanchor_num} failed or timed out (non-blocking)"
    return 0
  }

  if [[ -f "$reanchor_file" ]]; then
    log_ok "Reanchor report written: $reanchor_file"
  else
    log_warn "Reanchor agent completed but no report file found"
  fi

  return 0
}

# =============================================================================
# Failure Handling
# =============================================================================

handle_failure() {
  local story_id="$1"
  local attempt="$2"

  if [[ -t 0 ]]; then
    echo ""
    echo -e "${RED}FAILED: $story_id (attempt $attempt)${NC}"
    echo -e "${DIM}Logs: $EXEC_DIR/${story_id}.stderr${NC}"
    echo ""
    echo "Options:"
    echo "  1) Retry this story"
    echo "  2) Skip and continue"
    echo "  3) Pause (resume with --resume)"
    echo "  4) Abort"
    read -rp "Choice [1-4]: " choice
    case "$choice" in
      1) return 0 ;;  # retry
      2) return 2 ;;  # skip
      3) return 3 ;;  # pause
      *) exit 1 ;;
    esac
  else
    # Non-interactive: auto-retry once, then skip
    if [[ "$attempt" -lt 2 ]]; then
      log_warn "Auto-retrying $story_id (attempt $((attempt+1)))..."
      return 0  # retry
    else
      log_warn "Auto-skipping $story_id after $attempt attempts."
      return 2  # skip
    fi
  fi
}

# =============================================================================
# Update State After Story
# =============================================================================

update_state_completed() {
  local story_id="$1"
  local commit_sha="$2"
  local files_changed="$3"

  read_prd_stats

  jq \
    --arg id "$story_id" \
    --arg ts "$(ts)" \
    --arg sha "$commit_sha" \
    --argjson files "$files_changed" \
    --argjson total "$TOTAL" \
    --argjson completed "$COMPLETED" \
  '
    .completed_tasks += [{"id": $id, "completed_at": $ts, "commit_sha": $sha, "files_changed": $files}] |
    .current_tasks = [(.current_tasks // [])[] | select(.id != $id)] |
    .progress.total = $total |
    .progress.completed = $completed |
    .progress.failed = (.failed_tasks | length) |
    .progress.in_progress = (.current_tasks | length) |
    .updated_at = $ts
  ' "$STATE_FILE" > "$STATE_FILE.tmp" && mv "$STATE_FILE.tmp" "$STATE_FILE"
}

update_state_failed() {
  local story_id="$1"
  local error="$2"

  jq \
    --arg id "$story_id" \
    --arg ts "$(ts)" \
    --arg err "$error" \
  '
    .failed_tasks += [{"id": $id, "error": $err, "timestamp": $ts}] |
    .retry_queue += [$id] |
    .current_tasks = [(.current_tasks // [])[] | select(.id != $id)] |
    .progress.failed = (.failed_tasks | length) |
    .progress.in_progress = (.current_tasks | length) |
    .updated_at = $ts
  ' "$STATE_FILE" > "$STATE_FILE.tmp" && mv "$STATE_FILE.tmp" "$STATE_FILE"
}

# Add a task to current_tasks[] with PID and worktree info (for swarm mode)
update_state_add_task() {
  local story_id="$1"
  local pid="$2"
  local worktree_path="${3:-}"

  jq --arg id "$story_id" \
     --arg pid "$pid" \
     --arg wt "$worktree_path" \
     --arg ts "$(ts)" \
     --arg sid "$SESSION_ID" \
  '
    .current_tasks = ((.current_tasks // []) | map(select(.id != $id))) + [{
      "id": $id,
      "started_at": $ts,
      "pid": (if $pid == "" then null else ($pid | tonumber) end),
      "worktree_path": $wt,
      "checkedOutBy": {"pid": (if $pid == "" then null else ($pid | tonumber) end), "startedAt": $ts, "sessionId": $sid}
    }] |
    .progress.in_progress = (.current_tasks | length) |
    .updated_at = $ts
  ' "$STATE_FILE" > "$STATE_FILE.tmp" && mv "$STATE_FILE.tmp" "$STATE_FILE"
}

# Remove a task from current_tasks[] (on completion or failure)
update_state_remove_task() {
  local story_id="$1"
  jq --arg id "$story_id" --arg ts "$(ts)" '
    .current_tasks = [(.current_tasks // [])[] | select(.id != $id)] |
    .progress.in_progress = (.current_tasks | length) |
    .updated_at = $ts
  ' "$STATE_FILE" > "$STATE_FILE.tmp" && mv "$STATE_FILE.tmp" "$STATE_FILE"
}

update_state_current() {
  local story_id="$1"
  # In sequential mode, checkout_story already added to current_tasks[].
  # Just update the started_at timestamp on the entry.
  jq --arg id "$story_id" --arg ts "$(ts)" '
    .current_tasks = [(.current_tasks // [])[] |
      if .id == $id then .started_at = $ts else . end
    ] |
    .progress.in_progress = (.current_tasks | length) |
    .updated_at = $ts
  ' "$STATE_FILE" > "$STATE_FILE.tmp" && mv "$STATE_FILE.tmp" "$STATE_FILE"
}

# =============================================================================
# Linear Sync (best-effort, never blocks execution)
# =============================================================================

sync_linear_start() {
  local story_id="$1"

  # Get Linear issue ID from story
  local linear_issue_id
  linear_issue_id=$(jq -r --arg id "$story_id" '.userStories[] | select(.id == $id) | .linearIssueId // empty' "$PRD_PATH" 2>/dev/null) || return 0
  [[ -z "$linear_issue_id" ]] && return 0

  # Get Linear credentials path from metadata
  local creds_path
  creds_path=$(jq -r '.metadata.linearCredentials // empty' "$PRD_PATH" 2>/dev/null) || return 0
  [[ -z "$creds_path" ]] && return 0

  local creds_file="$HQ_ROOT/$creds_path"
  [[ -f "$creds_file" ]] || return 0

  # Cross-company guard: verify creds match company
  local company
  company=$(jq -r '.metadata.company // empty' "$PRD_PATH" 2>/dev/null) || return 0
  if [[ -n "$company" ]] && ! echo "$creds_path" | grep -q "companies/$company/"; then
    log_warn "Linear creds path doesn't match company '$company' — skipping Linear sync"
    return 0
  fi

  local api_key
  api_key=$(jq -r '.apiKey // empty' "$creds_file" 2>/dev/null) || return 0
  [[ -z "$api_key" ]] && return 0

  # Get In Progress state ID from config
  local config_dir
  config_dir=$(dirname "$creds_file")
  local config_file="$config_dir/config.json"
  [[ -f "$config_file" ]] || return 0

  local in_progress_id
  in_progress_id=$(jq -r '.states.in_progress // .states.InProgress // empty' "$config_file" 2>/dev/null) || return 0
  [[ -z "$in_progress_id" ]] && return 0

  # Set issue to In Progress
  curl -sf -X POST https://api.linear.app/graphql \
    -H "Content-Type: application/json" \
    -H "Authorization: $api_key" \
    -d "{\"query\": \"mutation { issueUpdate(id: \\\"$linear_issue_id\\\", input: { stateId: \\\"$in_progress_id\\\" }) { success } }\"}" \
    >/dev/null 2>&1 || true

  # Comment on issue
  curl -sf -X POST https://api.linear.app/graphql \
    -H "Content-Type: application/json" \
    -H "Authorization: $api_key" \
    -d "{\"query\": \"mutation { commentCreate(input: { issueId: \\\"$linear_issue_id\\\", body: \\\"Started by HQ orchestrator — task in progress.\\\" }) { success } }\"}" \
    >/dev/null 2>&1 || true

  log_info "Linear: $story_id → In Progress"
}

sync_linear_done() {
  local story_id="$1"

  local linear_issue_id
  linear_issue_id=$(jq -r --arg id "$story_id" '.userStories[] | select(.id == $id) | .linearIssueId // empty' "$PRD_PATH" 2>/dev/null) || return 0
  [[ -z "$linear_issue_id" ]] && return 0

  local creds_path
  creds_path=$(jq -r '.metadata.linearCredentials // empty' "$PRD_PATH" 2>/dev/null) || return 0
  [[ -z "$creds_path" ]] && return 0

  local creds_file="$HQ_ROOT/$creds_path"
  [[ -f "$creds_file" ]] || return 0

  local api_key
  api_key=$(jq -r '.apiKey // empty' "$creds_file" 2>/dev/null) || return 0
  [[ -z "$api_key" ]] && return 0

  local config_dir
  config_dir=$(dirname "$creds_file")
  local config_file="$config_dir/config.json"
  [[ -f "$config_file" ]] || return 0

  local done_id
  done_id=$(jq -r '.states.done // .states.Done // empty' "$config_file" 2>/dev/null) || return 0
  [[ -z "$done_id" ]] && return 0

  curl -sf -X POST https://api.linear.app/graphql \
    -H "Content-Type: application/json" \
    -H "Authorization: $api_key" \
    -d "{\"query\": \"mutation { issueUpdate(id: \\\"$linear_issue_id\\\", input: { stateId: \\\"$done_id\\\" }) { success } }\"}" \
    >/dev/null 2>&1 || true

  curl -sf -X POST https://api.linear.app/graphql \
    -H "Content-Type: application/json" \
    -H "Authorization: $api_key" \
    -d "{\"query\": \"mutation { commentCreate(input: { issueId: \\\"$linear_issue_id\\\", body: \\\"Completed by HQ orchestrator.\\\" }) { success } }\"}" \
    >/dev/null 2>&1 || true
}

# =============================================================================
# Orchestrator Writes Passes (replaces execute-task's prd.json write)
# =============================================================================

# Parse the claude -p output JSON to determine pass/fail, then write passes: true
orchestrator_write_passes() {
  local story_id="$1"
  local checkout_started_at="${2:-}"  # ISO8601 timestamp when story execution began
  local output_file="$EXEC_DIR/${story_id}.output.json"

  # Early exit: already passed (execute-task may have written it directly)
  local already_passed
  already_passed=$(jq -r --arg id "$story_id" '
    .userStories[] | select(.id == $id) | .passes
  ' "$PRD_PATH" 2>/dev/null) || true

  if [[ "$already_passed" == "true" ]]; then
    return 0
  fi

  local status_from_output=""
  local detection_layer=""

  # --- Layer 1: Parse structured JSON from claude -p output ---
  # claude --output-format json puts the final response text in .result
  if [[ -f "$output_file" ]]; then
    status_from_output=$(jq -r '
      if .status then .status
      elif .result then (.result | if type == "string" then (fromjson? // {}) else . end | .status // empty)
      else empty end
    ' "$output_file" 2>/dev/null) || true
    [[ -n "$status_from_output" ]] && detection_layer="Layer 1 (.result JSON parse)"
  fi

  # --- Layer 2: Full-file scan for task_id + status pair ---
  # The structured JSON may have been emitted mid-conversation inside a content[].text block
  # but not in the final .result field. Search the raw file for both markers.
  # Note: claude -p --output-format json produces an array of conversation messages, and
  # the task completion JSON is often inside escaped text within a message content block.
  if [[ -z "$status_from_output" && -f "$output_file" ]]; then
    # Search for task_id matching this story paired with completed status anywhere in the file
    # The JSON may be inside escaped strings (e.g. \"task_id\": \"US-003\")
    if grep -q "task_id.*${story_id}" "$output_file" 2>/dev/null \
       && grep -q "\"status\".*\"completed\"\|status.*completed" "$output_file" 2>/dev/null; then
      # Verify the pair appears in the same text block (within 500 chars)
      # Extract all text content and look for the JSON object
      local found_pair
      found_pair=$(jq -r '
        [.[] | select(.type == "assistant") | .message.content[]? | select(.type == "text") | .text] |
        .[] | select(test("task_id.*'"$story_id"'")) | select(test("\"status\".*\"completed\""))
      ' "$output_file" 2>/dev/null | head -1) || true
      if [[ -n "$found_pair" ]]; then
        status_from_output="completed"
        detection_layer="Layer 2 (full-file scan: task_id + status in assistant message text)"
      fi
    fi
  fi

  # --- Layer 3: Git heuristic — commits + declared files touched ---
  # If the sub-agent committed work touching declared files, the story likely completed
  if [[ -z "$status_from_output" && -n "$checkout_started_at" && -n "$REPO_PATH" ]] && is_git_repo "$REPO_PATH"; then
    local recent_commits=0
    recent_commits=$(git -C "$REPO_PATH" log --oneline --after="$checkout_started_at" 2>/dev/null | wc -l | tr -d ' ') || true

    if [[ "${recent_commits:-0}" -gt 0 ]]; then
      local story_files_json
      story_files_json=$(jq -r --arg id "$story_id" '.userStories[] | select(.id == $id) | .files // []' "$PRD_PATH" 2>/dev/null) || true
      local story_files_count
      story_files_count=$(echo "$story_files_json" | jq 'length' 2>/dev/null) || true

      if [[ "${story_files_count:-0}" -gt 0 ]]; then
        local touched_count=0
        while IFS= read -r f; do
          [[ -z "$f" ]] && continue
          if git -C "$REPO_PATH" log --oneline --after="$checkout_started_at" -- "$f" 2>/dev/null | grep -q .; then
            touched_count=$((touched_count + 1))
          fi
        done < <(echo "$story_files_json" | jq -r '.[]' 2>/dev/null)

        if [[ "$touched_count" -gt 0 ]]; then
          status_from_output="completed"
          detection_layer="Layer 3 (git heuristic: $recent_commits commits, $touched_count/${story_files_count} declared files touched)"
        fi
      elif [[ "${recent_commits:-0}" -ge 2 ]]; then
        # No declared files but multiple commits — likely real work
        status_from_output="completed"
        detection_layer="Layer 3 (git heuristic: $recent_commits commits, no declared files)"
      fi
    fi
  fi

  # --- Write passes if any layer detected completion ---
  if [[ "$status_from_output" == "completed" ]]; then
    jq --arg id "$story_id" '
      (.userStories[] | select(.id == $id)).passes = true
    ' "$PRD_PATH" > "$PRD_PATH.tmp" && mv "$PRD_PATH.tmp" "$PRD_PATH"
    log_ok "Orchestrator set passes=true for $story_id [$detection_layer]"
  else
    log_warn "passes detection: no completion signal found for $story_id (all 3 layers failed)"
  fi
}

# =============================================================================
# Check-In Status (periodic monitoring for both sequential and swarm modes)
# =============================================================================

# Print current execution status — story IDs, PIDs, elapsed times, output sizes
print_checkin_status() {
  local now
  now=$(date +%s)

  echo ""
  echo -e "${BOLD}--- Check-In [$(date +%H:%M:%S)] ---${NC}"

  # Read current_tasks from state
  local task_count
  task_count=$(jq '.current_tasks // [] | length' "$STATE_FILE" 2>/dev/null) || task_count=0

  if [[ "$task_count" -eq 0 ]]; then
    echo -e "  ${DIM}No active tasks${NC}"
  else
    read_prd_stats 2>/dev/null || true
    echo -e "Active: ${BLUE}${task_count}${NC} | Completed: ${GREEN}${COMPLETED}${NC}/${TOTAL}"
    echo ""

    local i=0
    while [[ $i -lt $task_count ]]; do
      local sid pid start_ts
      sid=$(jq -r --argjson idx "$i" '.current_tasks[$idx].id // "?"' "$STATE_FILE" 2>/dev/null) || true
      pid=$(jq -r --argjson idx "$i" '.current_tasks[$idx].pid // .current_tasks[$idx].checkedOutBy.pid // "?"' "$STATE_FILE" 2>/dev/null) || true
      start_ts=$(jq -r --argjson idx "$i" '.current_tasks[$idx].started_at // empty' "$STATE_FILE" 2>/dev/null) || true

      local elapsed_str="?"
      if [[ -n "$start_ts" ]]; then
        local start_epoch
        start_epoch=$(date -j -u -f "%Y-%m-%dT%H:%M:%SZ" "$start_ts" "+%s" 2>/dev/null) || true
        if [[ -n "$start_epoch" ]]; then
          local elapsed=$(( now - start_epoch ))
          elapsed_str="$((elapsed / 60))m$((elapsed % 60))s"
        fi
      fi

      local title
      title=$(get_story_title "$sid" 2>/dev/null) || title="?"

      # Output file sizes (proxy for progress)
      local out_size=0 err_size=0
      [[ -f "$EXEC_DIR/${sid}.output.json" ]] && out_size=$(wc -c < "$EXEC_DIR/${sid}.output.json" 2>/dev/null | tr -d ' ') || true
      [[ -f "$EXEC_DIR/${sid}.stderr" ]] && err_size=$(wc -c < "$EXEC_DIR/${sid}.stderr" 2>/dev/null | tr -d ' ') || true

      local pid_status=""
      if [[ "$pid" != "?" ]] && kill -0 "$pid" 2>/dev/null; then
        pid_status="${GREEN}alive${NC}"
      elif [[ "$pid" != "?" ]]; then
        pid_status="${RED}exited${NC}"
      fi

      echo -e "  ${BOLD}${sid}${NC} — ${title}"
      echo -e "    PID: ${pid} (${pid_status}) | Elapsed: ${elapsed_str} | Output: ${out_size}b | Stderr: ${err_size}b"

      i=$((i + 1))
    done
  fi

  echo -e "${DIM}──────────────────────────────────${NC}"
  echo ""
}

# =============================================================================
# Swarm Functions
# =============================================================================

# Parallel indexed arrays for tracking swarm members (bash 3.2 compat — no associative arrays)
SWARM_STORY_IDS=()
SWARM_PIDS=()
SWARM_WORKTREES=()
SWARM_START_TIMES=()
SWARM_DONE=()
PENDING_REGRESSION_GATE=""

# Launch a story as a background process. Sets LAST_BG_PID.
run_story_background() {
  local story_id="$1"
  local story_worktree="${2:-}"

  local story_title story_labels story_files model_hint
  story_title=$(jq -r --arg id "$story_id" '.userStories[] | select(.id == $id) | .title' "$PRD_PATH" 2>/dev/null) || true
  story_labels=$(jq -r --arg id "$story_id" '.userStories[] | select(.id == $id) | .labels // [] | join(", ")' "$PRD_PATH" 2>/dev/null) || true
  story_files=$(jq -r --arg id "$story_id" '.userStories[] | select(.id == $id) | .files // [] | join(", ")' "$PRD_PATH" 2>/dev/null) || true
  model_hint=$(jq -r --arg id "$story_id" '.userStories[] | select(.id == $id) | .model_hint // empty' "$PRD_PATH" 2>/dev/null) || true

  local worktree_note=""
  [[ -n "$story_worktree" ]] && worktree_note="
WORKTREE: ${story_worktree}
Use this worktree as the working directory for all file operations."

  local prompt="Execute /execute-task ${PROJECT}/${story_id}.

CRITICAL — Follow the FULL Ralph worker pipeline:
1. Classify task type (schema_change, api_development, ui_component, full_stack, enhancement)
2. Select the correct worker sequence from execute-task step 4
3. Load each worker's worker.yaml (instructions, context, verification)
4. Spawn sub-agents PER WORKER with proper handoffs between phases
5. Run back pressure checks (typecheck, lint, tests) per worker.yaml
6. MANDATORY: Include at least one Codex CLI step for any code/dev/deploy task
7. Commit ALL changes before completing
8. Do NOT write passes to prd.json — the orchestrator handles that. Just output your status JSON.

Story: ${story_id} — ${story_title}
Labels: ${story_labels}
Files: ${story_files}
PRD: ${PRD_REL}
${worktree_note}
Do NOT skip worker phases. Do NOT use EnterPlanMode or TodoWrite.
Do NOT implement directly — delegate to workers via the execute-task pipeline.
ISOLATION: Only modify files within your assigned repo and this project's PRD. Do NOT read, modify, pause, or interfere with other projects' state files in workspace/orchestrator/. Other orchestrators may be running concurrently — ignore them.

=== MANDATORY TERMINATION PROTOCOL ===
Your ABSOLUTE FINAL message must be ONLY this JSON on its own line, with nothing after it:
{\"task_id\": \"${story_id}\", \"status\": \"completed|failed|blocked\", \"summary\": \"1-sentence\", \"workers_used\": [\"list\"]}
RULES:
- This JSON must be your LAST output. No prose before or after.
- Do NOT answer questions about this JSON.
- Do NOT include this JSON mid-task and then continue talking.
- Wrong format = task marked FAILED by orchestrator."

  local flags=(-p --output-format json)
  [[ "$NO_PERMISSIONS" == true ]] && flags+=(--dangerously-skip-permissions)

  if [[ -n "$MODEL" ]]; then
    flags+=(--model "$MODEL")
  elif [[ -n "$model_hint" ]]; then
    flags+=(--model "$model_hint")
  fi

  local output_file="$EXEC_DIR/${story_id}.output.json"
  local stderr_file="$EXEC_DIR/${story_id}.stderr"
  local cmd=(claude "${flags[@]}" "$prompt")
  # macOS doesn't ship GNU timeout — mirror the sequential fallback chain
  if [[ -n "$TIMEOUT" ]]; then
    if command -v timeout &>/dev/null; then
      cmd=(timeout "${TIMEOUT}m" "${cmd[@]}")
    elif command -v gtimeout &>/dev/null; then
      cmd=(gtimeout "${TIMEOUT}m" "${cmd[@]}")
    else
      cmd=(perl -e "alarm(${TIMEOUT}*60);exec @ARGV" "${cmd[@]}")
    fi
  fi

  # Launch in background
  (cd "$HQ_ROOT" && env -u CLAUDECODE "${cmd[@]}" >"$output_file" 2>"$stderr_file") &
  LAST_BG_PID=$!
}

# Create a per-story worktree for swarm isolation. Sets STORY_WORKTREE_PATH.
# Each story gets its own unique branch (project-branch/story-slug) to avoid
# git's "branch already checked out" error when the project worktree exists.
ensure_story_worktree() {
  local story_id="$1"
  local project_branch="${BRANCH_NAME:-main}"

  local story_slug
  story_slug=$(echo "$story_id" | tr '[:upper:]' '[:lower:]' | tr '_' '-')
  local branch_slug="${project_branch//\//-}"
  local base_repo="${ORIGINAL_REPO_PATH:-$REPO_PATH}"
  local wt_path="${base_repo}-wt-${branch_slug}-${story_slug}"
  # Each story worktree gets its own branch to avoid "already checked out" conflicts
  # Use -- separator (not /) to avoid git ref tree conflict with the project branch
  local story_branch="${project_branch}--${story_slug}"

  STORY_WORKTREE_PATH=""

  # Check if already exists
  if [[ -d "$wt_path" ]]; then
    STORY_WORKTREE_PATH="$wt_path"
    return 0
  fi

  [[ -z "$base_repo" || ! -d "$base_repo" ]] && return 1

  # Determine the commit to branch from: project branch if it exists, else base branch
  local start_point="${BASE_BRANCH:-main}"
  if git -C "$base_repo" show-ref --verify --quiet "refs/heads/${project_branch}" 2>/dev/null; then
    start_point="$project_branch"
  fi

  # Delete stale story branch if it exists (from a previous failed run)
  git -C "$base_repo" branch -D "$story_branch" 2>/dev/null || true

  # Create worktree with unique per-story branch
  git -C "$base_repo" worktree add -b "$story_branch" "$wt_path" "$start_point" 2>/dev/null || {
    log_err "Failed to create story worktree for $story_id at $wt_path"
    return 1
  }

  # Install deps if needed
  if [[ -f "$wt_path/bun.lockb" || -f "$wt_path/bun.lock" ]] && command -v bun >/dev/null 2>&1; then
    (cd "$wt_path" && bun install --frozen-lockfile 2>/dev/null) || true
  elif [[ -f "$wt_path/package-lock.json" ]]; then
    (cd "$wt_path" && npm ci 2>/dev/null) || true
  fi

  STORY_WORKTREE_PATH="$wt_path"
  log_ok "Story worktree ready: $wt_path ($story_id)"
}

# Pre-acquire file locks for a story BEFORE launching background process
preacquire_swarm_locks() {
  local story_id="$1"
  local pid="$2"

  [[ -z "$REPO_PATH" || ! -d "$REPO_PATH" ]] && return 0

  local lock_file="$REPO_PATH/.file-locks.json"
  [[ -f "$lock_file" ]] || echo '{"version":1,"locks":[]}' > "$lock_file"

  local story_files
  story_files=$(jq -r --arg id "$story_id" '
    .userStories[] | select(.id == $id) | .files // [] | .[]
  ' "$PRD_PATH" 2>/dev/null) || return 0
  [[ -z "$story_files" ]] && return 0

  local now_ts
  now_ts=$(ts)

  while IFS= read -r f; do
    [[ -z "$f" ]] && continue
    jq --arg file "$f" \
       --arg project "$PROJECT" \
       --arg story "$story_id" \
       --arg pid "$pid" \
       --arg ts "$now_ts" \
    '
      .locks = ((.locks // []) | map(select(.file != $file or .owner.story != $story))) + [{
        "file": $file,
        "owner": {"project": $project, "story": $story, "pid": ($pid | tonumber)},
        "acquired_at": $ts
      }]
    ' "$lock_file" > "$lock_file.tmp" && mv "$lock_file.tmp" "$lock_file"
  done <<< "$story_files"
}

# Release file locks for a story
release_swarm_locks() {
  local story_id="$1"

  [[ -z "$REPO_PATH" || ! -d "$REPO_PATH" ]] && return 0

  local lock_file="$REPO_PATH/.file-locks.json"
  [[ -f "$lock_file" ]] || return 0

  jq --arg story "$story_id" '
    .locks = [(.locks // [])[] | select(.owner.story != $story)]
  ' "$lock_file" > "$lock_file.tmp" && mv "$lock_file.tmp" "$lock_file"
}

# Process a completed swarm member — validate git, check passes, update state
process_swarm_completion() {
  local story_id="$1"
  local exit_code="$2"
  local duration="$3"
  local worktree_path="${4:-}"
  local start_epoch="${5:-}"

  local saved_repo="$REPO_PATH"
  [[ -n "$worktree_path" && -d "$worktree_path" ]] && REPO_PATH="$worktree_path"

  validate_git_state "$story_id"
  run_codex_review "$story_id"

  # Orchestrator writes passes based on output JSON — pass checkout timestamp for Layer 3 git heuristic
  local checkout_ts_iso=""
  [[ -n "$start_epoch" ]] && checkout_ts_iso=$(date -u -r "$start_epoch" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null) || true
  orchestrator_write_passes "$story_id" "$checkout_ts_iso"

  # Check source of truth
  local passes
  passes=$(jq -r --arg id "$story_id" '.userStories[] | select(.id == $id) | .passes' "$PRD_PATH")

  REPO_PATH="$saved_repo"

  if [[ "$passes" == "true" ]]; then
    local commit_sha files_changed
    local check_repo="$saved_repo"
    [[ -n "$worktree_path" && -d "$worktree_path" ]] && check_repo="$worktree_path"
    commit_sha=$(git -C "$check_repo" rev-parse --short HEAD 2>/dev/null || echo "n/a")
    files_changed=$(git -C "$check_repo" diff-tree --no-commit-id --name-only -r HEAD 2>/dev/null \
      | jq -R -s 'split("\n") | map(select(length > 0))' 2>/dev/null) || true
    # Validate JSON — protects --argjson in update_state_completed from crash
    if [[ -z "$files_changed" ]] || ! jq -e . <<< "$files_changed" &>/dev/null; then
      files_changed="[]"
    fi

    update_state_completed "$story_id" "$commit_sha" "$files_changed"
    release_checkout "$story_id"
    release_swarm_locks "$story_id"

    local story_title
    story_title=$(get_story_title "$story_id")
    echo "[$(ts)] $story_id: $story_title — completed in swarm (${duration}s) [$commit_sha]" >> "$PROGRESS_FILE"

    "$AUDIT_SCRIPT" append --event story_completed --project "$PROJECT" \
      ${COMPANY:+--company "$COMPANY"} \
      --story-id "$story_id" \
      --action "$(get_story_title "$story_id") (swarm)" \
      --result success \
      --duration-ms $(( duration * 1000 )) \
      --session-id "$SESSION_ID" || true

    sync_linear_done "$story_id"
    log_ok "$story_id completed in swarm (${duration}s) [$commit_sha]"

    completed_this_run=$((completed_this_run + 1))

    # Check if regression gate is due
    if (( completed_this_run % REGRESSION_INTERVAL == 0 && completed_this_run > 0 )); then
      PENDING_REGRESSION_GATE="$story_id"
    fi
  else
    log_err "$story_id: passes still false in swarm (exit=$exit_code, ${duration}s)"
    update_state_failed "$story_id" "passes not set in swarm (exit=$exit_code)"
    release_checkout "$story_id"
    release_swarm_locks "$story_id"
    _swarm_retry_inc "$story_id"
    local retry_count
    retry_count=$(_swarm_retry_get "$story_id")
    if (( retry_count >= 2 )); then
      retry_queue+=("$story_id")
      echo "[$(ts)] $story_id: FAILED in swarm (max retries) — queued for end-of-run retry" >> "$PROGRESS_FILE"
    else
      echo "[$(ts)] $story_id: FAILED in swarm (attempt ${retry_count}) — will retry next batch" >> "$PROGRESS_FILE"
    fi

    "$AUDIT_SCRIPT" append --event story_failed --project "$PROJECT" \
      ${COMPANY:+--company "$COMPANY"} \
      --story-id "$story_id" \
      --result fail \
      --duration-ms $(( duration * 1000 )) \
      --error "passes not set in swarm (exit=$exit_code)" \
      --session-id "$SESSION_ID" || true
  fi
}

# Monitor swarm until all members complete. Polls PIDs, prints check-in status.
monitor_swarm_loop() {
  local poll_interval=15
  local last_checkin
  last_checkin=$(date +%s)

  while true; do
    local now
    now=$(date +%s)

    # Check-in print
    if (( now - last_checkin >= CHECKIN_INTERVAL )); then
      print_checkin_status
      last_checkin=$now
    fi

    # Check each PID for completion
    local all_done=true
    local i=0
    while [[ $i -lt ${#SWARM_PIDS[@]} ]]; do
      if [[ "${SWARM_DONE[$i]}" == "true" ]]; then
        i=$((i + 1)); continue
      fi

      local pid="${SWARM_PIDS[$i]}"
      local sid="${SWARM_STORY_IDS[$i]}"
      local wt="${SWARM_WORKTREES[$i]}"
      local start="${SWARM_START_TIMES[$i]}"

      if ! kill -0 "$pid" 2>/dev/null; then
        # Process exited — collect
        local ec=0
        wait "$pid" 2>/dev/null || ec=$?
        SWARM_DONE[$i]="true"
        local dur=$(( now - start ))

        log_info "Swarm member $sid exited (PID $pid, exit=$ec, ${dur}s)"
        process_swarm_completion "$sid" "$ec" "$dur" "$wt" "$start"
      else
        all_done=false
      fi

      i=$((i + 1))
    done

    [[ "$all_done" == "true" ]] && break

    sleep "$poll_interval"
  done
}

# Cherry-pick commits from each story worktree into the main project worktree
merge_swarm_commits() {
  local base_repo="${ORIGINAL_REPO_PATH:-$REPO_PATH}"
  [[ -z "$base_repo" || ! -d "$base_repo" ]] && return 0
  is_git_repo "$base_repo" || return 0

  local i=0
  while [[ $i -lt ${#SWARM_STORY_IDS[@]} ]]; do
    local sid="${SWARM_STORY_IDS[$i]}"
    local wt="${SWARM_WORKTREES[$i]}"
    i=$((i + 1))

    [[ -z "$wt" || ! -d "$wt" || "$wt" == "$base_repo" ]] && continue
    [[ "${SWARM_DONE[$((i - 1))]}" != "true" ]] && continue

    # Check if story actually passed
    local passed
    passed=$(jq -r --arg id "$sid" '.userStories[] | select(.id == $id) | .passes' "$PRD_PATH" 2>/dev/null) || true
    [[ "$passed" != "true" ]] && continue

    # Get the commit SHA from the story worktree
    local wt_sha
    wt_sha=$(git -C "$wt" rev-parse HEAD 2>/dev/null) || continue
    local base_sha
    base_sha=$(git -C "$base_repo" rev-parse HEAD 2>/dev/null) || continue

    # Skip if same commit (worktree was on the same branch tip)
    [[ "$wt_sha" == "$base_sha" ]] && continue

    # Cherry-pick the full commit range from the story worktree (not just HEAD)
    local merge_base
    merge_base=$(git -C "$base_repo" merge-base HEAD "$wt_sha" 2>/dev/null) || true
    if [[ -n "$merge_base" && "$merge_base" != "$wt_sha" ]]; then
      local commit_count
      commit_count=$(git -C "$wt" rev-list --count "${merge_base}..HEAD" 2>/dev/null) || commit_count=1
      log_info "Merging swarm commits from $sid ($commit_count commits: ${merge_base:0:7}..${wt_sha:0:7}) into main worktree"
      git -C "$base_repo" cherry-pick "${merge_base}..${wt_sha}" --no-verify 2>/dev/null || {
        log_warn "Cherry-pick range failed for $sid — attempting merge"
        git -C "$base_repo" cherry-pick --abort 2>/dev/null || true
        git -C "$base_repo" merge "$wt_sha" --no-edit --no-verify -m "[orchestrator] merge swarm: $sid" 2>/dev/null || {
          log_err "Could not merge swarm commits for $sid — manual resolution needed"
          log_err "  Worktree: $wt (commit: $wt_sha)"
        }
      }
    else
      # Fallback: single commit or can't find merge-base
      log_info "Merging swarm commit from $sid ($wt_sha) into main worktree"
      git -C "$base_repo" cherry-pick "$wt_sha" --no-verify 2>/dev/null || {
        log_warn "Cherry-pick failed for $sid — attempting merge"
        git -C "$base_repo" cherry-pick --abort 2>/dev/null || true
        git -C "$base_repo" merge "$wt_sha" --no-edit --no-verify -m "[orchestrator] merge swarm: $sid" 2>/dev/null || {
          log_err "Could not merge swarm commits for $sid — manual resolution needed"
          log_err "  Worktree: $wt (commit: $wt_sha)"
        }
      }
    fi
  done
}

# Clean up per-story worktrees after swarm batch
cleanup_swarm_worktrees() {
  local base_repo="${ORIGINAL_REPO_PATH:-$REPO_PATH}"
  [[ -z "$base_repo" || ! -d "$base_repo" ]] && return 0

  local i=0
  while [[ $i -lt ${#SWARM_WORKTREES[@]} ]]; do
    local wt="${SWARM_WORKTREES[$i]}"
    local sid="${SWARM_STORY_IDS[$i]}"
    i=$((i + 1))

    [[ -z "$wt" || ! -d "$wt" ]] && continue

    local dirty
    dirty=$(git -C "$wt" status --porcelain 2>/dev/null) || true
    if [[ -n "$dirty" ]]; then
      log_warn "Swarm worktree $sid has uncommitted changes — skipping cleanup"
      continue
    fi

    git -C "$base_repo" worktree remove "$wt" --force 2>/dev/null || {
      log_warn "Could not auto-remove swarm worktree $wt"
    }

    # Clean up the per-story branch (e.g., feature/branch/us-001)
    local story_slug
    story_slug=$(echo "$sid" | tr '[:upper:]' '[:lower:]' | tr '_' '-')
    local story_branch="${BRANCH_NAME:-main}--${story_slug}"
    git -C "$base_repo" branch -D "$story_branch" 2>/dev/null || true
  done
}

# =============================================================================
# Main Orchestration Loop
# =============================================================================

completed_this_run=0
retry_queue=()
checkout_skipped=()
# Bash 3.2 compat: track swarm retry counts as "id:count" entries (no assoc arrays)
SWARM_RETRY_ENTRIES=()

_swarm_retry_get() {
  local id="$1"
  for entry in ${SWARM_RETRY_ENTRIES[@]+"${SWARM_RETRY_ENTRIES[@]}"}; do
    [[ "$entry" == "$id:"* ]] && echo "${entry#*:}" && return
  done
  echo "0"
}

_swarm_retry_inc() {
  local id="$1"
  local new_entries=()
  local found=false
  for entry in ${SWARM_RETRY_ENTRIES[@]+"${SWARM_RETRY_ENTRIES[@]}"}; do
    if [[ "$entry" == "$id:"* ]]; then
      local count="${entry#*:}"
      new_entries+=("$id:$(( count + 1 ))")
      found=true
    else
      new_entries+=("$entry")
    fi
  done
  [[ "$found" == false ]] && new_entries+=("$id:1")
  SWARM_RETRY_ENTRIES=("${new_entries[@]}")
}

if [[ "$SWARM_MODE" == true ]]; then
  echo -e "${BOLD}Starting execution loop (swarm mode, max $SWARM_MAX concurrent)...${NC}\n"
else
  echo -e "${BOLD}Starting execution loop...${NC}\n"
fi

if [[ "$SWARM_MODE" == true ]]; then
  # =========================================================================
  # Swarm Mode Loop
  # =========================================================================
  while true; do
    read_prd_stats
    [[ "$REMAINING" -eq 0 ]] && break

    # Get all eligible stories that can run in parallel
    local_candidates=""
    local_candidates=$(get_swarm_candidates) || true

    # Filter out stories that exhausted swarm retries (already in retry_queue)
    if [[ -n "$local_candidates" && ${#retry_queue[@]} -gt 0 ]]; then
      local filtered_candidates=""
      while IFS= read -r _cand; do
        [[ -z "$_cand" ]] && continue
        local _in_retry=false
        for _rq in "${retry_queue[@]}"; do
          [[ "$_rq" == "$_cand" ]] && _in_retry=true && break
        done
        $_in_retry || filtered_candidates+="$_cand"$'\n'
      done <<< "$local_candidates"
      local_candidates="${filtered_candidates%$'\n'}"
    fi

    if [[ -z "$local_candidates" ]]; then
      # No candidates at all — check if blocked or truly done
      STORY_ID=$(get_next_story) || true
      if [[ -z "$STORY_ID" ]]; then
        log_warn "All remaining stories are blocked by dependencies."
        jq -r '.userStories[] | select(.passes != true) | "  \(.id): needs \(.dependsOn | join(", "))"' "$PRD_PATH"
        break
      fi
      # Single story without files[] declared — fall through to sequential
      local_candidates="$STORY_ID"
    fi

    # Count candidates
    local_count=0
    local_first=""
    while IFS= read -r cand; do
      [[ -z "$cand" ]] && continue
      local_count=$((local_count + 1))
      [[ -z "$local_first" ]] && local_first="$cand"
    done <<< "$local_candidates"

    if [[ "$local_count" -le 1 ]]; then
      # Single candidate — run sequentially with check-in timer
      STORY_ID="$local_first"
      STORY_TITLE=$(get_story_title "$STORY_ID")

      echo -e "${BOLD}=== $STORY_ID: $STORY_TITLE === ($COMPLETED/$TOTAL)${NC}"

      if ! checkout_story "$STORY_ID"; then
        log_warn "$STORY_ID checked out by another process — skipping"
        checkout_skipped+=("$STORY_ID")
        # Avoid infinite loop on checkout-blocked
        if [[ ${#checkout_skipped[@]} -ge "$REMAINING" ]]; then break; fi
        continue
      fi

      update_state_current "$STORY_ID"
      sync_linear_start "$STORY_ID"

      log_info "Running story $STORY_ID..."
      story_start=$(date +%s)

      "$AUDIT_SCRIPT" append --event story_dispatched --project "$PROJECT" \
        ${COMPANY:+--company "$COMPANY"} \
        --story-id "$STORY_ID" \
        --action "Dispatching $STORY_ID: $STORY_TITLE" \
        --session-id "$SESSION_ID" || true

      # Background check-in timer
      ( while true; do sleep "$CHECKIN_INTERVAL"; print_checkin_status; done ) &
      CHECKIN_PID=$!

      exit_code=0
      run_story "$STORY_ID" "$PROJECT" "$PRD_REL" || exit_code=$?

      kill "$CHECKIN_PID" 2>/dev/null; wait "$CHECKIN_PID" 2>/dev/null || true

      story_end=$(date +%s)
      duration=$(( story_end - story_start ))

      validate_git_state "$STORY_ID"
      run_codex_review "$STORY_ID"

      # Orchestrator writes passes (source of truth) — pass checkout timestamp for Layer 3 git heuristic
      local checkout_ts_iso
      checkout_ts_iso=$(date -u -r "$story_start" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null) || checkout_ts_iso=""
      orchestrator_write_passes "$STORY_ID" "$checkout_ts_iso"

      passes=$(jq -r --arg id "$STORY_ID" '.userStories[] | select(.id == $id) | .passes' "$PRD_PATH")

      if [[ "$passes" == "true" ]]; then
        commit_sha=$(get_commit_sha)
        files_changed=$(get_changed_files "$STORY_ID")
        update_state_completed "$STORY_ID" "$commit_sha" "$files_changed"
        release_checkout "$STORY_ID"
        echo "[$(ts)] $STORY_ID: $STORY_TITLE — completed (${duration}s) [$commit_sha] ($COMPLETED/$TOTAL)" >> "$PROGRESS_FILE"

        "$AUDIT_SCRIPT" append --event story_completed --project "$PROJECT" \
          ${COMPANY:+--company "$COMPANY"} \
          --story-id "$STORY_ID" --action "$STORY_TITLE" \
          --result success --duration-ms $(( duration * 1000 )) \
          --session-id "$SESSION_ID" || true

        sync_linear_done "$STORY_ID"
        log_ok "$STORY_ID completed in ${duration}s [$commit_sha] ($COMPLETED/$TOTAL)"
        completed_this_run=$((completed_this_run + 1))

        if (( completed_this_run % REGRESSION_INTERVAL == 0 && completed_this_run > 0 )); then
          run_regression_gate "$STORY_ID"
          run_project_reanchor "$PROJECT" "$completed_this_run"
        fi
      else
        log_err "$STORY_ID: passes still false (exit=$exit_code, ${duration}s)"
        retry_queue+=("$STORY_ID")
        update_state_failed "$STORY_ID" "passes not set (exit=$exit_code)"
        release_checkout "$STORY_ID"
        echo "[$(ts)] $STORY_ID: FAILED — queued for retry ($COMPLETED/$TOTAL)" >> "$PROGRESS_FILE"

        "$AUDIT_SCRIPT" append --event story_failed --project "$PROJECT" \
          ${COMPANY:+--company "$COMPANY"} \
          --story-id "$STORY_ID" --action "$STORY_TITLE" \
          --result fail --duration-ms $(( duration * 1000 )) \
          --error "passes not set (exit=$exit_code)" \
          --session-id "$SESSION_ID" || true
      fi

      qmd update 2>/dev/null || true
      echo ""
      continue
    fi

    # Multiple candidates — dispatch swarm batch
    echo -e "${BOLD}=== Swarm Batch: $local_count stories in parallel ===${NC}"

    # Reset swarm arrays
    SWARM_STORY_IDS=()
    SWARM_PIDS=()
    SWARM_WORKTREES=()
    SWARM_START_TIMES=()
    SWARM_DONE=()
    PENDING_REGRESSION_GATE=""

    while IFS= read -r cand_id; do
      [[ -z "$cand_id" ]] && continue

      cand_title=$(get_story_title "$cand_id")
      echo -e "  ${BLUE}Dispatching:${NC} $cand_id — $cand_title"

      # Checkout lock
      if ! checkout_story "$cand_id"; then
        log_warn "$cand_id checked out by another process — skipping in swarm"
        continue
      fi

      # Pre-acquire file locks
      preacquire_swarm_locks "$cand_id" "$$"

      # Create per-story worktree
      ensure_story_worktree "$cand_id"
      wt_path="${STORY_WORKTREE_PATH:-}"

      # Linear sync
      sync_linear_start "$cand_id"

      # Add to state
      update_state_add_task "$cand_id" "" "$wt_path"

      "$AUDIT_SCRIPT" append --event story_dispatched --project "$PROJECT" \
        ${COMPANY:+--company "$COMPANY"} \
        --story-id "$cand_id" \
        --action "Dispatching $cand_id (swarm): $cand_title" \
        --session-id "$SESSION_ID" || true

      # Launch background
      batch_start=""
      batch_start=$(date +%s)

      run_story_background "$cand_id" "$wt_path"

      SWARM_STORY_IDS+=("$cand_id")
      SWARM_PIDS+=("$LAST_BG_PID")
      SWARM_WORKTREES+=("$wt_path")
      SWARM_START_TIMES+=("$batch_start")
      SWARM_DONE+=("false")

      # Update state with PID
      update_state_add_task "$cand_id" "$LAST_BG_PID" "$wt_path"

      log_info "$cand_id dispatched (PID $LAST_BG_PID, worktree: ${wt_path:-none})"
    done <<< "$local_candidates"

    if [[ ${#SWARM_PIDS[@]} -eq 0 ]]; then
      log_warn "No stories could be dispatched in swarm batch — all checkout-blocked"
      break
    fi

    echo -e "\n${BOLD}Monitoring ${#SWARM_PIDS[@]} stories...${NC}\n"

    # Block until all complete
    monitor_swarm_loop

    # Merge worktree commits into main branch
    merge_swarm_commits

    # Clean up worktrees
    cleanup_swarm_worktrees

    # Run pending regression gate if any
    if [[ -n "$PENDING_REGRESSION_GATE" ]]; then
      run_regression_gate "$PENDING_REGRESSION_GATE"
      run_project_reanchor "$PROJECT" "$completed_this_run"
      PENDING_REGRESSION_GATE=""
    fi

    # Reindex
    qmd update 2>/dev/null || true

    echo ""
  done

else
  # =========================================================================
  # Sequential Mode Loop (with check-in timer)
  # =========================================================================
  while true; do
    # Re-read PRD each iteration (execute-task may have updated passes)
    read_prd_stats

    if [[ "$REMAINING" -eq 0 ]]; then
      break
    fi

    # Build skip list from retry queue + checkout-skipped
    skip_ids=""
    if [[ ${#retry_queue[@]} -gt 0 ]]; then
      skip_ids=$(printf '%s\n' "${retry_queue[@]}")
    fi
    if [[ ${#checkout_skipped[@]} -gt 0 ]]; then
      more_skips=$(printf '%s\n' "${checkout_skipped[@]}")
      if [[ -n "$skip_ids" ]]; then
        skip_ids="$skip_ids"$'\n'"$more_skips"
      else
        skip_ids="$more_skips"
      fi
    fi

    # Get next unblocked story (skipping retry queue + checkout-blocked)
    STORY_ID=$(get_next_story "$skip_ids")

    if [[ -z "$STORY_ID" ]]; then
      # All remaining stories are blocked or skipped
      if [[ ${#retry_queue[@]} -gt 0 || ${#checkout_skipped[@]} -gt 0 ]]; then
        log_warn "All remaining stories are either blocked, in retry queue, or checkout-locked."
      else
        log_warn "All remaining stories are blocked by dependencies."
        jq -r '.userStories[] | select(.passes != true) | "  \(.id): needs \(.dependsOn | join(", "))"' "$PRD_PATH"
      fi
      break
    fi

    STORY_TITLE=$(get_story_title "$STORY_ID")

    echo -e "${BOLD}=== $STORY_ID: $STORY_TITLE === ($COMPLETED/$TOTAL)${NC}"

    # Checkout: acquire story-level lock before dispatch
    if ! checkout_story "$STORY_ID"; then
      checkout_skipped+=("$STORY_ID")
      continue  # Another live PID holds this story — try next
    fi

    # Update state: current task
    update_state_current "$STORY_ID"

    # PRE-TASK: Linear sync — set issue In Progress + comment (best-effort)
    sync_linear_start "$STORY_ID"

    # Execute story
    attempt=1
    story_passed=false

    while [[ "$attempt" -le 2 ]]; do
      log_info "Running story $STORY_ID (attempt $attempt)..."
      story_start=$(date +%s)

      "$AUDIT_SCRIPT" append --event story_dispatched --project "$PROJECT" \
        ${COMPANY:+--company "$COMPANY"} \
        --story-id "$STORY_ID" \
        --action "Dispatching $STORY_ID (attempt $attempt): $STORY_TITLE" \
        --session-id "$SESSION_ID" || true

      # Background check-in timer
      ( while true; do sleep "$CHECKIN_INTERVAL"; print_checkin_status; done ) &
      CHECKIN_PID=$!

      exit_code=0
      run_story "$STORY_ID" "$PROJECT" "$PRD_REL" || exit_code=$?

      # Stop check-in timer
      kill "$CHECKIN_PID" 2>/dev/null; wait "$CHECKIN_PID" 2>/dev/null || true

      story_end=$(date +%s)
      duration=$(( story_end - story_start ))

      # POST-INVOCATION: Validate git state (self-healing)
      validate_git_state "$STORY_ID"

      # POST-INVOCATION: Codex review safety net (best-effort)
      run_codex_review "$STORY_ID"

      # Orchestrator writes passes (source of truth) — pass checkout timestamp for Layer 3 git heuristic
      local checkout_ts_iso
      checkout_ts_iso=$(date -u -r "$story_start" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null) || checkout_ts_iso=""
      orchestrator_write_passes "$STORY_ID" "$checkout_ts_iso"

      # Check source of truth: did passes get set to true?
      passes=$(jq -r --arg id "$STORY_ID" '.userStories[] | select(.id == $id) | .passes' "$PRD_PATH")

      if [[ "$passes" == "true" ]]; then
        commit_sha=$(get_commit_sha)
        files_changed=$(get_changed_files "$STORY_ID")

        update_state_completed "$STORY_ID" "$commit_sha" "$files_changed"
        release_checkout "$STORY_ID"
        echo "[$(ts)] $STORY_ID: $STORY_TITLE — completed (${duration}s) [$commit_sha] ($COMPLETED/$TOTAL)" >> "$PROGRESS_FILE"

        "$AUDIT_SCRIPT" append --event story_completed --project "$PROJECT" \
          ${COMPANY:+--company "$COMPANY"} \
          --story-id "$STORY_ID" \
          --action "$STORY_TITLE" \
          --result success \
          --duration-ms $(( duration * 1000 )) \
          --session-id "$SESSION_ID" || true

        # POST-TASK: Linear sync → Done (best-effort)
        sync_linear_done "$STORY_ID"

        log_ok "$STORY_ID completed in ${duration}s [$commit_sha] ($COMPLETED/$TOTAL)"
        story_passed=true
        completed_this_run=$((completed_this_run + 1))
        break
      else
        log_err "$STORY_ID: passes still false after invocation (exit=$exit_code, ${duration}s)"

        result=0
        handle_failure "$STORY_ID" "$attempt" || result=$?

        case $result in
          0) attempt=$((attempt + 1)); continue ;;  # retry
          2) # skip
            retry_queue+=("$STORY_ID")
            update_state_failed "$STORY_ID" "passes not set after attempt $attempt"
            release_checkout "$STORY_ID"
            echo "[$(ts)] $STORY_ID: FAILED — queued for retry ($COMPLETED/$TOTAL)" >> "$PROGRESS_FILE"
            "$AUDIT_SCRIPT" append --event story_failed --project "$PROJECT" \
              ${COMPANY:+--company "$COMPANY"} \
              --story-id "$STORY_ID" \
              --action "$STORY_TITLE" \
              --result fail \
              --duration-ms $(( duration * 1000 )) \
              --error "passes not set after attempt $attempt (exit=$exit_code)" \
              --session-id "$SESSION_ID" || true
            break
            ;;
          3) # pause
            release_checkout "$STORY_ID"
            jq --arg ts "$(ts)" '.status = "paused" | .updated_at = $ts' "$STATE_FILE" > "$STATE_FILE.tmp" \
              && mv "$STATE_FILE.tmp" "$STATE_FILE"
            "$AUDIT_SCRIPT" append --event story_failed --project "$PROJECT" \
              ${COMPANY:+--company "$COMPANY"} \
              --story-id "$STORY_ID" \
              --action "$STORY_TITLE" \
              --result fail \
              --duration-ms $(( duration * 1000 )) \
              --error "paused by user after attempt $attempt (exit=$exit_code)" \
              --session-id "$SESSION_ID" || true
            log_warn "Paused. Resume: scripts/run-project.sh --resume $PROJECT"
            exit 0
            ;;
        esac
      fi
    done

    # REGRESSION GATE: every N completed stories
    if [[ "$story_passed" == true && $((completed_this_run % REGRESSION_INTERVAL)) -eq 0 && "$completed_this_run" -gt 0 ]]; then
      run_regression_gate "$STORY_ID"
      run_project_reanchor "$PROJECT" "$completed_this_run"
    fi

    # Reindex
    qmd update 2>/dev/null || true

    echo ""
  done
fi

# =============================================================================
# Retry Pass
# =============================================================================

if [[ ${#retry_queue[@]} -gt 0 ]]; then
  echo -e "\n${BOLD}=== Retry Pass ===${NC}"
  echo -e "Retrying ${#retry_queue[@]} failed stories...\n"

  for story_id in "${retry_queue[@]}"; do
    # Check if it's still incomplete (might have been fixed by a later story)
    passes=$(jq -r --arg id "$story_id" '.userStories[] | select(.id == $id) | .passes' "$PRD_PATH")
    if [[ "$passes" == "true" ]]; then
      log_ok "$story_id already passing (fixed by later story)"
      continue
    fi

    title=$(get_story_title "$story_id")
    echo -e "${BOLD}=== RETRY: $story_id: $title ===${NC}"

    retry_start=$(date +%s)

    "$AUDIT_SCRIPT" append --event story_dispatched --project "$PROJECT" \
      ${COMPANY:+--company "$COMPANY"} \
      --story-id "$story_id" \
      --action "Dispatching $story_id (retry): $title" \
      --session-id "$SESSION_ID" || true

    exit_code=0
    run_story "$story_id" "$PROJECT" "$PRD_REL" || exit_code=$?

    validate_git_state "$story_id"

    retry_end=$(date +%s)
    retry_duration=$(( retry_end - retry_start ))

    passes=$(jq -r --arg id "$story_id" '.userStories[] | select(.id == $id) | .passes' "$PRD_PATH")
    if [[ "$passes" == "true" ]]; then
      commit_sha=$(get_commit_sha)
      files_changed=$(get_changed_files "$story_id")
      update_state_completed "$story_id" "$commit_sha" "$files_changed"
      echo "[$(ts)] $story_id: $title — completed on retry [$commit_sha] ($COMPLETED/$TOTAL)" >> "$PROGRESS_FILE"
      log_ok "$story_id completed on retry [$commit_sha]"
      completed_this_run=$((completed_this_run + 1))
      "$AUDIT_SCRIPT" append --event story_completed --project "$PROJECT" \
        ${COMPANY:+--company "$COMPANY"} \
        --story-id "$story_id" \
        --action "$title (retry)" \
        --result success \
        --duration-ms $(( retry_duration * 1000 )) \
        --session-id "$SESSION_ID" || true
    else
      log_err "$story_id failed on retry"
      echo "[$(ts)] $story_id: FAILED on retry" >> "$PROGRESS_FILE"
      "$AUDIT_SCRIPT" append --event story_failed --project "$PROJECT" \
        ${COMPANY:+--company "$COMPANY"} \
        --story-id "$story_id" \
        --action "$title (retry)" \
        --result fail \
        --duration-ms $(( retry_duration * 1000 )) \
        --error "passes not set after retry (exit=$exit_code)" \
        --session-id "$SESSION_ID" || true
    fi
  done
fi

# =============================================================================
# Completion
# =============================================================================

read_prd_stats
echo ""
echo -e "${BOLD}=== Summary ===${NC}"
echo -e "Project:   $PROJECT"
echo -e "Completed: ${GREEN}$COMPLETED${NC}/$TOTAL"
echo -e "This run:  $completed_this_run stories"

failed_count=$(jq '.failed_tasks | length' "$STATE_FILE")
if [[ "$failed_count" -gt 0 ]]; then
  echo -e "Failed:    ${RED}$failed_count${NC}"
fi

if [[ "$REMAINING" -eq 0 ]]; then
  echo -e "\n${GREEN}${BOLD}All stories complete!${NC}"

  # Mark project done
  jq --arg ts "$(ts)" '.status = "completed" | .completed_at = $ts | .updated_at = $ts' \
    "$STATE_FILE" > "$STATE_FILE.tmp" && mv "$STATE_FILE.tmp" "$STATE_FILE"

  echo "[$(ts)] PROJECT COMPLETE: $PROJECT — $TOTAL/$TOTAL stories" >> "$PROGRESS_FILE"

  run_end_epoch=$(date +%s)
  run_duration=$(( run_end_epoch - RUN_START_EPOCH ))
  "$AUDIT_SCRIPT" append --event project_completed --project "$PROJECT" \
    ${COMPANY:+--company "$COMPANY"} \
    --action "Project completed: $TOTAL total, $COMPLETED completed, $failed_count failed" \
    --result success \
    --duration-ms $(( run_duration * 1000 )) \
    --session-id "$SESSION_ID" || true

  # Board sync → done
  sync_board "done"

  # ---- Full Ralph Completion Flow ----

  # 1. Generate project summary report
  REPORT_DIR="$HQ_ROOT/workspace/reports"
  mkdir -p "$REPORT_DIR"
  REPORT_FILE="$REPORT_DIR/${PROJECT}-summary.md"

  {
    echo "# $PROJECT — Project Summary"
    echo ""
    echo "**Completed:** $(ts)"
    echo "**Stories:** $TOTAL/$TOTAL"
    echo "**Branch:** ${BRANCH_NAME:-main}"
    echo ""
    echo "## Completed Tasks"
    echo ""
    jq -r '.completed_tasks[] | "- **\(.id)** — \(.completed_at) [\(.commit_sha)]"' "$STATE_FILE"
    echo ""

    if [[ $(jq '.failed_tasks | length' "$STATE_FILE") -gt 0 ]]; then
      echo "## Failed Tasks (resolved on retry)"
      echo ""
      jq -r '.failed_tasks[] | "- **\(.id)** — \(.error)"' "$STATE_FILE"
      echo ""
    fi

    if [[ $(jq '.regression_gates | length' "$STATE_FILE") -gt 0 ]]; then
      echo "## Regression Gates"
      echo ""
      jq -r '.regression_gates[] | "- After \(.after_story): \(if .passed then "✅ passed" else "❌ failed" end)"' "$STATE_FILE"
      echo ""
    fi
  } > "$REPORT_FILE"
  log_ok "Report: $REPORT_FILE"

  # 2. Update INDEX.md files (company projects + orchestrator)
  company=$(jq -r '.metadata.company // empty' "$PRD_PATH" 2>/dev/null) || true
  if [[ -n "$company" ]]; then
    co_projects_index="$HQ_ROOT/companies/$company/projects/INDEX.md"
    if [[ -f "$co_projects_index" ]]; then
      # Touch updated_at — full rebuild deferred to /cleanup
      log_info "INDEX: $co_projects_index needs rebuild (deferred)"
    fi
  fi

  orch_index="$HQ_ROOT/workspace/orchestrator/INDEX.md"
  if [[ -f "$orch_index" ]]; then
    log_info "INDEX: $orch_index needs rebuild (deferred)"
  fi

  # 3. Doc sweep — headless update of all 4 doc layers
  run_doc_sweep "$PROJECT" "$PRD_REL"

  # 4. Final reindex
  qmd update 2>/dev/null || true
  log_ok "qmd reindexed"

  # 5. Verify manifest (repos/workers created during project are registered)
  if [[ -n "$REPO_PATH" && -f "$HQ_ROOT/companies/manifest.yaml" ]]; then
    repo_rel="${REPO_PATH#"$HQ_ROOT/"}"
    if ! grep -q "$repo_rel" "$HQ_ROOT/companies/manifest.yaml" 2>/dev/null; then
      log_warn "Repo $repo_rel not found in manifest.yaml — verify registration"
    fi
  fi

  # 6. Worktree cleanup (if used)
  cleanup_worktree

else
  echo -e "\n${YELLOW}$REMAINING stories remaining.${NC}"
  echo -e "Resume: ${DIM}scripts/run-project.sh --resume $PROJECT${NC}"
fi

echo ""
