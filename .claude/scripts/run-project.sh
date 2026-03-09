#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# run-project.sh — Self-Healing Project Orchestrator (Ralph Loop)
#
# Runs each story as an independent `claude -p` headless invocation.
# No context ceiling. Git validation after each story. Retry queue.
# Regression gates every N stories.
#
# Usage:
#   .claude/scripts/run-project.sh <project> [flags]
#   .claude/scripts/run-project.sh --status
#
# Flags:
#   --hq-path PATH      Path to HQ directory (default: ~/my-hq or $HQ_PATH)
#   --target-repo PATH  Override repo path (default: from prd.json metadata.repoPath)
#   --resume            Resume from next incomplete story (auto-detected)
#   --status            Show all project statuses, exit
#   --dry-run           Show story order without executing
#   --max-budget N      Per-story cost cap in USD (default: 5)
#   --model MODEL       Override model for all stories
#   --no-permissions    Pass --dangerously-skip-permissions to claude
#   --retry-failed      Re-run previously failed stories only
#   --timeout N         Per-story wall-clock timeout in minutes (default: none)
#   --verbose           Show full claude output
# =============================================================================

# --- Resolve HQ_ROOT ---
if [[ -n "${HQ_PATH:-}" ]]; then
  HQ_ROOT="$HQ_PATH"
elif [[ -d "$HOME/my-hq" ]]; then
  HQ_ROOT="$HOME/my-hq"
elif [[ -d "/c/my-hq" ]]; then
  HQ_ROOT="/c/my-hq"
elif [[ -d "C:/my-hq" ]]; then
  HQ_ROOT="C:/my-hq"
else
  HQ_ROOT="$HOME/my-hq"
fi

ORCH_DIR="$HQ_ROOT/workspace/orchestrator"
REGRESSION_INTERVAL=3

# --- Defaults ---
PROJECT=""
TARGET_REPO_OVERRIDE=""
RESUME=false
STATUS=false
DRY_RUN=false
MAX_BUDGET=5
MODEL=""
NO_PERMISSIONS=false
RETRY_FAILED=false
TIMEOUT=""
VERBOSE=false

# --- Colors ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

# =============================================================================
# Argument Parsing
# =============================================================================

while [[ $# -gt 0 ]]; do
  case "$1" in
    --hq-path)      HQ_ROOT="$2"; ORCH_DIR="$HQ_ROOT/workspace/orchestrator"; shift 2 ;;
    --target-repo)  TARGET_REPO_OVERRIDE="$2"; shift 2 ;;
    --resume)       RESUME=true; shift ;;
    --status)       STATUS=true; shift ;;
    --dry-run)      DRY_RUN=true; shift ;;
    --max-budget)   MAX_BUDGET="$2"; shift 2 ;;
    --model)        MODEL="$2"; shift 2 ;;
    --no-permissions) NO_PERMISSIONS=true; shift ;;
    --retry-failed) RETRY_FAILED=true; shift ;;
    --timeout)      TIMEOUT="$2"; shift 2 ;;
    --verbose)      VERBOSE=true; shift ;;
    --help|-h)
      cat <<'HELP'
Usage: run-project.sh <project> [flags]
       run-project.sh --status

Flags:
  --hq-path PATH      Path to HQ directory (default: ~/my-hq or $HQ_PATH)
  --target-repo PATH  Override repo path (default: from prd.json metadata.repoPath)
  --resume            Resume from next incomplete story (auto-detected)
  --status            Show all project statuses, exit
  --dry-run           Show story order without executing
  --max-budget N      Per-story cost cap in USD (default: 5)
  --model MODEL       Override model for all stories
  --no-permissions    Pass --dangerously-skip-permissions to claude
  --retry-failed      Re-run previously failed stories only
  --timeout N         Per-story wall-clock timeout in minutes
  --verbose           Show full claude output
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
  echo "Usage: run-project.sh <project> [flags]"
  echo "       run-project.sh --status"
  echo ""
  echo "Run run-project.sh --help for all options."
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

  return 1
}

PRD_PATH=""
PRD_PATH=$(resolve_prd_path "$PROJECT") || true

if [[ -z "$PRD_PATH" || ! -f "$PRD_PATH" ]]; then
  echo -e "${RED}ERROR: prd.json not found for '$PROJECT'.${NC}"
  echo "Searched:"
  echo "  $HQ_ROOT/companies/*/projects/$PROJECT/prd.json"
  echo "  $HQ_ROOT/projects/$PROJECT/prd.json"
  exit 1
fi

# Relative path for state files
PRD_REL="${PRD_PATH#"$HQ_ROOT/"}"

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
if [[ -n "$TARGET_REPO_OVERRIDE" ]]; then
  REPO_PATH="$TARGET_REPO_OVERRIDE"
else
  REPO_PATH=$(jq -r '.metadata.repoPath // empty' "$PRD_PATH")
  if [[ -n "$REPO_PATH" && ! "$REPO_PATH" = /* ]]; then
    REPO_PATH="$HQ_ROOT/$REPO_PATH"
  fi
fi

# =============================================================================
# Branch Setup
# =============================================================================

BRANCH_NAME=$(jq -r '.branchName // empty' "$PRD_PATH")
BASE_BRANCH=$(jq -r '.metadata.baseBranch // "main"' "$PRD_PATH")

if [[ -n "$BRANCH_NAME" && -n "$REPO_PATH" && -d "$REPO_PATH/.git" ]]; then
  current_branch=$(git -C "$REPO_PATH" branch --show-current 2>/dev/null)
  if [[ "$current_branch" != "$BRANCH_NAME" ]]; then
    if git -C "$REPO_PATH" show-ref --verify --quiet "refs/heads/$BRANCH_NAME" 2>/dev/null; then
      log_info "Checking out existing branch: $BRANCH_NAME"
      git -C "$REPO_PATH" checkout "$BRANCH_NAME"
    else
      log_info "Creating branch: $BRANCH_NAME from $BASE_BRANCH"
      git -C "$REPO_PATH" checkout -b "$BRANCH_NAME" "$BASE_BRANCH"
    fi
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
  jq --arg ts "$(ts)" '.status = "in_progress" | .updated_at = $ts' "$STATE_FILE" > "$STATE_FILE.tmp" \
    && mv "$STATE_FILE.tmp" "$STATE_FILE"
  log_info "Resuming from state.json"
else
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
  "orchestrator": "run-project-v2"
}
EOF
  echo "[$(ts)] Project started: $PROJECT ($TOTAL stories, $COMPLETED already completed)" >> "$PROGRESS_FILE"
  log_info "Initialized new project state"
fi

# =============================================================================
# Story Selection (deps → file locks → priority → array order)
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
# Build Prompt for a Story
# =============================================================================

build_prompt() {
  local story_id="$1"
  local story_title="$2"
  local prd_path="$3"
  local project_name="$4"

  local prompt_template="$HQ_ROOT/prompts/pure-ralph-base.md"

  if [[ -f "$prompt_template" ]]; then
    # Read template and substitute variables
    local prompt_text
    prompt_text=$(cat "$prompt_template")
    prompt_text="${prompt_text//\{\{PRD_PATH\}\}/$prd_path}"
    prompt_text="${prompt_text//\{\{TARGET_REPO\}\}/${REPO_PATH:-$HQ_ROOT}}"
    prompt_text="${prompt_text//\{\{PROJECT_NAME\}\}/$project_name}"
    prompt_text="${prompt_text//\{\{STORY_ID\}\}/$story_id}"
    prompt_text="${prompt_text//\{\{STORY_TITLE\}\}/$story_title}"

    # Prepend story assignment directive
    echo "ASSIGNED STORY: ${story_id} — ${story_title}
Work on THIS story ONLY. Do NOT pick a different story.

${prompt_text}"
  else
    # Fallback: inline prompt when no template exists
    local story_desc story_criteria
    story_desc=$(jq -r --arg id "$story_id" '.userStories[] | select(.id == $id) | .description // ""' "$HQ_ROOT/$prd_path" 2>/dev/null) || true
    story_criteria=$(jq -r --arg id "$story_id" '.userStories[] | select(.id == $id) | .acceptance_criteria // [] | map("- " + .) | join("\n")' "$HQ_ROOT/$prd_path" 2>/dev/null) || true

    cat <<PROMPT
You are executing the Ralph Loop. Complete ONE assigned story, then exit.

ASSIGNED STORY: ${story_id} — ${story_title}
Description: ${story_desc}
Acceptance Criteria:
${story_criteria}

PRD Path: ${prd_path}
Target Repo: ${REPO_PATH:-$HQ_ROOT}
Project: ${project_name}

## Instructions

1. BRANCH — Ensure you're on feature/${project_name} (create from ${BASE_BRANCH:-main} if needed)
2. READ the full PRD at ${prd_path} for context
3. IMPLEMENT story ${story_id}
4. TEST — verify the implementation works
5. COMMIT with message: feat(${story_id}): Brief description
6. UPDATE the PRD: set passes: true for ${story_id}, add notes with what you did
7. EXIT — the orchestrator handles the next story

CRITICAL:
- Work on ${story_id} ONLY. Do NOT pick a different story.
- NEVER commit to main/master. Always use feature/${project_name}.
- Do NOT mark passes: true without testing first.
- Commit ALL changes before exiting.

After completion, output ONLY:
{"task_id": "${story_id}", "status": "completed|failed|blocked", "summary": "1-sentence"}
PROMPT
  fi
}

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

  local story_title
  story_title=$(jq -r --arg id "$story_id" '.userStories[] | select(.id == $id) | .title' "$HQ_ROOT/$prd_path" 2>/dev/null) || true

  local prompt
  prompt=$(build_prompt "$story_id" "$story_title" "$prd_path" "$project")

  local flags=(-p --output-format json --max-budget-usd "$MAX_BUDGET")

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

  local cmd=(claude "${flags[@]}" "$prompt")

  if [[ -n "$TIMEOUT" ]]; then
    cmd=(timeout "${TIMEOUT}m" "${cmd[@]}")
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

  [[ -z "$REPO_PATH" || ! -d "$REPO_PATH/.git" ]] && return 0

  local dirty
  dirty=$(git -C "$REPO_PATH" status --porcelain 2>/dev/null) || return 0

  if [[ -n "$dirty" ]]; then
    log_warn "Sub-agent left uncommitted changes. Auto-committing..."
    git -C "$REPO_PATH" add -A
    git -C "$REPO_PATH" commit -m "[orchestrator] ${story_id}: auto-commit uncommitted work" --no-verify 2>/dev/null || true
  fi
}

get_commit_sha() {
  [[ -z "$REPO_PATH" || ! -d "$REPO_PATH/.git" ]] && echo "n/a" && return
  git -C "$REPO_PATH" rev-parse --short HEAD 2>/dev/null || echo "n/a"
}

get_changed_files() {
  local story_id="$1"
  [[ -z "$REPO_PATH" || ! -d "$REPO_PATH/.git" ]] && echo "[]" && return
  git -C "$REPO_PATH" diff-tree --no-commit-id --name-only -r HEAD 2>/dev/null \
    | jq -R -s 'split("\n") | map(select(length > 0))' || echo "[]"
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

  local gate_passed=true
  while IFS= read -r gate; do
    [[ -z "$gate" ]] && continue
    log "  Gate: $gate"
    if ! (cd "$REPO_PATH" && eval "$gate" >/dev/null 2>&1); then
      log_err "  REGRESSION: $gate failed"
      gate_passed=false
    else
      log_ok "  Passed: $gate"
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
           log_warn "Paused. Resume with: run-project.sh --resume $PROJECT"
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
    .current_task = {"id": $id, "started_at": $ts} |
    .progress.in_progress = 1 |
    .updated_at = $ts
  ' "$STATE_FILE" > "$STATE_FILE.tmp" && mv "$STATE_FILE.tmp" "$STATE_FILE"
}

# =============================================================================
# Main Orchestration Loop
# =============================================================================

completed_this_run=0
retry_queue=()

echo -e "${BOLD}Starting execution loop...${NC}\n"

while true; do
  # Re-read PRD each iteration (claude may have updated passes)
  read_prd_stats

  if [[ "$REMAINING" -eq 0 ]]; then
    break
  fi

  # Get next unblocked story
  STORY_ID=$(get_next_story)

  if [[ -z "$STORY_ID" ]]; then
    log_warn "All remaining stories are blocked by dependencies."
    jq -r '.userStories[] | select(.passes != true) | "  \(.id): needs \(.dependsOn | join(", "))"' "$PRD_PATH"
    break
  fi

  STORY_TITLE=$(get_story_title "$STORY_ID")

  # Skip if in retry queue (will retry later)
  if [[ ${#retry_queue[@]} -gt 0 ]] && printf '%s\n' "${retry_queue[@]}" | grep -qx "$STORY_ID"; then
    break
  fi

  echo -e "${BOLD}=== $STORY_ID: $STORY_TITLE === ($COMPLETED/$TOTAL)${NC}"

  # Update state: current task
  update_state_current "$STORY_ID"

  # Execute story
  attempt=1
  story_passed=false

  while [[ "$attempt" -le 2 ]]; do
    log_info "Running story $STORY_ID (attempt $attempt)..."
    story_start=$(date +%s)

    exit_code=0
    run_story "$STORY_ID" "$PROJECT" "$PRD_REL" || exit_code=$?

    story_end=$(date +%s)
    duration=$(( story_end - story_start ))

    # POST-INVOCATION: Validate git state (self-healing)
    validate_git_state "$STORY_ID"

    # Check source of truth: did passes get set to true?
    passes=$(jq -r --arg id "$STORY_ID" '.userStories[] | select(.id == $id) | .passes' "$PRD_PATH")

    if [[ "$passes" == "true" ]]; then
      commit_sha=$(get_commit_sha)
      files_changed=$(get_changed_files "$STORY_ID")

      update_state_completed "$STORY_ID" "$commit_sha" "$files_changed"
      echo "[$(ts)] $STORY_ID: $STORY_TITLE — completed (${duration}s) [$commit_sha] ($COMPLETED/$TOTAL)" >> "$PROGRESS_FILE"

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
          echo "[$(ts)] $STORY_ID: FAILED — queued for retry ($COMPLETED/$TOTAL)" >> "$PROGRESS_FILE"
          break
          ;;
        3) # pause
          jq --arg ts "$(ts)" '.status = "paused" | .updated_at = $ts' "$STATE_FILE" > "$STATE_FILE.tmp" \
            && mv "$STATE_FILE.tmp" "$STATE_FILE"
          log_warn "Paused. Resume: run-project.sh --resume $PROJECT"
          exit 0
          ;;
      esac
    fi
  done

  # REGRESSION GATE: every N completed stories
  if [[ "$story_passed" == true && $((completed_this_run % REGRESSION_INTERVAL)) -eq 0 && "$completed_this_run" -gt 0 ]]; then
    run_regression_gate "$STORY_ID"
  fi

  echo ""
done

# =============================================================================
# Retry Pass
# =============================================================================

if [[ ${#retry_queue[@]} -gt 0 ]]; then
  echo -e "\n${BOLD}=== Retry Pass ===${NC}"
  echo -e "Retrying ${#retry_queue[@]} failed stories...\n"

  for story_id in "${retry_queue[@]}"; do
    passes=$(jq -r --arg id "$story_id" '.userStories[] | select(.id == $id) | .passes' "$PRD_PATH")
    if [[ "$passes" == "true" ]]; then
      log_ok "$story_id already passing (fixed by later story)"
      continue
    fi

    title=$(get_story_title "$story_id")
    echo -e "${BOLD}=== RETRY: $story_id: $title ===${NC}"

    exit_code=0
    run_story "$story_id" "$PROJECT" "$PRD_REL" || exit_code=$?

    validate_git_state "$story_id"

    passes=$(jq -r --arg id "$story_id" '.userStories[] | select(.id == $id) | .passes' "$PRD_PATH")
    if [[ "$passes" == "true" ]]; then
      commit_sha=$(get_commit_sha)
      files_changed=$(get_changed_files "$story_id")
      update_state_completed "$story_id" "$commit_sha" "$files_changed"
      echo "[$(ts)] $story_id: $title — completed on retry [$commit_sha] ($COMPLETED/$TOTAL)" >> "$PROGRESS_FILE"
      log_ok "$story_id completed on retry [$commit_sha]"
      completed_this_run=$((completed_this_run + 1))
    else
      log_err "$story_id failed on retry"
      echo "[$(ts)] $story_id: FAILED on retry" >> "$PROGRESS_FILE"
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

  # Generate project summary report
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
      jq -r '.regression_gates[] | "- After \(.after_story): \(if .passed then "passed" else "failed" end)"' "$STATE_FILE"
      echo ""
    fi
  } > "$REPORT_FILE"
  log_ok "Report: $REPORT_FILE"

else
  echo -e "\n${YELLOW}$REMAINING stories remaining.${NC}"
  echo -e "Resume: ${DIM}run-project.sh --resume $PROJECT${NC}"
fi

echo ""
