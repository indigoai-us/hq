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
#   --max-budget N      Per-story cost cap in USD (default: 5)
#   --model MODEL       Override model for all stories
#   --no-permissions    Pass --dangerously-skip-permissions to claude
#   --retry-failed      Re-run previously failed stories only
#   --timeout N         Per-story wall-clock timeout in minutes (default: none)
#   --verbose           Show full claude output
#   --tmux              Launch in tmux session with Remote Control
# =============================================================================

HQ_ROOT="~/Documents/HQ"
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

# Check if another active orchestrator is using the same repo on a different branch.
# Returns 0 if conflict found, 1 if no conflict.
# Sets CONFLICT_PROJECT and CONFLICT_BRANCH on match.
check_repo_conflict() {
  local my_repo="$1"
  local my_project="$2"
  local my_branch="$3"

  [[ -z "$my_repo" ]] && return 1

  # Normalize repo path for comparison
  local my_repo_abs="$my_repo"
  [[ ! "$my_repo_abs" = /* ]] && my_repo_abs="$HQ_ROOT/$my_repo_abs"

  # Also resolve worktree → parent repo for comparison
  local my_repo_canonical="$my_repo_abs"
  if [[ -f "$my_repo_abs/.git" ]]; then
    # This IS a worktree — resolve the parent repo
    local gitdir
    gitdir=$(sed 's/^gitdir: //' "$my_repo_abs/.git" 2>/dev/null)
    if [[ "$gitdir" == *"/.git/worktrees/"* ]]; then
      my_repo_canonical="${gitdir%%/.git/worktrees/*}"
    fi
  fi

  for state_file in "$ORCH_DIR"/*/state.json; do
    [[ -f "$state_file" ]] || continue
    local other_project other_status
    other_project=$(jq -r '.project // empty' "$state_file" 2>/dev/null) || continue
    other_status=$(jq -r '.status // empty' "$state_file" 2>/dev/null) || continue

    # Skip self and non-active projects
    [[ "$other_project" == "$my_project" ]] && continue
    [[ "$other_status" != "in_progress" ]] && continue

    # Check if the other project's PID is alive
    local other_pid
    other_pid=$(jq -r '.current_task.checkedOutBy.pid // empty' "$state_file" 2>/dev/null) || true
    if [[ -n "$other_pid" ]] && ! kill -0 "$other_pid" 2>/dev/null; then
      continue  # Dead PID — not a real conflict
    fi

    # Get the other project's repo path
    local other_prd other_repo other_repo_abs other_repo_canonical
    other_prd=$(jq -r '.prd_path // empty' "$state_file" 2>/dev/null) || continue
    [[ -z "$other_prd" ]] && continue
    local other_prd_full="$other_prd"
    [[ ! "$other_prd_full" = /* ]] && other_prd_full="$HQ_ROOT/$other_prd_full"
    [[ -f "$other_prd_full" ]] || continue

    other_repo=$(jq -r '.metadata.repoPath // empty' "$other_prd_full" 2>/dev/null) || continue
    [[ -z "$other_repo" ]] && continue
    other_repo_abs="$other_repo"
    [[ ! "$other_repo_abs" = /* ]] && other_repo_abs="$HQ_ROOT/$other_repo_abs"

    # Resolve worktree → parent for the other project too
    other_repo_canonical="$other_repo_abs"
    if [[ -f "$other_repo_abs/.git" ]]; then
      local other_gitdir
      other_gitdir=$(sed 's/^gitdir: //' "$other_repo_abs/.git" 2>/dev/null)
      if [[ "$other_gitdir" == *"/.git/worktrees/"* ]]; then
        other_repo_canonical="${other_gitdir%%/.git/worktrees/*}"
      fi
    fi

    # Compare canonical repo paths
    if [[ "$my_repo_canonical" == "$other_repo_canonical" ]]; then
      local other_branch
      other_branch=$(jq -r '.branchName // empty' "$other_prd_full" 2>/dev/null) || true

      # Same branch = likely follow-up PRD, not a conflict
      if [[ "$other_branch" == "$my_branch" ]]; then
        continue
      fi

      CONFLICT_PROJECT="$other_project"
      CONFLICT_BRANCH="${other_branch:-unknown}"
      return 0  # Conflict found
    fi
  done
  return 1  # No conflict
}

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

# --- Defaults ---
PROJECT=""
RESUME=false
STATUS=false
DRY_RUN=false
MAX_BUDGET=""
MODEL=""
NO_PERMISSIONS=false
RETRY_FAILED=false
TIMEOUT=""
VERBOSE=false
TMUX_MODE=false

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
    --max-budget)   MAX_BUDGET="$2"; shift 2 ;;
    --model)        MODEL="$2"; shift 2 ;;
    --no-permissions) NO_PERMISSIONS=true; shift ;;
    --retry-failed) RETRY_FAILED=true; shift ;;
    --timeout)      TIMEOUT="$2"; shift 2 ;;
    --verbose)      VERBOSE=true; shift ;;
    --tmux)         TMUX_MODE=true; shift ;;
    --help|-h)
      cat <<'HELP'
Usage: scripts/run-project.sh <project> [flags]
       scripts/run-project.sh --status

Flags:
  --resume            Resume from next incomplete story (auto-detected)
  --status            Show all project statuses, exit
  --dry-run           Show story order without executing
  --max-budget N      Per-story cost cap in USD (default: 5)
  --model MODEL       Override model for all stories
  --no-permissions    Pass --dangerously-skip-permissions to claude
  --retry-failed      Re-run previously failed stories only
  --timeout N         Per-story wall-clock timeout in minutes
  --verbose           Show full claude output
  --tmux              Launch in tmux session with Remote Control
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
# Branch Setup (with auto-worktree for concurrent projects)
# =============================================================================

BRANCH_NAME=$(jq -r '.branchName // empty' "$PRD_PATH")
BASE_BRANCH=$(jq -r '.metadata.baseBranch // "main"' "$PRD_PATH")

if [[ -n "$BRANCH_NAME" && -n "$REPO_PATH" ]] && is_git_repo "$REPO_PATH"; then
  current_branch=$(git -C "$REPO_PATH" branch --show-current 2>/dev/null)

  if [[ "$current_branch" != "$BRANCH_NAME" ]]; then
    # Check if another active project owns this repo on a different branch
    if check_repo_conflict "$REPO_PATH" "$PROJECT" "$BRANCH_NAME"; then
      log_warn "Repo conflict: $CONFLICT_PROJECT is active on branch $CONFLICT_BRANCH"

      if [[ -t 0 ]]; then
        # Interactive: ask user
        echo ""
        echo -e "${YELLOW}Another project ($CONFLICT_PROJECT) is using this repo on branch $CONFLICT_BRANCH.${NC}"
        echo "Options:"
        echo "  1) Auto-create worktree (recommended — isolated checkout)"
        echo "  2) Checkout anyway (will disrupt $CONFLICT_PROJECT)"
        echo "  3) Abort"
        read -rp "Choice [1-3]: " wt_choice
        case "$wt_choice" in
          1) ensure_worktree "$REPO_PATH" "$BRANCH_NAME" "$BASE_BRANCH" ;;
          2)
            log_warn "Force-checking out $BRANCH_NAME (may disrupt $CONFLICT_PROJECT)"
            git -C "$REPO_PATH" checkout "$BRANCH_NAME" 2>/dev/null \
              || git -C "$REPO_PATH" checkout -b "$BRANCH_NAME" "$BASE_BRANCH"
            ;;
          *) exit 0 ;;
        esac
      else
        # Non-interactive: auto-worktree
        log_info "Auto-creating worktree to avoid conflict with $CONFLICT_PROJECT"
        ensure_worktree "$REPO_PATH" "$BRANCH_NAME" "$BASE_BRANCH"
      fi
    else
      # No conflict — safe to checkout directly
      if git -C "$REPO_PATH" show-ref --verify --quiet "refs/heads/$BRANCH_NAME" 2>/dev/null; then
        log_info "Checking out existing branch: $BRANCH_NAME"
        git -C "$REPO_PATH" checkout "$BRANCH_NAME"
      else
        log_info "Creating branch: $BRANCH_NAME from $BASE_BRANCH"
        git -C "$REPO_PATH" checkout -b "$BRANCH_NAME" "$BASE_BRANCH"
      fi
    fi
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
  "current_task": null,
  "completed_tasks": [],
  "failed_tasks": [],
  "retry_queue": [],
  "regression_gates": [],
  "orchestrator": "bash-v1"
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
# Checkout Config (from orchestrator.yaml)
# =============================================================================

CHECKOUT_ENABLED=$(yq e '.checkout.enabled // true' "$HQ_ROOT/settings/orchestrator.yaml" 2>/dev/null || echo "true")
CHECKOUT_STALE_MINUTES=$(yq e '.checkout.stale_timeout_minutes // 30' "$HQ_ROOT/settings/orchestrator.yaml" 2>/dev/null || echo "30")

# =============================================================================
# Checkout Functions
# =============================================================================

# Clean up stale checkout entries — PID is dead AND older than stale_timeout_minutes
clean_stale_checkouts() {
  [[ "$CHECKOUT_ENABLED" != "true" ]] && return 0
  [[ ! -f "$STATE_FILE" ]] && return 0

  local checkout_pid checkout_started pid_age_seconds stale_seconds
  stale_seconds=$(( CHECKOUT_STALE_MINUTES * 60 ))

  checkout_pid=$(jq -r '.current_task.checkedOutBy.pid // empty' "$STATE_FILE" 2>/dev/null) || return 0
  [[ -z "$checkout_pid" ]] && return 0

  # Check if PID is still alive
  if kill -0 "$checkout_pid" 2>/dev/null; then
    return 0  # Still running — leave it
  fi

  # PID is dead — check age
  checkout_started=$(jq -r '.current_task.checkedOutBy.startedAt // empty' "$STATE_FILE" 2>/dev/null) || return 0
  [[ -z "$checkout_started" ]] && {
    # No timestamp — release unconditionally (dead PID + no timestamp)
    jq --arg ts "$(ts)" '
      .current_task.checkedOutBy = null |
      .updated_at = $ts
    ' "$STATE_FILE" > "$STATE_FILE.tmp" && mv "$STATE_FILE.tmp" "$STATE_FILE"
    log_warn "Released stale checkout (dead PID $checkout_pid, no timestamp)"
    return 0
  }

  # Compute age in seconds (macOS-compatible)
  local started_epoch now_epoch
  started_epoch=$(date -j -f "%Y-%m-%dT%H:%M:%SZ" "$checkout_started" "+%s" 2>/dev/null) || return 0
  now_epoch=$(date -u +%s)
  pid_age_seconds=$(( now_epoch - started_epoch ))

  if (( pid_age_seconds >= stale_seconds )); then
    local story_id
    story_id=$(jq -r '.current_task.id // "unknown"' "$STATE_FILE" 2>/dev/null)
    jq --arg ts "$(ts)" '
      .current_task.checkedOutBy = null |
      .updated_at = $ts
    ' "$STATE_FILE" > "$STATE_FILE.tmp" && mv "$STATE_FILE.tmp" "$STATE_FILE"
    log_warn "Released stale checkout: $story_id (dead PID $checkout_pid, ${pid_age_seconds}s old)"
  fi
}

# Attempt to checkout a story. Returns 0 if acquired, 1 if another live PID holds it.
checkout_story() {
  local story_id="$1"
  [[ "$CHECKOUT_ENABLED" != "true" ]] && return 0

  local existing_pid
  existing_pid=$(jq -r '.current_task.checkedOutBy.pid // empty' "$STATE_FILE" 2>/dev/null) || return 0

  if [[ -n "$existing_pid" ]]; then
    # Check if the holding PID is still alive
    if kill -0 "$existing_pid" 2>/dev/null; then
      local holder_session
      holder_session=$(jq -r '.current_task.checkedOutBy.sessionId // "unknown"' "$STATE_FILE" 2>/dev/null)
      log_warn "Story $story_id is checked out by live PID $existing_pid (session: $holder_session) — skipping"
      return 1
    fi
    # Dead PID — allow takeover (stale cleanup may not have caught it yet)
    log_warn "Overriding dead PID $existing_pid checkout for $story_id"
  fi

  # Write checkout entry
  jq --arg pid "$$" --arg ts "$(ts)" --arg sid "$SESSION_ID" '
    .current_task.checkedOutBy = {"pid": ($pid | tonumber), "startedAt": $ts, "sessionId": $sid} |
    .updated_at = $ts
  ' "$STATE_FILE" > "$STATE_FILE.tmp" && mv "$STATE_FILE.tmp" "$STATE_FILE"

  return 0
}

# Release checkout after story completion or failure
release_checkout() {
  [[ "$CHECKOUT_ENABLED" != "true" ]] && return 0
  [[ ! -f "$STATE_FILE" ]] && return 0

  # Only release if WE hold the checkout (don't clobber another PID's entry)
  local holder_pid
  holder_pid=$(jq -r '.current_task.checkedOutBy.pid // empty' "$STATE_FILE" 2>/dev/null) || return 0
  [[ -z "$holder_pid" ]] && return 0
  [[ "$holder_pid" != "$$" ]] && return 0

  jq --arg ts "$(ts)" '
    .current_task.checkedOutBy = null |
    .updated_at = $ts
  ' "$STATE_FILE" > "$STATE_FILE.tmp" && mv "$STATE_FILE.tmp" "$STATE_FILE"
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

  # Check each file against active locks
  while IFS= read -r f; do
    [[ -z "$f" ]] && continue
    local locked
    locked=$(jq -r --arg file "$f" '.[$file].locked_by // empty' "$lock_file" 2>/dev/null) || continue
    if [[ -n "$locked" ]]; then
      log_warn "  File conflict: $f locked by $locked"
      return 0  # has conflict
    fi
  done <<< "$story_files"

  return 1  # no conflicts
}

# Get next incomplete, unblocked, non-conflicting story (priority-aware)
get_next_story() {
  # Re-read PRD each time (execute-task may have updated passes)
  # Selection: unblocked deps → no file conflicts → lowest priority number → array order
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

  # Check file locks for each candidate
  while IFS= read -r cid; do
    [[ -z "$cid" ]] && continue
    if ! has_file_conflict "$cid"; then
      echo "$cid"
      return 0
    fi
  done <<< "$candidates"

  # All candidates have conflicts — return empty
  echo ""
}

get_story_title() {
  jq -r --arg id "$1" '.userStories[] | select(.id == $id) | .title' "$PRD_PATH"
}

# =============================================================================
# Dry Run
# =============================================================================

if [[ "$DRY_RUN" == true ]]; then
  echo -e "${BOLD}Dry Run — Story Execution Order:${NC}\n"
  idx=1

  # Simulate the selection loop
  temp_prd=$(mktemp)
  cp "$PRD_PATH" "$temp_prd"

  while true; do
    next=$(jq -r '
      .userStories as $all |
      [.userStories[] | select(.passes != true)] |
      [.[] | select(
        (.dependsOn // []) | all(. as $dep | $all[] | select(.id == $dep) | .passes == true)
      )] |
      .[0].id // empty
    ' "$temp_prd")

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
  done

  # Check for blocked stories
  blocked=$(jq -r '[.userStories[] | select(.passes != true)] | length' "$temp_prd")
  if [[ "$blocked" -gt 0 ]]; then
    echo ""
    echo -e "${YELLOW}Blocked (unresolvable deps):${NC}"
    jq -r '.userStories[] | select(.passes != true) | "  \(.id): \(.title) (needs: \(.dependsOn | join(", ")))"' "$temp_prd"
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

After completion, output ONLY structured JSON:
{\"task_id\": \"${story_id}\", \"status\": \"completed|failed|blocked\", \"summary\": \"1-sentence\", \"workers_used\": [\"list\"]}"

  local flags=(-p --output-format json)
  if [[ -n "$MAX_BUDGET" ]]; then
    flags+=(--max-budget-usd "$MAX_BUDGET")
  fi

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
    cmd=(timeout "${TIMEOUT}m" "${cmd[@]}")
  fi

  # Clear orchestrator's checkout lock before subprocess — execute-task will acquire its own.
  # Prevents self-locking: parent PID is alive so execute-task's AskUserQuestion fires
  # but can't resolve in headless (-p) mode.
  if [[ -f "$STATE_FILE" ]]; then
    jq --arg ts "$(ts)" '.current_task.checkedOutBy = null | .updated_at = $ts' \
      "$STATE_FILE" > "$STATE_FILE.tmp" && mv "$STATE_FILE.tmp" "$STATE_FILE"
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
  git -C "$REPO_PATH" diff-tree --no-commit-id --name-only -r HEAD 2>/dev/null \
    | jq -R -s 'split("\n") | map(select(length > 0))' || echo "[]"
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
  else
    log_info "Codex review: no findings for $story_id"
    rm -f "$review_file"
  fi
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
      # Run gate on baseBranch to get pre-existing error count
      local base_branch
      base_branch=$(jq -r '.metadata.baseBranch // "main"' "$PRD_PATH" 2>/dev/null || echo "main")
      local current_branch
      current_branch=$(cd "$REPO_PATH" && git branch --show-current)
      local base_err_count=0
      local stashed=false
      # Only stash if there are uncommitted changes
      if (cd "$REPO_PATH" && ! git diff --quiet HEAD 2>/dev/null); then
        (cd "$REPO_PATH" && git stash push -q 2>/dev/null) && stashed=true
      fi
      local base_exit=0
      local base_output=""
      base_output=$(cd "$REPO_PATH" && git checkout "$base_branch" -q 2>/dev/null && eval "$gate" 2>&1) || base_exit=$?
      # Always return to current branch and restore stash
      (cd "$REPO_PATH" && git checkout "$current_branch" -q 2>/dev/null) || log_warn "  Failed to checkout back to $current_branch"
      [[ "$stashed" == true ]] && (cd "$REPO_PATH" && git stash pop -q 2>/dev/null) || true
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
    .progress.total = $total |
    .progress.completed = $completed |
    .progress.failed = (.failed_tasks | length) |
    .progress.in_progress = 0 |
    .current_task = null |
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
    .progress.failed = (.failed_tasks | length) |
    .progress.in_progress = 0 |
    .current_task = null |
    .updated_at = $ts
  ' "$STATE_FILE" > "$STATE_FILE.tmp" && mv "$STATE_FILE.tmp" "$STATE_FILE"
}

update_state_current() {
  local story_id="$1"
  jq --arg id "$story_id" --arg ts "$(ts)" '
    .current_task = {"id": $id, "started_at": $ts, "checkedOutBy": (.current_task.checkedOutBy // null)} |
    .progress.in_progress = 1 |
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
# Main Orchestration Loop
# =============================================================================

completed_this_run=0
retry_queue=()
checkout_skipped=()

echo -e "${BOLD}Starting execution loop...${NC}\n"

while true; do
  # Re-read PRD each iteration (execute-task may have updated passes)
  read_prd_stats

  if [[ "$REMAINING" -eq 0 ]]; then
    break
  fi

  # Get next unblocked story
  STORY_ID=$(get_next_story)

  if [[ -z "$STORY_ID" ]]; then
    # All remaining stories are blocked
    log_warn "All remaining stories are blocked by dependencies."
    jq -r '.userStories[] | select(.passes != true) | "  \(.id): needs \(.dependsOn | join(", "))"' "$PRD_PATH"
    break
  fi

  STORY_TITLE=$(get_story_title "$STORY_ID")

  # Skip if in retry queue or already checkout-skipped (will retry later)
  if [[ ${#retry_queue[@]} -gt 0 ]] && printf '%s\n' "${retry_queue[@]}" | grep -qx "$STORY_ID"; then
    break
  fi
  if [[ ${#checkout_skipped[@]} -gt 0 ]] && printf '%s\n' "${checkout_skipped[@]}" | grep -qx "$STORY_ID"; then
    break  # All available stories are checkout-blocked — stop
  fi

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

    exit_code=0
    run_story "$STORY_ID" "$PROJECT" "$PRD_REL" || exit_code=$?

    story_end=$(date +%s)
    duration=$(( story_end - story_start ))

    # POST-INVOCATION: Validate git state (self-healing)
    validate_git_state "$STORY_ID"

    # POST-INVOCATION: Codex review safety net (best-effort)
    run_codex_review "$STORY_ID"

    # Check source of truth: did passes get set to true?
    passes=$(jq -r --arg id "$STORY_ID" '.userStories[] | select(.id == $id) | .passes' "$PRD_PATH")

    if [[ "$passes" == "true" ]]; then
      commit_sha=$(get_commit_sha)
      files_changed=$(get_changed_files "$STORY_ID")

      update_state_completed "$STORY_ID" "$commit_sha" "$files_changed"
      release_checkout
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

      handle_failure "$STORY_ID" "$attempt"
      result=$?

      case $result in
        0) attempt=$((attempt + 1)); continue ;;  # retry
        2) # skip
          retry_queue+=("$STORY_ID")
          update_state_failed "$STORY_ID" "passes not set after attempt $attempt"
          release_checkout
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
          release_checkout
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
  fi

  # Reindex
  qmd update 2>/dev/null || true

  echo ""
done

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
  local company
  company=$(jq -r '.metadata.company // empty' "$PRD_PATH" 2>/dev/null) || true
  if [[ -n "$company" ]]; then
    local co_projects_index="$HQ_ROOT/companies/$company/projects/INDEX.md"
    if [[ -f "$co_projects_index" ]]; then
      # Touch updated_at — full rebuild deferred to /cleanup
      log_info "INDEX: $co_projects_index needs rebuild (deferred)"
    fi
  fi

  local orch_index="$HQ_ROOT/workspace/orchestrator/INDEX.md"
  if [[ -f "$orch_index" ]]; then
    log_info "INDEX: $orch_index needs rebuild (deferred)"
  fi

  # 3. Doc sweep flag (interactive session handles the actual sweep)
  echo '{"doc_sweep_needed":true,"project":"'"$PROJECT"'","company":"'"$COMPANY"'","repo_path":"'"$REPO_PATH"'"}' \
    > "$PROJECT_DIR/doc-sweep-flag.json" 2>/dev/null || true
  log_info "Doc sweep flagged — run interactively to review"

  # 4. Final reindex
  qmd update 2>/dev/null || true
  log_ok "qmd reindexed"

  # 5. Verify manifest (repos/workers created during project are registered)
  if [[ -n "$REPO_PATH" && -f "$HQ_ROOT/companies/manifest.yaml" ]]; then
    local repo_rel="${REPO_PATH#"$HQ_ROOT/"}"
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
