#!/usr/bin/env bash
#
# Pure Ralph Loop - External terminal orchestrator for autonomous PRD execution
#
# SYNOPSIS
#   ./pure-ralph-loop.sh --prd-path <path> --target-repo <path> [--hq-path <path>]
#
# DESCRIPTION
#   Runs the canonical Ralph loop: one task per fresh Claude session,
#   updates PRD on completion, commits each task atomically.
#
# ARGUMENTS
#   --prd-path      Full path to the PRD JSON file (required)
#   --target-repo   Full path to the target repository (required)
#   --hq-path       Path to HQ directory (defaults to ~/my-hq or C:/my-hq)
#
# EXAMPLE
#   ./pure-ralph-loop.sh --prd-path ~/my-hq/projects/my-project/prd.json --target-repo ~/my-project
#

set -euo pipefail

# ============================================================================
# Argument Parsing
# ============================================================================

PRD_PATH=""
TARGET_REPO=""
HQ_PATH=""

# Detect default HQ path based on OS
if [[ -d "$HOME/my-hq" ]]; then
    HQ_PATH="$HOME/my-hq"
elif [[ -d "/c/my-hq" ]]; then
    HQ_PATH="/c/my-hq"
elif [[ -d "C:/my-hq" ]]; then
    HQ_PATH="C:/my-hq"
else
    HQ_PATH="$HOME/my-hq"
fi

while [[ $# -gt 0 ]]; do
    case $1 in
        --prd-path)
            PRD_PATH="$2"
            shift 2
            ;;
        --target-repo)
            TARGET_REPO="$2"
            shift 2
            ;;
        --hq-path)
            HQ_PATH="$2"
            shift 2
            ;;
        -h|--help)
            echo "Usage: $0 --prd-path <path> --target-repo <path> [--hq-path <path>]"
            echo ""
            echo "Arguments:"
            echo "  --prd-path     Full path to the PRD JSON file (required)"
            echo "  --target-repo  Full path to the target repository (required)"
            echo "  --hq-path      Path to HQ directory (default: ~/my-hq)"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Validate required arguments
if [[ -z "$PRD_PATH" ]]; then
    echo "Error: --prd-path is required"
    exit 1
fi

if [[ -z "$TARGET_REPO" ]]; then
    echo "Error: --target-repo is required"
    exit 1
fi

# ============================================================================
# Configuration
# ============================================================================

BASE_PROMPT_PATH="$HQ_PATH/prompts/pure-ralph-base.md"
PROJECT_NAME=$(basename "$(dirname "$PRD_PATH")")
LOG_DIR="$HQ_PATH/workspace/orchestrator/$PROJECT_NAME"
LOG_FILE="$LOG_DIR/pure-ralph.log"

# ============================================================================
# Color Output
# ============================================================================

RED='\033[0;31m'
YELLOW='\033[0;33m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
GRAY='\033[0;90m'
NC='\033[0m' # No Color

# ============================================================================
# Logging Functions
# ============================================================================

initialize_logging() {
    mkdir -p "$LOG_DIR"

    local timestamp
    timestamp=$(date '+%Y-%m-%d %H:%M:%S')

    {
        echo ""
        echo "=========================================="
        echo "Pure Ralph Loop Started: $timestamp"
        echo "PRD: $PRD_PATH"
        echo "Target: $TARGET_REPO"
        echo "=========================================="
        echo ""
    } >> "$LOG_FILE"
}

write_log() {
    local message="$1"
    local level="${2:-INFO}"
    local timestamp
    timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    local log_entry="[$timestamp] [$level] $message"

    echo "$log_entry" >> "$LOG_FILE"

    # Also output to console with color
    case $level in
        ERROR)
            echo -e "${RED}${log_entry}${NC}"
            ;;
        WARN)
            echo -e "${YELLOW}${log_entry}${NC}"
            ;;
        SUCCESS)
            echo -e "${GREEN}${log_entry}${NC}"
            ;;
        *)
            echo "$log_entry"
            ;;
    esac
}

# ============================================================================
# PRD Functions (using jq for JSON parsing)
# ============================================================================

check_jq() {
    if ! command -v jq &> /dev/null; then
        echo -e "${RED}Error: jq is required but not installed.${NC}"
        echo "Install with:"
        echo "  macOS:   brew install jq"
        echo "  Ubuntu:  sudo apt-get install jq"
        echo "  MSYS2:   pacman -S jq"
        exit 1
    fi
}

get_prd() {
    if [[ ! -f "$PRD_PATH" ]]; then
        write_log "PRD not found: $PRD_PATH" "ERROR"
        exit 1
    fi
    cat "$PRD_PATH"
}

get_task_count() {
    local prd="$1"
    echo "$prd" | jq '.features | length'
}

get_completed_count() {
    local prd="$1"
    echo "$prd" | jq '[.features[] | select(.passes == true)] | length'
}

get_next_task() {
    local prd="$1"

    # Find first task where:
    # 1. passes != true
    # 2. all dependencies (if any) have passes == true
    echo "$prd" | jq -c '
        .features as $all |
        [.features[] | select(.passes != true)] |
        map(select(
            if .dependsOn then
                [.dependsOn[] as $dep | $all[] | select(.id == $dep) | .passes == true] | all
            else
                true
            end
        )) |
        first // empty
    '
}

get_prior_context() {
    local prd="$1"
    echo "$prd" | jq -r '
        [.features[] | select(.passes == true and .notes != null and .notes != "") | "- \(.id): \(.notes)"] | join("\n")
    '
}

# ============================================================================
# Prompt Building
# ============================================================================

build_task_prompt() {
    local task="$1"
    local prd="$2"

    # Read base prompt
    if [[ ! -f "$BASE_PROMPT_PATH" ]]; then
        write_log "Base prompt not found: $BASE_PROMPT_PATH" "ERROR"
        exit 1
    fi

    local base_prompt
    base_prompt=$(cat "$BASE_PROMPT_PATH")

    # Extract task details
    local task_id
    local task_title
    task_id=$(echo "$task" | jq -r '.id')
    task_title=$(echo "$task" | jq -r '.title')

    # Replace placeholders
    local prompt="$base_prompt"
    prompt="${prompt//\{\{TARGET_REPO\}\}/$TARGET_REPO}"
    prompt="${prompt//\{\{PRD_PATH\}\}/$PRD_PATH}"
    prompt="${prompt//\{\{TASK_ID\}\}/$task_id}"
    prompt="${prompt//\{\{TASK_TITLE\}\}/$task_title}"

    # Get context from prior completed tasks
    local prior_context
    prior_context=$(get_prior_context "$prd")

    # Build full prompt with task details
    cat <<EOF
$prompt

Execute task $task_id from $PRD_PATH.

Context from prior tasks:
$prior_context

Read the PRD, implement $task_id ($task_title), then update the PRD.

Return JSON: {success: boolean, summary: string, files_modified: array, notes: string}
EOF
}

# ============================================================================
# Task Execution
# ============================================================================

invoke_task() {
    local task="$1"
    local prd="$2"

    local task_id
    local task_title
    task_id=$(echo "$task" | jq -r '.id')
    task_title=$(echo "$task" | jq -r '.title')

    write_log "Starting task: $task_id - $task_title"
    write_log "Acceptance criteria:"

    # Log each acceptance criterion
    echo "$task" | jq -r '.acceptance_criteria[]' | while read -r ac; do
        write_log "  - $ac"
    done

    # Build the prompt
    local prompt
    prompt=$(build_task_prompt "$task" "$prd")

    # Create temp file for prompt (handles multi-line better)
    local prompt_file
    prompt_file=$(mktemp)
    echo "$prompt" > "$prompt_file"

    write_log "Spawning fresh Claude session..."

    # Save current directory
    local original_dir
    original_dir=$(pwd)

    # Change to target repo directory
    cd "$TARGET_REPO"

    local result
    local exit_code=0

    # Run claude with the prompt
    result=$(claude -p "$(cat "$prompt_file")" 2>&1) || exit_code=$?

    # Return to original directory
    cd "$original_dir"

    # Log the result
    write_log "Claude session completed"
    write_log "Output: $result"

    # Clean up temp file
    rm -f "$prompt_file"

    if [[ $exit_code -eq 0 ]]; then
        echo "SUCCESS"
    else
        echo "FAILED"
    fi
}

# ============================================================================
# Beads Integration
# ============================================================================

BEADS_AVAILABLE=false

check_beads_cli() {
    # Check if beads CLI (bd) is available
    if command -v bd &> /dev/null; then
        BEADS_AVAILABLE=true
        return 0
    else
        BEADS_AVAILABLE=false
        return 1
    fi
}

initialize_beads() {
    local prd="$1"

    if [[ "$BEADS_AVAILABLE" != "true" ]]; then
        return
    fi

    write_log "Syncing PRD tasks to beads..."

    # Iterate through all tasks and sync to beads
    local task_count
    task_count=$(echo "$prd" | jq '.features | length')

    for ((i=0; i<task_count; i++)); do
        local task
        task=$(echo "$prd" | jq -c ".features[$i]")

        local task_id
        local task_title
        local passes
        task_id=$(echo "$task" | jq -r '.id')
        task_title=$(echo "$task" | jq -r '.title')
        passes=$(echo "$task" | jq -r '.passes')

        local bead_id="${PROJECT_NAME}-${task_id}"
        local status
        if [[ "$passes" == "true" ]]; then
            status="done"
        else
            status="todo"
        fi

        # Create or update bead for this task
        if bd add --id "$bead_id" --title "$task_id: $task_title" --status "$status" 2>/dev/null; then
            write_log "  Synced bead: $bead_id ($status)"
        else
            write_log "  Failed to sync bead: $bead_id" "WARN"
        fi
    done

    write_log "Beads sync complete" "SUCCESS"
}

update_bead_status() {
    local task_id="$1"
    local status="$2"  # "in-progress", "done", "blocked"

    if [[ "$BEADS_AVAILABLE" != "true" ]]; then
        return
    fi

    local bead_id="${PROJECT_NAME}-${task_id}"

    if bd update "$bead_id" --status "$status" 2>/dev/null; then
        write_log "Updated bead $bead_id to $status"
    else
        write_log "Failed to update bead: $bead_id" "WARN"
    fi
}

# ============================================================================
# Learnings Aggregation
# ============================================================================

LEARNINGS_PATH="$HQ_PATH/knowledge/pure-ralph/learnings.md"

aggregate_learnings() {
    local prd="$1"

    write_log "Aggregating learnings from completed project..."

    # Count learnings by category based on keywords in notes
    local workflow_count=0
    local technical_count=0
    local gotchas_count=0

    # Extract notes and categorize
    local notes
    notes=$(echo "$prd" | jq -r '.features[] | select(.passes == true and .notes != null and .notes != "") | .notes')

    while IFS= read -r note; do
        [[ -z "$note" ]] && continue

        # Check for workflow patterns
        if echo "$note" | grep -qiE "workflow|process|method|approach|pattern"; then
            ((workflow_count++))
        fi

        # Check for technical patterns
        if echo "$note" | grep -qiE "implement|code|script|function|api|json|file"; then
            ((technical_count++))
        fi

        # Check for gotchas
        if echo "$note" | grep -qiE "error|issue|gotcha|pitfall|careful|avoid|warning"; then
            ((gotchas_count++))
        fi
    done <<< "$notes"

    local total_learnings=$((workflow_count + technical_count + gotchas_count))

    # Update learnings file if it exists
    if [[ -f "$LEARNINGS_PATH" ]]; then
        local date
        date=$(date '+%Y-%m-%d')
        local task_count
        task_count=$(echo "$prd" | jq '.features | length')

        # Append to aggregation log table
        local log_entry="| $date | $PROJECT_NAME | $task_count | $total_learnings patterns extracted |"

        # Check if file has the marker and append
        if grep -q "<!-- Automatically updated when projects complete -->" "$LEARNINGS_PATH"; then
            # Append after the last table row
            # Find the table and add new row
            sed -i "/^| [0-9]\{4\}-[0-9]\{2\}-[0-9]\{2\} |/a\\
$log_entry" "$LEARNINGS_PATH" 2>/dev/null || \
            # If sed fails (macOS), use different approach
            echo "$log_entry" >> "$LEARNINGS_PATH"
        fi

        write_log "Updated learnings aggregation log" "SUCCESS"
    else
        write_log "Learnings file not found at $LEARNINGS_PATH - skipping aggregation" "WARN"
    fi

    # Log summary
    write_log "Learnings extracted - Workflow: $workflow_count, Technical: $technical_count, Gotchas: $gotchas_count"
}

# ============================================================================
# Main Loop
# ============================================================================

start_ralph_loop() {
    initialize_logging

    echo ""
    echo -e "${CYAN}=== Pure Ralph Loop ===${NC}"
    echo -e "${GRAY}PRD: $PRD_PATH${NC}"
    echo -e "${GRAY}Target: $TARGET_REPO${NC}"
    echo -e "${GRAY}Log: $LOG_FILE${NC}"

    # Check for beads CLI availability
    if check_beads_cli; then
        echo -e "${GRAY}Beads CLI: ${GREEN}available${NC}"
        write_log "Beads CLI (bd) detected - task tracking enabled"

        # Initial sync of PRD tasks to beads
        local prd
        prd=$(get_prd)
        initialize_beads "$prd"
    else
        echo -e "${GRAY}Beads CLI: ${YELLOW}not installed (optional)${NC}"
        write_log "Beads CLI (bd) not found - continuing without task tracking"
    fi

    echo ""

    local loop_count=0
    local max_loops=50  # Safety limit

    while [[ $loop_count -lt $max_loops ]]; do
        ((loop_count++))

        # Reload PRD each iteration (it gets updated by claude)
        local prd
        prd=$(get_prd)

        local total
        local completed
        local remaining
        total=$(get_task_count "$prd")
        completed=$(get_completed_count "$prd")
        remaining=$((total - completed))

        echo ""
        echo -e "${CYAN}--- Iteration $loop_count ---${NC}"
        write_log "Iteration $loop_count - Progress: $completed/$total tasks complete"

        # Check if all done
        if [[ $remaining -eq 0 ]]; then
            write_log "All tasks completed!" "SUCCESS"
            echo ""
            echo -e "${GREEN}=== Project Complete ===${NC}"
            echo -e "${GREEN}All $total tasks completed successfully.${NC}"

            # Aggregate learnings on project completion
            aggregate_learnings "$prd"

            break
        fi

        # Get next task
        local task
        task=$(get_next_task "$prd")

        if [[ -z "$task" ]]; then
            write_log "No eligible tasks found. Some tasks may be blocked by dependencies." "WARN"
            echo ""
            echo -e "${YELLOW}Blocked: No tasks have all dependencies met.${NC}"
            echo -e "${YELLOW}Check PRD for dependency issues.${NC}"
            break
        fi

        local task_id
        local task_title
        task_id=$(echo "$task" | jq -r '.id')
        task_title=$(echo "$task" | jq -r '.title')

        echo ""
        echo -e "${YELLOW}Executing: $task_id - $task_title${NC}"

        # Update bead to in-progress
        update_bead_status "$task_id" "in-progress"

        # Execute the task
        local result
        result=$(invoke_task "$task" "$prd")

        if [[ "$result" == "SUCCESS" ]]; then
            write_log "Task $task_id execution completed" "SUCCESS"
            # Update bead to done (PRD update happens in Claude session)
            update_bead_status "$task_id" "done"
        else
            write_log "Task $task_id execution had issues" "WARN"
            # Update bead to blocked
            update_bead_status "$task_id" "blocked"
        fi

        # Brief pause between tasks
        sleep 2
    done

    if [[ $loop_count -ge $max_loops ]]; then
        write_log "Safety limit reached ($max_loops iterations)" "WARN"
    fi

    # Final summary
    prd=$(get_prd)
    total=$(get_task_count "$prd")
    completed=$(get_completed_count "$prd")
    remaining=$((total - completed))

    echo ""
    echo -e "${CYAN}=== Final Summary ===${NC}"
    if [[ $remaining -eq 0 ]]; then
        echo -e "${GREEN}Completed: $completed/$total tasks${NC}"
    else
        echo -e "${YELLOW}Completed: $completed/$total tasks${NC}"
    fi
    echo -e "${GRAY}Log file: $LOG_FILE${NC}"

    write_log "Loop ended. Final state: $completed/$total tasks complete"
}

# ============================================================================
# Entry Point
# ============================================================================

# Check for jq dependency
check_jq

# Validate inputs
if [[ ! -f "$PRD_PATH" ]]; then
    echo -e "${RED}Error: PRD not found at $PRD_PATH${NC}"
    exit 1
fi

if [[ ! -d "$TARGET_REPO" ]]; then
    echo -e "${RED}Error: Target repo not found at $TARGET_REPO${NC}"
    exit 1
fi

# Run the loop
start_ralph_loop
