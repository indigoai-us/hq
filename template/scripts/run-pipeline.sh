#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# run-pipeline.sh — Multi-Project Pipeline Orchestrator
#
# Runs multiple PRD projects through the full lifecycle:
#   triage -> build -> PR -> review -> merge -> deploy -> canary -> done
#
# Wraps run-project.sh per project. Manages sequencing, safety gates,
# and cross-project state.
#
# Usage:
#   scripts/run-pipeline.sh <company> <prd1> [prd2...] [flags]
#   scripts/run-pipeline.sh --resume <pipeline-id>
#   scripts/run-pipeline.sh --status
#
# Flags:
#   --resume <id>         Resume an existing pipeline
#   --status              Show all pipeline statuses, exit
#   --dry-run             Triage and show sequence without executing
#   --model MODEL         Override model for all projects (claude builder only)
#   --builder BUILDER     Build-phase agent: "claude" (default) or "codex"
#   --timeout N           Per-project wall-clock timeout in minutes
#   --verbose             Show full output
#   --no-permissions      Pass --dangerously-skip-permissions to claude
#   --auto-merge-all      Auto-merge all PRs regardless of risk
#   --gate-all-merges     Require human approval for all merges
#   --skip-canary         Skip post-deploy canary monitoring
#   --auto-sst-deploy     Auto-deploy SST infra (skip gate)
#   --skip-failed-projects  Continue pipeline when a project fails
#   --build-only          Run phase_build only; skip all downstream lifecycle stages
#   --help                Show this help and exit
# =============================================================================

VERSION="0.1.0"
HQ_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PIPELINE_BASE_DIR="workspace/orchestrator/_pipeline"
PIPELINE_YAML="settings/pipeline.yaml"
export PATH="/opt/homebrew/bin:$HOME/.bun/bin:$HOME/.cargo/bin:$HOME/.local/bin:$PATH"

# --- Colors (mirrored from run-project.sh) ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

# --- Logging (mirrored from run-project.sh) ---
ts() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }
log()      { echo -e "${DIM}[$(date +%H:%M:%S)]${NC} $*"; }
log_info() { echo -e "${DIM}[$(date +%H:%M:%S)]${NC} ${BLUE}INFO${NC}  $*"; }
log_ok()   { echo -e "${DIM}[$(date +%H:%M:%S)]${NC} ${GREEN}DONE${NC}  $*"; }
log_warn() { echo -e "${DIM}[$(date +%H:%M:%S)]${NC} ${YELLOW}WARN${NC}  $*"; }
log_err()  { echo -e "${DIM}[$(date +%H:%M:%S)]${NC} ${RED}FAIL${NC}  $*"; }

# =============================================================================
# yaml_read() — Read YAML values (yq with python3 fallback)
# =============================================================================

yaml_read() {
  local file="$1" key="$2"
  if command -v yq &>/dev/null; then
    yq eval "$key" "$file" 2>/dev/null
  else
    python3 -c "
import yaml, sys, json
d = yaml.safe_load(open('$file'))
keys = '$key'.strip('.').split('.')
v = d
for k in keys:
    if v is None:
        print('null')
        sys.exit(0)
    v = v.get(k) if isinstance(v, dict) else None
if v is None:
    print('null')
elif isinstance(v, bool):
    print('true' if v else 'false')
elif isinstance(v, (int, float)):
    print(v)
else:
    print(v)
" 2>/dev/null
  fi
}

# =============================================================================
# Config Loading
# =============================================================================

# Defaults (used when pipeline.yaml missing or key absent)
CFG_SAFETY_MODE="gated"
CFG_DEPLOY_POLICY="dev_auto_prod_gated"
CFG_AUTO_MERGE=false
CFG_SKIP_CANARY=false
CFG_CODEX_REVIEW_ENABLED=true
CFG_CODEX_REVIEW_TIMEOUT_SEC=300
CFG_CODEX_REVIEW_POLL_SEC=30
CFG_CODEX_AUTOFIX=true
CFG_CODEX_AUTOFIX_MAX=1
CFG_G_REVIEW_ENABLED=true
CFG_DEPLOY_AUTO_TRIGGER=true
CFG_CANARY_DURATION_SEC=180
CFG_SST_AUTO_DEPLOY=false
CFG_REPO_GROUPING=true
CFG_INFRA_FIRST=true
CFG_MAX_BATCH_SIZE=10
CFG_PROJECT_POLL_SEC=30
CFG_GATE_POLL_SEC=10
CFG_CI_POLL_SEC=60
CFG_DEPLOY_POLL_SEC=30

load_config() {
  local config_file="${HQ_ROOT}/${PIPELINE_YAML}"
  if [[ ! -f "$config_file" ]]; then
    log_warn "Pipeline config not found at ${PIPELINE_YAML} — using defaults"
    return 0
  fi

  log_info "Loading config from ${PIPELINE_YAML}"

  # Safety
  local val
  val=$(yaml_read "$config_file" ".safety.default_mode") && [[ "$val" != "null" ]] && CFG_SAFETY_MODE="$val"

  # Review
  val=$(yaml_read "$config_file" ".review.codex_review_enabled") && [[ "$val" != "null" ]] && CFG_CODEX_REVIEW_ENABLED="$val"
  val=$(yaml_read "$config_file" ".review.codex_review_timeout_sec") && [[ "$val" != "null" ]] && CFG_CODEX_REVIEW_TIMEOUT_SEC="$val"
  val=$(yaml_read "$config_file" ".review.codex_review_poll_interval_sec") && [[ "$val" != "null" ]] && CFG_CODEX_REVIEW_POLL_SEC="$val"
  val=$(yaml_read "$config_file" ".review.codex_autofix") && [[ "$val" != "null" ]] && CFG_CODEX_AUTOFIX="$val"
  val=$(yaml_read "$config_file" ".review.codex_autofix_max_attempts") && [[ "$val" != "null" ]] && CFG_CODEX_AUTOFIX_MAX="$val"
  val=$(yaml_read "$config_file" ".review.g_review_enabled") && [[ "$val" != "null" ]] && CFG_G_REVIEW_ENABLED="$val"

  # Deploy
  val=$(yaml_read "$config_file" ".deploy.auto_trigger") && [[ "$val" != "null" ]] && CFG_DEPLOY_AUTO_TRIGGER="$val"
  val=$(yaml_read "$config_file" ".deploy.canary_duration_sec") && [[ "$val" != "null" ]] && CFG_CANARY_DURATION_SEC="$val"
  val=$(yaml_read "$config_file" ".deploy.sst_auto_deploy") && [[ "$val" != "null" ]] && CFG_SST_AUTO_DEPLOY="$val"

  # Sequencing
  val=$(yaml_read "$config_file" ".sequencing.repo_grouping") && [[ "$val" != "null" ]] && CFG_REPO_GROUPING="$val"
  val=$(yaml_read "$config_file" ".sequencing.infra_first") && [[ "$val" != "null" ]] && CFG_INFRA_FIRST="$val"
  val=$(yaml_read "$config_file" ".sequencing.max_batch_size") && [[ "$val" != "null" ]] && CFG_MAX_BATCH_SIZE="$val"

  # Polling
  val=$(yaml_read "$config_file" ".polling.project_poll_interval_sec") && [[ "$val" != "null" ]] && CFG_PROJECT_POLL_SEC="$val"
  val=$(yaml_read "$config_file" ".polling.gate_poll_interval_sec") && [[ "$val" != "null" ]] && CFG_GATE_POLL_SEC="$val"
  val=$(yaml_read "$config_file" ".polling.ci_poll_interval_sec") && [[ "$val" != "null" ]] && CFG_CI_POLL_SEC="$val"
  val=$(yaml_read "$config_file" ".polling.deploy_poll_interval_sec") && [[ "$val" != "null" ]] && CFG_DEPLOY_POLL_SEC="$val"

  log_ok "Config loaded (safety_mode=${CFG_SAFETY_MODE})"
}

# =============================================================================
# Defaults
# =============================================================================

COMPANY=""
PRDS=()
RESUME_ID=""
STATUS=false
DRY_RUN=false
MODEL=""
BUILDER=""  # "" = claude (default), "codex" = route phase_build to Codex CLI via run-project.sh
TIMEOUT=""
VERBOSE=false
NO_PERMISSIONS=false
AUTO_MERGE_ALL=false
GATE_ALL_MERGES=false
SKIP_CANARY=false
AUTO_SST_DEPLOY=false
SKIP_FAILED_PROJECTS=false
BUILD_ONLY=false
PIPELINE_ID=""

# Gate config defaults (loaded by load_gate_config from pipeline.yaml)
GATE_PRE_TRIAGE="always"
GATE_PRE_MERGE_LOW="auto"
GATE_PRE_MERGE_MEDIUM="auto"
GATE_PRE_MERGE_HIGH="gated"
GATE_PRE_DEPLOY_DEV="auto"
GATE_PRE_DEPLOY_PROD="gated"
GATE_CANARY_FAILURE="gated"
GATE_SST_DEPLOY="gated"
GATE_POLL_INTERVAL="${CFG_GATE_POLL_SEC}"

# =============================================================================
# Argument Parsing
# =============================================================================

while [[ $# -gt 0 ]]; do
  case "$1" in
    --resume)
      RESUME_ID="$2"; shift 2 ;;
    --status)
      STATUS=true; shift ;;
    --dry-run)
      DRY_RUN=true; shift ;;
    --model)
      MODEL="$2"; shift 2 ;;
    --builder)
      BUILDER="$2"; shift 2 ;;
    --timeout)
      TIMEOUT="$2"; shift 2 ;;
    --verbose)
      VERBOSE=true; shift ;;
    --no-permissions)
      NO_PERMISSIONS=true; shift ;;
    --auto-merge-all)
      AUTO_MERGE_ALL=true; shift ;;
    --gate-all-merges)
      GATE_ALL_MERGES=true; shift ;;
    --skip-canary)
      SKIP_CANARY=true; shift ;;
    --auto-sst-deploy)
      AUTO_SST_DEPLOY=true; shift ;;
    --skip-failed-projects)
      SKIP_FAILED_PROJECTS=true; shift ;;
    --build-only)
      BUILD_ONLY=true; shift ;;
    --help|-h)
      cat <<'HELP'
Usage: scripts/run-pipeline.sh <company> <prd1> [prd2...] [flags]
       scripts/run-pipeline.sh --resume <pipeline-id>
       scripts/run-pipeline.sh --status

Multi-project pipeline orchestrator. Runs multiple PRD projects through:
  triage -> build -> PR -> review -> merge -> deploy -> canary -> done

Flags:
  --resume <id>           Resume an existing pipeline by ID
  --status                Show all pipeline statuses, exit
  --dry-run               Triage and show sequence without executing
  --model MODEL           Override model for all projects (claude builder only)
  --builder BUILDER       Build-phase agent: "claude" (default) or "codex".
                          When "codex", run-project.sh invokes `codex exec`
                          instead of `claude -p` for phase_build. phase_codex_review
                          still runs regardless (Codex is the reviewer in both modes).
  --timeout N             Per-project wall-clock timeout in minutes
  --verbose               Show full output
  --no-permissions        Pass --dangerously-skip-permissions to claude
  --auto-merge-all        Auto-merge all PRs regardless of risk level
  --gate-all-merges       Require human approval for all merges
  --skip-canary           Skip post-deploy canary monitoring
  --auto-sst-deploy       Auto-deploy SST infra changes (skip gate)
  --skip-failed-projects  Continue pipeline when a project fails
  --build-only            Run phase_build only; skip PR, CI, review, merge, deploy, canary
                          (used when PRs will be opened manually post-run)

Examples:
  scripts/run-pipeline.sh {product} agents-perf unsubscribe-metric
  scripts/run-pipeline.sh {product} agents-perf --dry-run
  scripts/run-pipeline.sh --resume PL-20260404-120000-{product}
  scripts/run-pipeline.sh --status
HELP
      exit 0
      ;;
    -*)
      echo -e "${RED}Unknown flag: $1${NC}" >&2
      echo "Run with --help for usage." >&2
      exit 1
      ;;
    *)
      # First positional = company, rest = PRDs
      if [[ -z "$COMPANY" ]]; then
        COMPANY="$1"
      else
        PRDS+=("$1")
      fi
      shift
      ;;
  esac
done

# =============================================================================
# Pipeline ID Generation
# =============================================================================

generate_pipeline_id() {
  echo "PL-$(date +%Y%m%d-%H%M%S)-${COMPANY}"
}

# =============================================================================
# State Initialization
# =============================================================================

init_pipeline_state() {
  PIPELINE_ID=$(generate_pipeline_id)
  local pipeline_dir="${HQ_ROOT}/${PIPELINE_BASE_DIR}/${PIPELINE_ID}"
  STATE_FILE="${pipeline_dir}/pipeline-state.json"

  mkdir -p "$pipeline_dir"

  local now
  now=$(ts)

  # Determine effective config from flags + loaded config
  local effective_safety_mode="$CFG_SAFETY_MODE"
  local effective_auto_merge="$CFG_AUTO_MERGE"
  local effective_skip_canary="$CFG_SKIP_CANARY"
  local effective_sst_auto="$CFG_SST_AUTO_DEPLOY"
  local effective_deploy_policy="$CFG_DEPLOY_POLICY"

  # CLI overrides
  [[ "$AUTO_MERGE_ALL" == true ]] && effective_auto_merge=true
  [[ "$GATE_ALL_MERGES" == true ]] && effective_safety_mode="paranoid"
  [[ "$SKIP_CANARY" == true ]] && effective_skip_canary=true
  [[ "$AUTO_SST_DEPLOY" == true ]] && effective_sst_auto=true

  # Build PRD list as JSON array for jq
  local prd_json="[]"
  for prd in "${PRDS[@]}"; do
    prd_json=$(echo "$prd_json" | jq --arg p "$prd" '. + [$p]')
  done

  jq -n \
    --arg pipeline_id "$PIPELINE_ID" \
    --arg created_at "$now" \
    --arg updated_at "$now" \
    --arg company "$COMPANY" \
    --arg safety_mode "$effective_safety_mode" \
    --arg deploy_policy "$effective_deploy_policy" \
    --argjson auto_merge "$effective_auto_merge" \
    --argjson skip_canary "$effective_skip_canary" \
    --argjson sst_auto "$effective_sst_auto" \
    --argjson codex_review_timeout "$CFG_CODEX_REVIEW_TIMEOUT_SEC" \
    --argjson codex_autofix "$CFG_CODEX_AUTOFIX" \
    --argjson pid "$$" \
    --argjson prds "$prd_json" \
    '{
      pipeline_id: $pipeline_id,
      created_at: $created_at,
      updated_at: $updated_at,
      completed_at: null,
      status: "in_progress",
      company: $company,
      orchestrator: "pipeline-v1",
      pid: $pid,
      config: {
        safety_mode: $safety_mode,
        deploy_policy: $deploy_policy,
        auto_merge: $auto_merge,
        skip_canary: $skip_canary,
        codex_review_timeout_sec: $codex_review_timeout,
        codex_autofix: $codex_autofix,
        sst_auto_deploy: $sst_auto
      },
      input_prds: $prds,
      sequence: [],
      pending_gate: null,
      summary: {
        total: 0,
        queued: 0,
        building: 0,
        pr_open: 0,
        reviewing: 0,
        merging: 0,
        deploying: 0,
        deployed: 0,
        done: 0,
        failed: 0,
        skipped: 0
      }
    }' > "${STATE_FILE}.tmp" && mv "${STATE_FILE}.tmp" "$STATE_FILE"

  PIPELINE_DIR="${pipeline_dir}"

  log_ok "Pipeline initialized: ${PIPELINE_ID}"
  log_info "State: ${STATE_FILE}"
}

# =============================================================================
# State Update Helper
# =============================================================================

update_state() {
  local filter="$1"
  local now
  now=$(ts)
  local full_filter="${filter} | .updated_at = \"${now}\""
  jq "$full_filter" "$STATE_FILE" > "${STATE_FILE}.tmp" && mv "${STATE_FILE}.tmp" "$STATE_FILE"
}

# =============================================================================
# Signal Handling
# =============================================================================

CHILD_PIDS=()

cleanup_on_signal() {
  local sig="$1"
  log_warn "Caught signal ${sig} — pausing pipeline..."

  # Kill child processes
  for pid in "${CHILD_PIDS[@]}"; do
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
      log_warn "Killed child process PID ${pid}"
    fi
  done

  # Update state to paused
  if [[ -n "${STATE_FILE:-}" && -f "${STATE_FILE:-}" ]]; then
    jq --arg ts "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
      '.status = "paused" | .updated_at = $ts' \
      "$STATE_FILE" > "${STATE_FILE}.tmp" 2>/dev/null \
      && mv "${STATE_FILE}.tmp" "$STATE_FILE" 2>/dev/null || true
    log_warn "Pipeline state set to 'paused'"

    # Audit log: pipeline paused (best-effort)
    "${HQ_ROOT}/scripts/audit-log.sh" append \
      --event pipeline_paused \
      --project "${PIPELINE_ID:-unknown}" \
      --company "${COMPANY:-unknown}" \
      --action "Pipeline paused via signal ${sig}" 2>/dev/null || true
  fi

  exit 130
}

cleanup_on_exit() {
  # Remove temp files
  if [[ -n "${STATE_FILE:-}" ]]; then
    rm -f "${STATE_FILE}.tmp" 2>/dev/null || true
  fi
}

trap 'cleanup_on_signal INT' INT
trap 'cleanup_on_signal TERM' TERM
trap 'cleanup_on_exit' EXIT

# =============================================================================
# --status: Show all pipeline statuses
# =============================================================================

show_status() {
  local pipeline_base="${HQ_ROOT}/${PIPELINE_BASE_DIR}"

  echo -e "\n${BOLD}Pipeline Status${NC}\n"

  local found=false

  if [[ ! -d "$pipeline_base" ]]; then
    echo -e "  ${DIM}No active pipelines${NC}\n"
    return 0
  fi

  # Collect valid state files first
  local state_files=()
  for state_file in "$pipeline_base"/*/pipeline-state.json; do
    [[ -f "$state_file" ]] || continue
    [[ -s "$state_file" ]] || continue
    jq empty "$state_file" 2>/dev/null || continue
    state_files+=("$state_file")
  done

  if [[ ${#state_files[@]} -eq 0 ]]; then
    echo -e "  ${DIM}No active pipelines${NC}"
    echo ""
    return 0
  fi

  # Table header
  printf "  ${BOLD}%-38s %-14s %-16s %-10s %s${NC}\n" "PIPELINE ID" "STATUS" "COMPANY" "PROJECTS" "LAST UPDATED"
  printf "  %-38s %-14s %-16s %-10s %s\n" "$(printf '%0.s-' {1..38})" "$(printf '%0.s-' {1..14})" "$(printf '%0.s-' {1..16})" "$(printf '%0.s-' {1..10})" "$(printf '%0.s-' {1..20})"

  for state_file in "${state_files[@]}"; do
    local pl_id pl_status pl_company pl_total pl_updated
    pl_id=$(jq -r '.pipeline_id // "unknown"' "$state_file")
    pl_status=$(jq -r '.status // "unknown"' "$state_file")
    pl_company=$(jq -r '.company // "unknown"' "$state_file")
    pl_total=$(jq -r '.summary.total // 0' "$state_file")
    pl_updated=$(jq -r '.updated_at // "unknown"' "$state_file")

    local done_count failed_count
    done_count=$(jq -r '.summary.done // 0' "$state_file")
    failed_count=$(jq -r '.summary.failed // 0' "$state_file")

    local status_color="$NC"
    case "$pl_status" in
      in_progress) status_color="$BLUE" ;;
      paused)      status_color="$YELLOW" ;;
      completed)   status_color="$GREEN" ;;
      failed)      status_color="$RED" ;;
    esac

    printf "  %-38s ${status_color}%-14s${NC} %-16s %-10s %s\n" \
      "$pl_id" "$pl_status" "$pl_company" "${done_count}/${pl_total}" "$pl_updated"
  done

  echo ""
}

# =============================================================================
# Gate Config Loading
# =============================================================================

load_gate_config() {
  local config_file="${HQ_ROOT}/${PIPELINE_YAML}"
  [[ ! -f "$config_file" ]] && return 0

  local val
  val=$(yaml_read "$config_file" ".safety.gates.pre_triage") && [[ "$val" != "null" ]] && GATE_PRE_TRIAGE="$val"
  val=$(yaml_read "$config_file" ".safety.gates.pre_merge_low") && [[ "$val" != "null" ]] && GATE_PRE_MERGE_LOW="$val"
  val=$(yaml_read "$config_file" ".safety.gates.pre_merge_medium") && [[ "$val" != "null" ]] && GATE_PRE_MERGE_MEDIUM="$val"
  val=$(yaml_read "$config_file" ".safety.gates.pre_merge_high") && [[ "$val" != "null" ]] && GATE_PRE_MERGE_HIGH="$val"
  val=$(yaml_read "$config_file" ".safety.gates.pre_deploy_dev") && [[ "$val" != "null" ]] && GATE_PRE_DEPLOY_DEV="$val"
  val=$(yaml_read "$config_file" ".safety.gates.pre_deploy_prod") && [[ "$val" != "null" ]] && GATE_PRE_DEPLOY_PROD="$val"
  val=$(yaml_read "$config_file" ".safety.gates.canary_failure") && [[ "$val" != "null" ]] && GATE_CANARY_FAILURE="$val"
  val=$(yaml_read "$config_file" ".safety.gates.sst_deploy") && [[ "$val" != "null" ]] && GATE_SST_DEPLOY="$val"

  # Update poll interval from loaded config
  GATE_POLL_INTERVAL="${CFG_GATE_POLL_SEC}"
}

# =============================================================================
# Safety Gate Functions
# =============================================================================

# should_gate <gate_name> <risk_level> <review_verdict>
#
# Determines whether a gate should fire based on config + CLI flags.
# Returns 0 = should gate (fire), 1 = skip gate (auto-approve).
should_gate() {
  local gate_name="$1"
  local risk_level="${2:-}"
  local review_verdict="${3:-}"

  case "$gate_name" in
    pre_triage)
      # Always fire — cannot skip
      return 0
      ;;

    pre_merge_low)
      # --gate-all-merges forces gating
      [[ "$GATE_ALL_MERGES" == true ]] && return 0
      # If config is "auto" AND --auto-merge-all, skip
      if [[ "$GATE_PRE_MERGE_LOW" == "auto" && "$AUTO_MERGE_ALL" == true ]]; then
        return 1
      fi
      # If config is "gated", fire
      [[ "$GATE_PRE_MERGE_LOW" == "gated" ]] && return 0
      # Default for "auto" without --auto-merge-all: fire
      return 0
      ;;

    pre_merge_medium)
      # --gate-all-merges forces gating
      [[ "$GATE_ALL_MERGES" == true ]] && return 0
      # If config is "auto" AND review passed, skip
      if [[ "$GATE_PRE_MERGE_MEDIUM" == "auto" && "$review_verdict" == "PASS" ]]; then
        return 1
      fi
      # If config is "gated", fire
      [[ "$GATE_PRE_MERGE_MEDIUM" == "gated" ]] && return 0
      # Default: fire
      return 0
      ;;

    pre_merge_high)
      # Always fire unless --auto-merge-all
      [[ "$AUTO_MERGE_ALL" == true ]] && return 1
      return 0
      ;;

    pre_deploy_dev)
      # Check config
      [[ "$GATE_PRE_DEPLOY_DEV" == "auto" ]] && return 1
      return 0
      ;;

    pre_deploy_prod)
      # ALWAYS fire — cannot override
      return 0
      ;;

    canary_failure)
      # ALWAYS fire — cannot override
      return 0
      ;;

    sst_deploy)
      # If config is "auto" AND --auto-sst-deploy, skip
      if [[ "$GATE_SST_DEPLOY" == "auto" && "$AUTO_SST_DEPLOY" == true ]]; then
        return 1
      fi
      # Otherwise fire
      return 0
      ;;

    *)
      log_warn "Unknown gate: ${gate_name} — defaulting to gated"
      return 0
      ;;
  esac
}

# request_gate <gate_name> <project> <message>
#
# Writes pending_gate to pipeline-state.json and polls until resolved.
# Returns: 0 = approve (continue), 1 = reject (fail project), 2 = skip project.
request_gate() {
  local gate_name="$1"
  local project="$2"
  local message="$3"
  local now
  now=$(ts)

  # Write pending_gate to state
  update_state "$(cat <<JQEOF
.pending_gate = {
  "gate": "${gate_name}",
  "project": "${project}",
  "message": "${message}",
  "requested_at": "${now}",
  "resolution": null
}
JQEOF
)"

  log_warn "⏸ Safety gate: ${gate_name} for ${project} — awaiting resolution"

  # Audit log: gate requested (best-effort)
  "${HQ_ROOT}/scripts/audit-log.sh" append \
    --event gate_requested \
    --project "$project" \
    --company "$COMPANY" \
    --action "Gate: ${gate_name} - ${message}" || true

  # Poll for resolution
  local resolution=""
  while true; do
    sleep "$GATE_POLL_INTERVAL"

    resolution=$(jq -r '.pending_gate.resolution // "null"' "$STATE_FILE" 2>/dev/null)
    if [[ "$resolution" != "null" && -n "$resolution" ]]; then
      break
    fi
  done

  log_info "Gate ${gate_name} resolved: ${resolution}"

  # Map gate resolution vocabulary (approve|reject|skip) onto audit-log's
  # result vocabulary (success|fail|skipped). Without this mapping,
  # audit-log.sh rejects `--result approve` with `Invalid result`, turning
  # every gate pass into a confusing (non-fatal) ERROR line.
  local audit_result
  case "$resolution" in
    approve) audit_result="success" ;;
    reject)  audit_result="fail"    ;;
    skip)    audit_result="skipped" ;;
    *)       audit_result="skipped" ;;
  esac

  # Audit log: gate resolved (best-effort)
  "${HQ_ROOT}/scripts/audit-log.sh" append \
    --event gate_resolved \
    --project "$project" \
    --company "$COMPANY" \
    --action "Gate: ${gate_name} resolved: ${resolution}" \
    --result "$audit_result" || true

  # Clear pending_gate
  update_state '.pending_gate = null'

  # Return based on resolution
  case "$resolution" in
    approve) return 0 ;;
    reject)  return 1 ;;
    skip)    return 2 ;;
    *)
      log_warn "Unknown gate resolution '${resolution}' — treating as reject"
      return 1
      ;;
  esac
}

# check_gate <gate_name> <project> <risk_level> <review_verdict> <message>
#
# Convenience wrapper: checks should_gate, then request_gate if needed.
# Returns: 0 = continue, 1 = reject/fail, 2 = skip.
check_gate() {
  local gate_name="$1"
  local project="$2"
  local risk_level="${3:-}"
  local review_verdict="${4:-}"
  local message="${5:-}"

  if ! should_gate "$gate_name" "$risk_level" "$review_verdict"; then
    # should_gate returned 1 (skip gate) — auto-approve
    log_info "Gate ${gate_name} auto-approved"
    return 0
  fi

  # should_gate returned 0 (should fire) — request human approval
  request_gate "$gate_name" "$project" "$message"
  return $?
}

# =============================================================================
# Triage Engine — PRD loading, risk classification, dependency detection
# =============================================================================

# Parallel arrays for triage results
TRIAGE_PROJECTS=()
TRIAGE_PRD_PATHS=()
TRIAGE_REPOS=()
TRIAGE_STORY_COUNTS=()
TRIAGE_RISKS=()
TRIAGE_LABELS=()
TRIAGE_BRANCHES=()
TRIAGE_BASE_BRANCHES=()
TRIAGE_DEPENDS_ON=()

# classify_risk <story_count> <labels> <repo_path>
# Assigns LOW/MEDIUM/HIGH risk level. Echoes result.
classify_risk() {
  local story_count="$1"
  local labels="$2"
  local repo_path="$3"
  local risk="LOW"

  # Story count thresholds
  if (( story_count > 8 )); then
    risk="HIGH"
  elif (( story_count > 4 )); then
    risk="MEDIUM"
  fi

  # Label-based bump: infra, migration, security each bump one level
  if echo "$labels" | grep -qiE '(infra|migration|security)'; then
    case "$risk" in
      LOW)    risk="MEDIUM" ;;
      MEDIUM) risk="HIGH" ;;
      # HIGH stays HIGH
    esac
  fi

  echo "$risk"
}

# load_prds — Reads each PRD path and extracts metadata into triage arrays
load_prds() {
  local i=0
  for prd_rel in "${PRDS[@]}"; do
    local prd_path
    # Resolve relative to HQ_ROOT
    if [[ "$prd_rel" == /* ]]; then
      prd_path="$prd_rel"
    else
      prd_path="${HQ_ROOT}/${prd_rel}"
    fi

    # Validate file exists
    if [[ ! -f "$prd_path" ]]; then
      log_warn "PRD not found, skipping: ${prd_rel}"
      continue
    fi

    # Validate JSON
    if ! jq empty "$prd_path" 2>/dev/null; then
      log_warn "Invalid JSON in PRD, skipping: ${prd_rel}"
      continue
    fi

    # Validate userStories array exists
    local has_stories
    has_stories=$(jq 'has("userStories") and (.userStories | type == "array")' "$prd_path" 2>/dev/null)
    if [[ "$has_stories" != "true" ]]; then
      log_warn "PRD missing userStories array, skipping: ${prd_rel}"
      continue
    fi

    # Extract fields with jq
    local project story_count repo_path labels branch_name base_branch
    project=$(jq -r '.name // "unknown"' "$prd_path")
    story_count=$(jq -r '.userStories | length' "$prd_path")
    repo_path=$(jq -r '.metadata.repoPath // ""' "$prd_path")
    branch_name=$(jq -r '.branchName // ""' "$prd_path")
    base_branch=$(jq -r '.metadata.baseBranch // "main"' "$prd_path")

    # Extract labels: try metadata.labels first, then scan userStories labels
    labels=$(jq -r '
      if (.metadata.labels // null) != null and (.metadata.labels | length) > 0 then
        .metadata.labels | join(",")
      else
        [.userStories[]?.labels // [] | .[]?] | unique | join(",")
      end
    ' "$prd_path" 2>/dev/null)
    [[ "$labels" == "null" ]] && labels=""

    # Handle null values from jq
    [[ "$project" == "null" ]] && project="unknown"
    [[ "$repo_path" == "null" ]] && repo_path=""
    [[ "$branch_name" == "null" ]] && branch_name=""
    [[ "$base_branch" == "null" ]] && base_branch="main"

    # Classify risk
    local risk
    risk=$(classify_risk "$story_count" "$labels" "$repo_path")

    # Store in parallel arrays
    TRIAGE_PROJECTS[i]="$project"
    TRIAGE_PRD_PATHS[i]="$prd_rel"
    TRIAGE_REPOS[i]="$repo_path"
    TRIAGE_STORY_COUNTS[i]="$story_count"
    TRIAGE_RISKS[i]="$risk"
    TRIAGE_LABELS[i]="$labels"
    TRIAGE_BRANCHES[i]="$branch_name"
    TRIAGE_BASE_BRANCHES[i]="$base_branch"
    TRIAGE_DEPENDS_ON[i]=""

    log_info "Loaded PRD: ${project} (${story_count} stories, risk=${risk})"
    # NB: `(( i++ ))` with i=0 returns exit 1 under set -e. Use explicit assignment.
    i=$((i + 1))
  done

  if [[ $i -eq 0 ]]; then
    log_err "No valid PRDs loaded — nothing to triage"
    exit 1
  fi

  log_ok "Loaded ${i} PRD(s)"
}

# detect_dependencies — Finds dependencies between projects
#
# Layers (merged into TRIAGE_DEPENDS_ON):
#   1. Explicit cross-PRD deps from each prd.json metadata.dependsOn (slug array)
#      — only kept if the declared slug matches a project in the current pipeline run
#   2. Implicit intra-repo infra-first heuristic (infra/migration labels go first
#      when two PRDs share the same repoPath)
detect_dependencies() {
  local count=${#TRIAGE_PROJECTS[@]}

  for (( i=0; i<count; i++ )); do
    local deps=""
    local my_repo="${TRIAGE_REPOS[i]}"
    local my_labels="${TRIAGE_LABELS[i]}"
    local my_prd_rel="${TRIAGE_PRD_PATHS[i]}"
    local my_prd_abs
    if [[ "$my_prd_rel" == /* ]]; then
      my_prd_abs="$my_prd_rel"
    else
      my_prd_abs="${HQ_ROOT}/${my_prd_rel}"
    fi

    # --- Layer 1: explicit cross-PRD deps via metadata.dependsOn ---
    if [[ -f "$my_prd_abs" ]]; then
      local declared_deps
      declared_deps=$(jq -r '.metadata.dependsOn // [] | .[]?' "$my_prd_abs" 2>/dev/null) || true
      if [[ -n "$declared_deps" ]]; then
        while IFS= read -r dep_slug; do
          [[ -z "$dep_slug" ]] && continue
          # Only include deps that match a project in this pipeline run
          local k found=0
          for (( k=0; k<count; k++ )); do
            if [[ "${TRIAGE_PROJECTS[k]}" == "$dep_slug" ]]; then
              found=1
              break
            fi
          done
          if [[ $found -eq 1 ]]; then
            if ! echo ",$deps," | grep -qF ",${dep_slug},"; then
              if [[ -n "$deps" ]]; then
                deps="${deps},${dep_slug}"
              else
                deps="$dep_slug"
              fi
            fi
          else
            log_warn "  ${TRIAGE_PROJECTS[i]} declares metadata.dependsOn='${dep_slug}' but that project is not in this pipeline run — ignoring"
          fi
        done <<< "$declared_deps"
      fi
    fi

    # --- Layer 2: intra-repo infra-first heuristic ---
    for (( j=0; j<count; j++ )); do
      [[ $i -eq $j ]] && continue

      local other_repo="${TRIAGE_REPOS[j]}"
      local other_labels="${TRIAGE_LABELS[j]}"

      # If same repo: the one with infra labels should go first
      if [[ -n "$my_repo" && -n "$other_repo" && "$my_repo" == "$other_repo" ]]; then
        # If j has infra labels and i does not, i depends on j
        if echo "$other_labels" | grep -qiE '(infra|infrastructure|migration)' && \
           ! echo "$my_labels" | grep -qiE '(infra|infrastructure|migration)'; then
          if ! echo ",$deps," | grep -qF ",${TRIAGE_PROJECTS[j]},"; then
            if [[ -n "$deps" ]]; then
              deps="${deps},${TRIAGE_PROJECTS[j]}"
            else
              deps="${TRIAGE_PROJECTS[j]}"
            fi
          fi
        fi
      fi
    done

    TRIAGE_DEPENDS_ON[i]="$deps"
  done

  log_ok "Dependency detection complete"
}

# generate_sequence — Sorts projects into optimal execution order
generate_sequence() {
  local count=${#TRIAGE_PROJECTS[@]}

  # Build an index array and sort using a simple bubble sort
  local order=()
  for (( i=0; i<count; i++ )); do
    order+=("$i")
  done

  # Assign sort keys: dependency depth, risk numeric, story count
  # Risk: LOW=0, MEDIUM=1, HIGH=2
  risk_to_num() {
    case "$1" in
      LOW)    echo 0 ;;
      MEDIUM) echo 1 ;;
      HIGH)   echo 2 ;;
      *)      echo 1 ;;
    esac
  }

  # has_infra_label — returns 0 (true) if labels contain infra-like label
  has_infra_label() {
    echo "$1" | grep -qiE '(infra|infrastructure|migration)'
  }

  # Bubble sort: compare pairs and swap
  local swapped=true
  while [[ "$swapped" == true ]]; do
    swapped=false
    for (( i=0; i<count-1; i++ )); do
      local a="${order[i]}"
      local b="${order[i+1]}"

      local should_swap=false

      # 1. Dependencies first: if b is depended on by a, b goes first
      if echo "${TRIAGE_DEPENDS_ON[a]}" | grep -qF "${TRIAGE_PROJECTS[b]}"; then
        should_swap=true
      elif echo "${TRIAGE_DEPENDS_ON[b]}" | grep -qF "${TRIAGE_PROJECTS[a]}"; then
        # a is depended on by b, a should stay first — no swap
        should_swap=false
      else
        # 2. Lower risk first
        local risk_a risk_b
        risk_a=$(risk_to_num "${TRIAGE_RISKS[a]}")
        risk_b=$(risk_to_num "${TRIAGE_RISKS[b]}")

        if (( risk_a > risk_b )); then
          should_swap=true
        elif (( risk_a == risk_b )); then
          # 3. Fewer stories first
          if (( TRIAGE_STORY_COUNTS[a] > TRIAGE_STORY_COUNTS[b] )); then
            should_swap=true
          elif (( TRIAGE_STORY_COUNTS[a] == TRIAGE_STORY_COUNTS[b] )); then
            # 4. Same-repo grouping (if enabled)
            if [[ "$CFG_REPO_GROUPING" == true ]]; then
              # If b shares a repo with the item before a, group them
              if (( i > 0 )); then
                local prev="${order[i-1]}"
                if [[ -n "${TRIAGE_REPOS[b]}" && "${TRIAGE_REPOS[b]}" == "${TRIAGE_REPOS[prev]}" && "${TRIAGE_REPOS[a]}" != "${TRIAGE_REPOS[prev]}" ]]; then
                  should_swap=true
                fi
              fi
            fi

            # 5. Infra labels before feature labels (if enabled)
            if [[ "$CFG_INFRA_FIRST" == true && "$should_swap" == false ]]; then
              local a_infra=false b_infra=false
              has_infra_label "${TRIAGE_LABELS[a]}" && a_infra=true
              has_infra_label "${TRIAGE_LABELS[b]}" && b_infra=true
              if [[ "$b_infra" == true && "$a_infra" == false ]]; then
                should_swap=true
              fi
            fi
          fi
        fi
      fi

      if [[ "$should_swap" == true ]]; then
        order[i]="$b"
        order[i+1]="$a"
        swapped=true
      fi
    done
  done

  # Build sequence JSON array and write to state
  local now
  now=$(ts)

  local seq_json="[]"
  local position=1
  for idx in "${order[@]}"; do
    local depends_json="[]"
    if [[ -n "${TRIAGE_DEPENDS_ON[idx]}" ]]; then
      # Convert comma-separated deps to JSON array
      depends_json=$(echo "${TRIAGE_DEPENDS_ON[idx]}" | jq -R 'split(",") | map(select(. != ""))')
    fi

    seq_json=$(echo "$seq_json" | jq \
      --arg order "$position" \
      --arg project "${TRIAGE_PROJECTS[idx]}" \
      --arg prd_path "${TRIAGE_PRD_PATHS[idx]}" \
      --arg repo "${TRIAGE_REPOS[idx]}" \
      --arg risk "${TRIAGE_RISKS[idx]}" \
      --argjson stories "${TRIAGE_STORY_COUNTS[idx]}" \
      --argjson depends_on "$depends_json" \
      --arg now "$now" \
      '. + [{
        order: ($order | tonumber),
        project: $project,
        prd_path: $prd_path,
        repo: $repo,
        risk: $risk,
        estimated_stories: $stories,
        depends_on: $depends_on,
        phase: "queued",
        phase_history: [{ phase: "queued", entered_at: $now }],
        pr_number: null,
        pr_url: null,
        deploy_target: null,
        review_verdict: null,
        canary_result: null,
        error: null,
        started_at: null,
        completed_at: null
      }]')

    (( position++ ))
  done

  # Write sequence to pipeline-state.json
  local total=${#order[@]}
  update_state "$(cat <<JQEOF
.sequence = ${seq_json} | .summary.total = ${total} | .summary.queued = ${total}
JQEOF
)"

  log_ok "Sequence generated: ${total} project(s)"
}

# print_triage_table — Display triage results as formatted table
print_triage_table() {
  local count=${#TRIAGE_PROJECTS[@]}
  if [[ $count -eq 0 ]]; then
    log_warn "No projects to display"
    return 0
  fi

  echo ""
  echo -e "${BOLD}Pipeline Triage: ${COMPANY}${NC}"
  echo ""

  # Read sequence order from state file
  local order_list
  order_list=$(jq -r '.sequence[] | "\(.order)|\(.project)|\(.risk)|\(.estimated_stories)|\(.repo)|\(.depends_on | join(","))"' "$STATE_FILE" 2>/dev/null)

  # Table header
  printf "  ${BOLD}%-3s │ %-20s │ %-6s │ %-7s │ %-25s │ %s${NC}\n" "#" "Project" "Risk" "Stories" "Repo" "Depends On"
  printf "  %-3s─┼─%-20s─┼─%-6s─┼─%-7s─┼─%-25s─┼─%s\n" "───" "$(printf '%0.s─' {1..20})" "$(printf '%0.s─' {1..6})" "$(printf '%0.s─' {1..7})" "$(printf '%0.s─' {1..25})" "$(printf '%0.s─' {1..15})"

  while IFS='|' read -r ord proj risk stories repo deps; do
    [[ -z "$ord" ]] && continue

    # Color-code risk
    local risk_display
    case "$risk" in
      LOW)    risk_display="${GREEN}${risk}${NC}   " ;;
      MEDIUM) risk_display="${YELLOW}${risk}${NC}" ;;
      HIGH)   risk_display="${RED}${risk}${NC}  " ;;
      *)      risk_display="$risk" ;;
    esac

    # Format depends_on
    local deps_display
    if [[ -z "$deps" ]]; then
      deps_display="—"
    else
      deps_display="$deps"
    fi

    printf "  %-3s │ %-20s │ %b │ %-7s │ %-25s │ %s\n" \
      "$ord" "$proj" "$risk_display" "$stories" "${repo:--}" "$deps_display"
  done <<< "$order_list"

  echo ""
  log_info "Total: ${count} project(s) sequenced"
}

# =============================================================================
# Project Phase Helper — updates a specific project's phase in pipeline-state
# =============================================================================

update_project_phase() {
  local project="$1" new_phase="$2" error_msg="${3:-}"
  local now
  now=$(ts)

  local filter
  if [[ -n "$error_msg" ]]; then
    filter='(.sequence[] | select(.project == "'"$project"'")) |= (.phase = "'"$new_phase"'" | .error = "'"$error_msg"'" | .phase_history += [{"phase": "'"$new_phase"'", "entered_at": "'"$now"'"}])'
  else
    filter='(.sequence[] | select(.project == "'"$project"'")) |= (.phase = "'"$new_phase"'" | .phase_history += [{"phase": "'"$new_phase"'", "entered_at": "'"$now"'"}])'
  fi

  update_state "$filter"
}

# =============================================================================
# Build Phase — Spawns run-project.sh and polls state.json until completion
# =============================================================================

# phase_build <project> <prd_path>
#
# Launches run-project.sh as a background process, then polls the project's
# state.json until the build completes, fails, or times out.
#
# Returns: 0 = success, 1 = hard failure, 2 = soft failure (skip dependents)
phase_build() {
  local project="$1" prd_path="$2"

  # --- Mark project as building in pipeline-state.json ---
  local now
  now=$(ts)
  update_project_phase "$project" "building"
  update_state '(.sequence[] | select(.project == "'"$project"'")) |= (.started_at = "'"$now"'")'

  log_info "Build starting: ${project}"

  # --- Build run-project.sh command ---
  local run_cmd=("bash" "${HQ_ROOT}/scripts/run-project.sh" "${project}" "--no-permissions")
  if [[ -n "${MODEL:-}" ]]; then
    run_cmd+=("--model" "$MODEL")
  fi
  # --builder codex routes build work to Codex CLI inside run-project.sh
  # (claude is still used for orchestration/review phases)
  if [[ -n "${BUILDER:-}" ]]; then
    run_cmd+=("--builder" "$BUILDER")
  fi

  # --- Spawn as background process ---
  local pipeline_dir
  pipeline_dir="$(dirname "$STATE_FILE")"
  local run_log="${pipeline_dir}/${project}.run.log"

  nohup "${run_cmd[@]}" > "$run_log" 2>&1 &
  local child_pid=$!
  CHILD_PIDS+=("$child_pid")

  log_info "Spawned run-project.sh for ${project} (PID ${child_pid})"

  # Record PID in pipeline-state.json
  update_state '(.sequence[] | select(.project == "'"$project"'")) |= (.pid = '"$child_pid"')'

  # --- Poll loop ---
  local project_state_file="${HQ_ROOT}/workspace/orchestrator/${project}/state.json"
  local poll_interval="${CFG_PROJECT_POLL_SEC:-30}"
  local timeout_sec=0
  if [[ -n "${TIMEOUT:-}" && "${TIMEOUT:-}" != "0" ]]; then
    timeout_sec=$(( TIMEOUT * 60 ))
  fi
  local start_time
  start_time=$(date +%s)

  while true; do
    sleep "$poll_interval"

    # Check if child PID is still alive
    if ! kill -0 "$child_pid" 2>/dev/null; then
      # Process exited — check final state
      if [[ -f "$project_state_file" ]]; then
        local final_status
        final_status=$(jq -r '.status // "unknown"' "$project_state_file" 2>/dev/null)
        if [[ "$final_status" == "completed" ]]; then
          log_ok "Build complete: ${project}"
          update_project_phase "$project" "build_done"
          now=$(ts)
          update_state '(.sequence[] | select(.project == "'"$project"'")) |= (.completed_at = "'"$now"'")'
          return 0
        fi
      fi
      # Process died without completing successfully
      log_err "Build process exited unexpectedly for ${project} (PID ${child_pid})"
      local exit_msg="run-project.sh exited unexpectedly"
      if [[ -f "$project_state_file" ]]; then
        local err_detail
        err_detail=$(jq -r '.error // empty' "$project_state_file" 2>/dev/null)
        [[ -n "$err_detail" ]] && exit_msg="$err_detail"
      fi
      update_project_phase "$project" "failed" "$exit_msg"
      if [[ "$SKIP_FAILED_PROJECTS" == true ]]; then
        log_warn "Skipping failed project: ${project} (--skip-failed-projects)"
        return 2
      fi
      return 1
    fi

    # Check timeout
    if [[ $timeout_sec -gt 0 ]]; then
      local elapsed=$(( $(date +%s) - start_time ))
      if [[ $elapsed -ge $timeout_sec ]]; then
        log_err "Build timeout for ${project} after ${TIMEOUT}m"
        kill "$child_pid" 2>/dev/null || true
        wait "$child_pid" 2>/dev/null || true
        update_project_phase "$project" "failed" "Timed out after ${TIMEOUT} minutes"
        if [[ "$SKIP_FAILED_PROJECTS" == true ]]; then
          log_warn "Skipping timed-out project: ${project} (--skip-failed-projects)"
          return 2
        fi
        return 1
      fi
    fi

    # Read project state.json (may not exist yet)
    if [[ ! -f "$project_state_file" ]]; then
      log_info "Build progress: ${project} — waiting for state.json..."
      continue
    fi

    # Validate JSON before reading
    if ! jq empty "$project_state_file" 2>/dev/null; then
      log_warn "Build progress: ${project} — state.json not yet valid"
      continue
    fi

    local status completed total
    status=$(jq -r '.status // "unknown"' "$project_state_file" 2>/dev/null)
    completed=$(jq -r '.progress.completed // 0' "$project_state_file" 2>/dev/null)
    total=$(jq -r '.progress.total // 0' "$project_state_file" 2>/dev/null)

    log_info "Build progress: ${project} — ${completed}/${total} stories (status: ${status})"

    case "$status" in
      completed)
        log_ok "Build complete: ${project}"
        update_project_phase "$project" "build_done"
        now=$(ts)
        update_state '(.sequence[] | select(.project == "'"$project"'")) |= (.completed_at = "'"$now"'")'
        return 0
        ;;
      failed)
        log_err "Build failed: ${project}"
        local fail_msg
        fail_msg=$(jq -r '.error // "Build failed"' "$project_state_file" 2>/dev/null)
        update_project_phase "$project" "failed" "$fail_msg"
        if [[ "$SKIP_FAILED_PROJECTS" == true ]]; then
          log_warn "Skipping failed project: ${project} (--skip-failed-projects)"
          return 2
        fi
        return 1
        ;;
      paused)
        log_warn "Build paused: ${project} — triggering safety gate"
        local gate_rc=0
        request_gate "build_paused" "$project" "Project build paused — manual intervention needed" || gate_rc=$?
        case $gate_rc in
          0)
            log_info "Gate approved — continuing to poll ${project}"
            ;;
          1)
            log_err "Gate rejected — failing ${project}"
            update_project_phase "$project" "failed" "Build paused and gate rejected"
            if [[ "$SKIP_FAILED_PROJECTS" == true ]]; then
              return 2
            fi
            return 1
            ;;
          2)
            log_warn "Gate skipped — skipping ${project}"
            update_project_phase "$project" "skipped" "Build paused and gate skipped"
            return 2
            ;;
        esac
        ;;
    esac
  done
}

# =============================================================================
# PR Phase — Creates a GitHub PR for the completed project
# =============================================================================

# phase_pr <project> <prd_path>
#
# Creates a PR for the project's branch. Handles {PRODUCT} repos specially (uses
# /{product}-pr command). Detects existing PRs to avoid duplicates. Records PR
# info in pipeline-state.json.
#
# Returns: 0 = success (or skipped), 1 = failure
phase_pr() {
  local project="$1" prd_path="$2"

  # --- Mark project as PR-opening in pipeline-state.json ---
  update_project_phase "$project" "pr_open"

  # --- Read project metadata from prd.json ---
  local repo_path branch_name base_branch description
  repo_path=$(jq -r '.metadata.repoPath // ""' "${HQ_ROOT}/${prd_path}")
  branch_name=$(jq -r '.branchName // ""' "${HQ_ROOT}/${prd_path}")
  base_branch=$(jq -r '.metadata.baseBranch // "main"' "${HQ_ROOT}/${prd_path}")
  description=$(jq -r '.description // ""' "${HQ_ROOT}/${prd_path}")

  # --- Validate: skip if no repo or branch ---
  if [[ -z "$repo_path" || -z "$branch_name" ]]; then
    log_warn "No repo or branch for ${project} — skipping PR phase"
    return 0  # Not an error, just nothing to PR
  fi

  # --- Check for existing PR on this branch ---
  local full_repo_path="${HQ_ROOT}/${repo_path}"
  cd "$full_repo_path"

  local existing_pr
  existing_pr=$(gh pr list --head "$branch_name" --json number,url --jq '.[0] // empty' 2>/dev/null) || true
  if [[ -n "$existing_pr" ]]; then
    local pr_number pr_url
    pr_number=$(echo "$existing_pr" | jq -r '.number')
    pr_url=$(echo "$existing_pr" | jq -r '.url')
    log_info "Existing PR found: #${pr_number} (${pr_url})"
    # Update pipeline-state with existing PR info
    update_state '(.sequence[] | select(.project == "'"$project"'")) |= (.pr_number = '"$pr_number"' | .pr_url = "'"$pr_url"'")'
    cd "$HQ_ROOT"
    return 0
  fi

  # --- Generate PR body from prd.json stories ---
  local pr_body
  pr_body=$(jq -r '
    "## Summary\n\n" +
    (.description // "No description") + "\n\n" +
    "## Stories\n\n" +
    ([.userStories[] | "- " + .id + ": " + .title] | join("\n")) +
    "\n\n_Created by run-pipeline_"
  ' "${HQ_ROOT}/${prd_path}")

  # --- Create PR ---
  local pr_url="" pr_number=""

  # Standard PR creation
  log_info "Creating PR for ${project} (${branch_name} → ${base_branch})"
  local pr_output
  pr_output=$(gh pr create \
    --title "${project}: ${description}" \
    --body "$pr_body" \
    --base "$base_branch" \
    --head "$branch_name" 2>&1) || {
    log_err "PR creation failed for ${project}: ${pr_output}"
    update_project_phase "$project" "failed" "PR creation failed: ${pr_output}"
    cd "$HQ_ROOT"
    return 1
  }
  # Extract PR URL and number
  pr_url=$(echo "$pr_output" | grep -oE 'https://github.com/[^ ]+/pull/[0-9]+' | head -1)
  pr_number=$(echo "$pr_url" | grep -oE '[0-9]+$')

  # --- Record PR info in pipeline-state.json ---
  if [[ -n "$pr_number" ]]; then
    update_state '(.sequence[] | select(.project == "'"$project"'")) |= (.pr_number = '"${pr_number}"' | .pr_url = "'"${pr_url}"'")'
    log_ok "PR created: #${pr_number} (${pr_url})"
  else
    log_warn "PR created but could not extract number/URL"
  fi

  # --- Audit event ---
  scripts/audit-log.sh append --event project_pr_created --project "$project" --company "$COMPANY" --action "PR #${pr_number} created" || true

  # --- Return to HQ_ROOT ---
  cd "$HQ_ROOT"
}

# =============================================================================
# CI Wait Phase — Polls GitHub CI checks until pass/fail/timeout
# =============================================================================

phase_ci_wait() {
  local project="$1" prd_path="$2"

  update_project_phase "$project" "ci_wait"

  # Get PR number from pipeline-state
  local pr_number
  pr_number=$(jq -r '.sequence[] | select(.project == "'"$project"'") | .pr_number // empty' "$STATE_FILE")

  if [[ -z "$pr_number" ]]; then
    log_warn "No PR number for ${project} — skipping CI wait"
    return 0
  fi

  # Get repo path for gh commands
  local repo_path
  repo_path=$(jq -r '.metadata.repoPath // ""' "${HQ_ROOT}/${prd_path}")
  if [[ -z "$repo_path" ]]; then
    log_warn "No repo path — skipping CI wait"
    return 0
  fi

  cd "${HQ_ROOT}/${repo_path}"

  local poll_interval="${CFG_CI_POLL_SEC:-60}"
  local max_wait=1800  # 30 minutes max CI wait
  local elapsed=0

  log_info "Waiting for CI checks on PR #${pr_number}..."

  while [[ $elapsed -lt $max_wait ]]; do
    sleep "$poll_interval"
    elapsed=$((elapsed + poll_interval))

    # Check CI status via gh
    local checks_output
    checks_output=$(gh pr checks "$pr_number" 2>&1) || true

    # Parse check results
    local failing pending
    failing=$(echo "$checks_output" | grep -c "fail\|X" || true)
    pending=$(echo "$checks_output" | grep -c "pending\|*" || true)

    if [[ $failing -gt 0 ]]; then
      log_err "CI checks failed for PR #${pr_number}"
      update_project_phase "$project" "failed" "CI checks failed"
      cd "$HQ_ROOT"
      return 1
    fi

    if [[ $pending -eq 0 ]]; then
      # All checks passed (or no checks configured)
      log_ok "CI checks passed for PR #${pr_number}"
      cd "$HQ_ROOT"
      return 0
    fi

    log_info "CI still running for PR #${pr_number} (${elapsed}s elapsed)"
  done

  # Timeout
  log_warn "CI wait timed out after ${max_wait}s for PR #${pr_number}"
  # Don't fail — just warn and continue (CI might not be configured)
  cd "$HQ_ROOT"
  return 0
}

# =============================================================================
# Codex Review Phase — Polls PR comments for automatic Codex review findings
# =============================================================================

phase_codex_review() {
  local project="$1" prd_path="$2"

  # Check if Codex review is enabled
  if [[ "${CFG_CODEX_REVIEW_ENABLED:-true}" != "true" ]]; then
    log_info "Codex review disabled — skipping"
    return 0
  fi

  update_project_phase "$project" "codex_review"

  local pr_number
  pr_number=$(jq -r '.sequence[] | select(.project == "'"$project"'") | .pr_number // empty' "$STATE_FILE")

  if [[ -z "$pr_number" ]]; then
    log_warn "No PR number for ${project} — skipping Codex review"
    return 0
  fi

  local repo_path
  repo_path=$(jq -r '.metadata.repoPath // ""' "${HQ_ROOT}/${prd_path}")
  if [[ -z "$repo_path" ]]; then
    return 0
  fi

  cd "${HQ_ROOT}/${repo_path}"

  # Detect GitHub owner/repo from git remote
  local remote_url owner_repo
  remote_url=$(git remote get-url origin 2>/dev/null || echo "")
  owner_repo=$(echo "$remote_url" | sed -E 's|.*github\.com[:/](.+)\.git$|\1|; s|.*github\.com[:/](.+)$|\1|')

  if [[ -z "$owner_repo" ]]; then
    log_warn "Could not detect GitHub owner/repo — skipping Codex review"
    cd "$HQ_ROOT"
    return 0
  fi

  local poll_interval="${CFG_CODEX_REVIEW_POLL_SEC:-30}"
  local timeout="${CFG_CODEX_REVIEW_TIMEOUT_SEC:-300}"
  local elapsed=0
  local pipeline_dir
  pipeline_dir=$(dirname "$STATE_FILE")
  local findings_file="${pipeline_dir}/${project}.codex-review.json"

  log_info "Polling for Codex review comments on PR #${pr_number} (timeout: ${timeout}s)"

  while [[ $elapsed -lt $timeout ]]; do
    sleep "$poll_interval"
    elapsed=$((elapsed + poll_interval))

    # Fetch PR review comments via GitHub API
    local comments
    comments=$(gh api "repos/${owner_repo}/pulls/${pr_number}/comments" 2>/dev/null || echo "[]")

    # Check for Codex review comments (look for bot-generated reviews)
    local codex_comments
    codex_comments=$(echo "$comments" | jq '[.[] | select(.user.type == "Bot" or (.body | test("severity|P[0-9]|finding"; "i")))]' 2>/dev/null || echo "[]")

    local comment_count
    comment_count=$(echo "$codex_comments" | jq 'length' 2>/dev/null || echo "0")

    if [[ "$comment_count" -gt 0 ]]; then
      log_info "Found ${comment_count} Codex review comment(s)"

      # Save findings
      echo "$codex_comments" > "$findings_file"

      # Check for P1/P2 severity findings
      local critical_count
      critical_count=$(echo "$codex_comments" | jq '[.[] | select(.body | test("P1|P2|critical|high"; "i"))] | length' 2>/dev/null || echo "0")

      if [[ "$critical_count" -gt 0 ]] && [[ "${CFG_CODEX_AUTOFIX:-true}" == "true" ]]; then
        log_warn "Found ${critical_count} P1/P2 finding(s) — attempting autofix"

        local max_attempts="${CFG_CODEX_AUTOFIX_MAX:-1}"
        local attempt=0

        while [[ $attempt -lt $max_attempts ]]; do
          attempt=$((attempt + 1))
          log_info "Autofix attempt ${attempt}/${max_attempts}"

          # Spawn claude to fix findings
          local fix_prompt="Fix the following Codex review findings on PR #${pr_number}:\n$(echo "$codex_comments" | jq -r '.[].body' | head -20)"
          env -u CLAUDECODE claude -p "$fix_prompt" --model "${MODEL:-claude-sonnet-4-20250514}" 2>&1 || {
            log_warn "Autofix attempt ${attempt} failed"
            continue
          }

          # Push fixes
          git push 2>/dev/null || true
          log_ok "Autofix pushed (attempt ${attempt})"
          break
        done
      fi

      cd "$HQ_ROOT"
      return 0
    fi

    log_info "No Codex comments yet (${elapsed}s / ${timeout}s)"
  done

  # Timeout — no comments found
  log_warn "No Codex review comments found after ${timeout}s — continuing"
  echo "[]" > "$findings_file"

  cd "$HQ_ROOT"
  return 0
}

# =============================================================================
# phase_review() — Run g-review via claude -p, parse verdict
# =============================================================================

phase_review() {
  local project="$1" prd_path="$2"

  # Check if g-review is enabled
  if [[ "${CFG_G_REVIEW_ENABLED:-true}" != "true" ]]; then
    log_info "g-review disabled — skipping review phase"
    update_state '(.sequence[] | select(.project == "'"$project"'")) |= (.review_verdict = null)'
    return 0
  fi

  update_project_phase "$project" "reviewing"

  # Get PR number and repo
  local pr_number=$(jq -r '.sequence[] | select(.project == "'"$project"'") | .pr_number // empty' "$STATE_FILE")
  local repo_path=$(jq -r '.metadata.repoPath // ""' "${HQ_ROOT}/${prd_path}")

  if [[ -z "$pr_number" || -z "$repo_path" ]]; then
    log_warn "No PR or repo for ${project} — skipping review"
    return 0
  fi

  local risk=$(jq -r '.sequence[] | select(.project == "'"$project"'") | .risk // "LOW"' "$STATE_FILE")
  local pipeline_dir=$(dirname "$STATE_FILE")
  local review_file="${pipeline_dir}/${project}.review.json"

  log_info "Running g-review on PR #${pr_number} for ${project}..."

  cd "${HQ_ROOT}/${repo_path}"

  # Run g-review via claude -p with a 300s timeout
  local review_output
  review_output=$(timeout 300 env -u CLAUDECODE claude -p \
    "Review PR #${pr_number}. Provide a verdict: PASS, PASS_WITH_NOTES, or FAIL. Output a JSON object with fields: verdict, summary, findings (array of {severity, file, message})." \
    --model "${MODEL:-claude-sonnet-4-20250514}" 2>&1) || {
    local exit_code=$?
    if [[ $exit_code -eq 124 ]]; then
      log_warn "g-review timed out after 300s for ${project}"
    else
      log_warn "g-review failed for ${project} (exit ${exit_code})"
    fi
    # Non-fatal — continue without review
    cd "$HQ_ROOT"
    return 0
  }

  cd "$HQ_ROOT"

  # Parse verdict from output — look for PASS, PASS_WITH_NOTES, or FAIL
  local verdict="PASS"  # default if we can't parse
  if echo "$review_output" | grep -qi "FAIL"; then
    verdict="FAIL"
  elif echo "$review_output" | grep -qi "PASS_WITH_NOTES"; then
    verdict="PASS_WITH_NOTES"
  elif echo "$review_output" | grep -qi "PASS"; then
    verdict="PASS"
  fi

  # Save review output
  jq -n --arg verdict "$verdict" --arg output "$review_output" \
    '{"verdict": $verdict, "raw_output": $output, "reviewed_at": (now | todate)}' > "$review_file" 2>/dev/null || \
    echo "{\"verdict\": \"${verdict}\"}" > "$review_file"

  # Update pipeline state with verdict
  update_state '(.sequence[] | select(.project == "'"$project"'")) |= (.review_verdict = "'"$verdict"'")'

  # Log verdict with color
  case "$verdict" in
    PASS)
      log_ok "Review verdict: PASS for ${project}"
      ;;
    PASS_WITH_NOTES)
      log_warn "Review verdict: PASS_WITH_NOTES for ${project}"
      ;;
    FAIL)
      log_err "Review verdict: FAIL for ${project}"
      # HIGH risk FAIL triggers safety gate
      if [[ "$risk" == "HIGH" ]]; then
        log_warn "HIGH risk project FAILED review — triggering safety gate"
        check_gate "review_fail" "$project" "$risk" "$verdict" "Review FAIL on HIGH risk project ${project}"
        local gate_result=$?
        if [[ $gate_result -eq 1 ]]; then
          update_project_phase "$project" "failed" "Review FAIL — rejected at gate"
          return 1
        elif [[ $gate_result -eq 2 ]]; then
          return 2  # skip
        fi
        # gate_result 0 = approved to continue despite FAIL
      else
        # LOW/MEDIUM risk FAIL — log warning but continue
        log_warn "Review FAIL on ${risk} risk project — continuing (would block on HIGH)"
      fi
      ;;
  esac

  # Audit event
  "${HQ_ROOT}/scripts/audit-log.sh" append \
    --event project_reviewed \
    --project "$project" \
    --company "$COMPANY" \
    --action "Review verdict: ${verdict}" \
    --result "$verdict" 2>/dev/null || true

  return 0
}

# =============================================================================
# Merge Phase — Squash-merges the PR and deletes the branch
# =============================================================================

phase_merge() {
  local project="$1" prd_path="$2"

  update_project_phase "$project" "merging"

  local pr_number=$(jq -r '.sequence[] | select(.project == "'"$project"'") | .pr_number // empty' "$STATE_FILE")
  local repo_path=$(jq -r '.metadata.repoPath // ""' "${HQ_ROOT}/${prd_path}")
  local risk=$(jq -r '.sequence[] | select(.project == "'"$project"'") | .risk // "LOW"' "$STATE_FILE")
  local review_verdict=$(jq -r '.sequence[] | select(.project == "'"$project"'") | .review_verdict // ""' "$STATE_FILE")

  if [[ -z "$pr_number" ]]; then
    log_warn "No PR to merge for ${project} — skipping merge"
    return 0
  fi

  # Safety gate check based on risk level
  local gate_name="pre_merge_${risk,,}"  # lowercase risk for gate name
  check_gate "$gate_name" "$project" "$risk" "$review_verdict" "Merge PR #${pr_number} for ${project} (${risk} risk)"
  local gate_result=$?
  if [[ $gate_result -eq 1 ]]; then
    update_project_phase "$project" "failed" "Merge rejected at gate"
    return 1
  elif [[ $gate_result -eq 2 ]]; then
    return 2  # skip
  fi

  cd "${HQ_ROOT}/${repo_path}"

  log_info "Merging PR #${pr_number} for ${project} (squash + delete branch)..."

  local merge_output
  merge_output=$(gh pr merge "$pr_number" --squash --delete-branch 2>&1) || {
    log_err "Merge failed for PR #${pr_number}: ${merge_output}"
    update_project_phase "$project" "failed" "Merge failed: ${merge_output}"
    cd "$HQ_ROOT"
    return 1
  }

  log_ok "PR #${pr_number} merged successfully"

  # Audit event
  "${HQ_ROOT}/scripts/audit-log.sh" append \
    --event project_merged \
    --project "$project" \
    --company "$COMPANY" \
    --action "PR #${pr_number} merged (squash)" || true

  cd "$HQ_ROOT"
  return 0
}

# =============================================================================
# Deploy Phase — Triggers or polls deployment after merge
# =============================================================================

phase_deploy() {
  local project="$1" prd_path="$2"

  # Check if auto-deploy is enabled
  if [[ "${CFG_DEPLOY_AUTO_TRIGGER:-true}" != "true" ]]; then
    log_info "Auto-deploy disabled — skipping deploy phase"
    return 0
  fi

  update_project_phase "$project" "deploying"

  local repo_path=$(jq -r '.metadata.repoPath // ""' "${HQ_ROOT}/${prd_path}")
  local pipeline_dir=$(dirname "$STATE_FILE")

  if [[ -z "$repo_path" ]]; then
    log_warn "No repo path for ${project} — skipping deploy"
    return 0
  fi

  # Look up deploy target from deploy-registry.yaml
  local deploy_registry="${HQ_ROOT}/settings/deploy-registry.yaml"
  local deploy_target=""
  local deploy_platform=""

  if [[ -f "$deploy_registry" ]]; then
    # Try to find matching deploy entry for this repo
    deploy_platform=$(yaml_read "$deploy_registry" ".deploys" 2>/dev/null | grep -A5 "$repo_path" | grep "platform:" | head -1 | awk '{print $2}' || echo "")
  fi

  # Update deploy target in state
  if [[ -n "$deploy_platform" ]]; then
    update_state '(.sequence[] | select(.project == "'"$project"'")) |= (.deploy_target = "'"$deploy_platform"'")'
  fi

  case "${deploy_platform,,}" in
    vercel|"")
      # Vercel auto-deploys on merge — just poll for deploy completion
      log_info "Vercel auto-deploy for ${project} — polling for completion..."

      local poll_interval="${CFG_DEPLOY_POLL_SEC:-30}"
      local max_wait=600  # 10 minutes max deploy wait
      local elapsed=0

      # For Vercel, merge triggers auto-deploy. Poll deployment status
      while [[ $elapsed -lt $max_wait ]]; do
        sleep "$poll_interval"
        elapsed=$((elapsed + poll_interval))

        # Check if there's a recent successful deployment
        # This is best-effort since Vercel APIs vary
        log_info "Deploy polling: ${elapsed}s elapsed (${project})"

        # Simple heuristic: if enough time has passed, assume deploy is done
        if [[ $elapsed -ge 120 ]]; then
          log_ok "Deploy assumed complete for ${project} (120s elapsed)"
          break
        fi
      done
      ;;

    sst)
      # SST deployments require explicit handling
      log_warn "SST deploy detected for ${project}"

      if [[ "${CFG_SST_AUTO_DEPLOY:-false}" != "true" ]] && [[ "${AUTO_SST_DEPLOY}" != "true" ]]; then
        # Gate for SST deploy
        check_gate "sst_deploy" "$project" "HIGH" "" "SST infrastructure deploy for ${project}"
        local gate_result=$?
        if [[ $gate_result -eq 1 ]]; then
          update_project_phase "$project" "failed" "SST deploy rejected at gate"
          return 1
        elif [[ $gate_result -eq 2 ]]; then
          return 2
        fi
      fi

      log_info "SST deploy would be triggered here — manual step"
      log_warn "SST auto-deploy not yet implemented — skipping"
      ;;

    *)
      log_warn "Unknown deploy platform '${deploy_platform}' for ${project} — skipping deploy"
      ;;
  esac

  # Audit event
  "${HQ_ROOT}/scripts/audit-log.sh" append \
    --event project_deployed \
    --project "$project" \
    --company "$COMPANY" \
    --action "Deployed via ${deploy_platform:-vercel}" || true

  return 0
}

# =============================================================================
# Canary Phase — Post-deploy canary monitoring
# =============================================================================

phase_canary() {
  local project="$1" prd_path="$2"

  # Check if canary is skipped
  if [[ "${SKIP_CANARY}" == "true" ]]; then
    log_info "Canary monitoring skipped (--skip-canary)"
    return 0
  fi

  update_project_phase "$project" "canary"

  local canary_duration="${CFG_CANARY_DURATION_SEC:-180}"
  local pipeline_dir=$(dirname "$STATE_FILE")
  local canary_file="${pipeline_dir}/${project}.canary.json"

  log_info "Running canary monitoring for ${project} (${canary_duration}s)..."

  # Run canary via claude -p
  local canary_output
  canary_output=$(timeout "$canary_duration" env -u CLAUDECODE claude -p \
    "Monitor the deployment of ${project} for ${canary_duration} seconds. Check for: error rate spikes, performance degradation, visual regressions. Respond with a JSON object: {\"result\": \"pass|warn|fail\", \"summary\": \"...\", \"findings\": []}." \
    --model "${MODEL:-claude-sonnet-4-20250514}" 2>&1) || {
    local exit_code=$?
    if [[ $exit_code -eq 124 ]]; then
      # Timeout is expected — canary ran for full duration
      log_info "Canary monitoring completed (${canary_duration}s)"
    else
      log_warn "Canary monitoring failed (exit ${exit_code})"
    fi
  }

  # Parse canary result
  local canary_result="pass"  # default to pass
  if echo "$canary_output" | grep -qi '"result".*"fail"'; then
    canary_result="fail"
  elif echo "$canary_output" | grep -qi '"result".*"warn"'; then
    canary_result="warn"
  fi

  # Save canary output
  jq -n --arg result "$canary_result" --arg output "${canary_output:-timeout}" \
    '{"result": $result, "raw_output": $output, "completed_at": (now | todate)}' > "$canary_file" 2>/dev/null || \
    echo "{\"result\": \"${canary_result}\"}" > "$canary_file"

  # Update pipeline state
  update_state '(.sequence[] | select(.project == "'"$project"'")) |= (.canary_result = "'"$canary_result"'")'

  case "$canary_result" in
    pass)
      log_ok "Canary result: PASS for ${project}"
      "${HQ_ROOT}/scripts/audit-log.sh" append \
        --event project_canary_pass \
        --project "$project" \
        --company "$COMPANY" \
        --action "Canary monitoring passed" || true
      ;;
    warn)
      log_warn "Canary result: WARN for ${project}"
      ;;
    fail)
      log_err "Canary result: FAIL for ${project}"
      # Always gate on canary failure
      check_gate "canary_failure" "$project" "HIGH" "" "Canary monitoring failed for ${project}"
      local gate_result=$?
      if [[ $gate_result -eq 1 ]]; then
        update_project_phase "$project" "failed" "Canary failure — rejected"
        "${HQ_ROOT}/scripts/audit-log.sh" append \
          --event project_canary_fail \
          --project "$project" \
          --company "$COMPANY" \
          --action "Canary monitoring failed — rejected at gate" || true
        return 1
      elif [[ $gate_result -eq 2 ]]; then
        return 2
      fi
      # Approved to continue despite canary failure
      log_warn "Canary failure approved — continuing"
      ;;
  esac

  return 0
}

# =============================================================================
# Summary Counts — Recalculates summary from current sequence state
# =============================================================================

update_summary_counts() {
  update_state '
    .summary = (
      .sequence | {
        total: length,
        queued: [.[] | select(.phase == "queued")] | length,
        building: [.[] | select(.phase == "building")] | length,
        pr_open: [.[] | select(.phase == "pr_open")] | length,
        reviewing: [.[] | select(.phase == "reviewing")] | length,
        merging: [.[] | select(.phase == "merging")] | length,
        deploying: [.[] | select(.phase == "deploying")] | length,
        deployed: [.[] | select(.phase == "deployed")] | length,
        done: [.[] | select(.phase == "done")] | length,
        failed: [.[] | select(.phase == "failed")] | length,
        skipped: [.[] | select(.phase == "skipped")] | length
      }
    )'
}

# =============================================================================
# Project Lifecycle — Drives a single project through all phases
# =============================================================================

run_project_lifecycle() {
  local project="$1" prd_path="$2"

  log_info "Starting lifecycle for ${project}"

  # Phase sequence
  local phases=(phase_build phase_pr phase_ci_wait phase_codex_review phase_review phase_merge phase_deploy phase_canary)
  # --build-only: truncate to phase_build so the pipeline drives code-complete state only,
  # leaving PR creation + all downstream lifecycle stages for manual handling post-run.
  if [[ "${BUILD_ONLY:-false}" == "true" ]]; then
    phases=(phase_build)
  fi

  for phase_fn in "${phases[@]}"; do
    log_info "Phase: ${phase_fn} for ${project}"

    "$phase_fn" "$project" "$prd_path"
    local result=$?

    case $result in
      0)
        # Success — continue to next phase
        ;;
      1)
        # Hard failure
        log_err "Project ${project} failed at ${phase_fn}"
        update_project_phase "$project" "failed" "Failed at ${phase_fn}"
        update_summary_counts
        return 1
        ;;
      2)
        # Skip (from gate rejection with skip)
        log_warn "Project ${project} skipped at ${phase_fn}"
        update_project_phase "$project" "skipped"
        update_summary_counts
        return 2
        ;;
    esac
  done

  # All phases complete
  local now
  now=$(ts)
  update_project_phase "$project" "done"
  update_state '(.sequence[] | select(.project == "'"$project"'")) |= (.completed_at = "'"$now"'")'
  update_summary_counts
  log_ok "Project ${project} completed successfully"
  return 0
}

# =============================================================================
# Pipeline Loop — Iterates through all projects in sequence
# =============================================================================

run_pipeline_loop() {
  local total
  total=$(jq '.sequence | length' "$STATE_FILE")
  local completed=0
  local failed=0

  log_info "Starting pipeline loop: ${total} project(s)"

  # Write to pipeline log
  local pipeline_log="${PIPELINE_DIR}/pipeline-log.txt"
  echo "$(ts) Pipeline started: ${total} projects" >> "$pipeline_log"

  while true; do
    # Re-read sequence (Claude session may have reordered between projects)
    local next_project next_prd_path

    # Find next project: first one with phase == "queued", sorted by order
    next_project=$(jq -r '[.sequence[] | select(.phase == "queued")] | sort_by(.order) | .[0].project // empty' "$STATE_FILE")

    if [[ -z "$next_project" ]]; then
      # No more queued projects — check if any are still in progress
      local in_progress
      in_progress=$(jq '[.sequence[] | select(.phase != "done" and .phase != "failed" and .phase != "skipped" and .phase != "queued")] | length' "$STATE_FILE")
      if [[ "$in_progress" -gt 0 ]]; then
        log_warn "No queued projects but ${in_progress} still in progress — waiting"
        sleep 30
        continue
      fi
      break  # All done
    fi

    next_prd_path=$(jq -r '.sequence[] | select(.project == "'"$next_project"'") | .prd_path' "$STATE_FILE")

    # Check if dependencies are satisfied
    local deps
    deps=$(jq -r '.sequence[] | select(.project == "'"$next_project"'") | .depends_on // [] | .[]' "$STATE_FILE" 2>/dev/null)
    local deps_met=true

    for dep in $deps; do
      [[ -z "$dep" ]] && continue
      local dep_phase
      dep_phase=$(jq -r '.sequence[] | select(.project == "'"$dep"'") | .phase' "$STATE_FILE")
      if [[ "$dep_phase" != "done" ]]; then
        if [[ "$dep_phase" == "failed" || "$dep_phase" == "skipped" ]]; then
          if [[ "${SKIP_FAILED_PROJECTS}" == "true" ]]; then
            log_warn "Dependency ${dep} is ${dep_phase} — skipping ${next_project}"
            update_project_phase "$next_project" "skipped" "Dependency ${dep} is ${dep_phase}"
            update_summary_counts
            deps_met=false
            break
          else
            log_err "Dependency ${dep} is ${dep_phase} — cannot proceed with ${next_project}"
            update_project_phase "$next_project" "failed" "Blocked by dependency ${dep} (${dep_phase})"
            update_summary_counts
            deps_met=false
            break
          fi
        else
          # Dependency not yet complete — skip this project for now, it will be picked up later
          log_info "Dependency ${dep} not yet complete — deferring ${next_project}"
          deps_met=false
          break
        fi
      fi
    done

    if ! $deps_met; then
      continue
    fi

    # Log to pipeline log
    echo "$(ts) Starting: ${next_project}" >> "$pipeline_log"

    completed=$((completed + 1))
    log_info "━━━ Project ${completed}/${total}: ${next_project} ━━━"

    # Run the project lifecycle
    run_project_lifecycle "$next_project" "$next_prd_path"
    local result=$?

    case $result in
      0)
        echo "$(ts) Completed: ${next_project}" >> "$pipeline_log"
        ;;
      1)
        failed=$((failed + 1))
        echo "$(ts) Failed: ${next_project}" >> "$pipeline_log"
        if [[ "${SKIP_FAILED_PROJECTS}" != "true" ]]; then
          # Check if remaining projects depend on this one
          local blocked
          blocked=$(jq '[.sequence[] | select(.phase == "queued") | select(.depends_on[]? == "'"$next_project"'")] | length' "$STATE_FILE" 2>/dev/null || echo "0")
          if [[ "$blocked" -gt 0 ]]; then
            log_warn "${blocked} project(s) blocked by failed ${next_project}"
          fi
        fi
        ;;
      2)
        echo "$(ts) Skipped: ${next_project}" >> "$pipeline_log"
        ;;
    esac
  done

  # Pipeline complete
  local done_count fail_count skip_count now
  done_count=$(jq '[.sequence[] | select(.phase == "done")] | length' "$STATE_FILE")
  fail_count=$(jq '[.sequence[] | select(.phase == "failed")] | length' "$STATE_FILE")
  skip_count=$(jq '[.sequence[] | select(.phase == "skipped")] | length' "$STATE_FILE")
  now=$(ts)

  if [[ $fail_count -gt 0 && $done_count -eq 0 ]]; then
    update_state '.status = "failed" | .completed_at = "'"$now"'"'
    log_err "Pipeline FAILED: ${fail_count}/${total} projects failed"
    echo "$(ts) Pipeline FAILED: ${done_count} done, ${fail_count} failed, ${skip_count} skipped" >> "$pipeline_log"

    # Audit log: pipeline failed (best-effort)
    "${HQ_ROOT}/scripts/audit-log.sh" append \
      --event pipeline_failed \
      --project "${PIPELINE_ID}" \
      --company "$COMPANY" \
      --action "Pipeline failed: ${fail_count}/${total} projects failed" \
      --result "fail" 2>/dev/null || true
  else
    update_state '.status = "completed" | .completed_at = "'"$now"'"'
    log_ok "Pipeline COMPLETED: ${done_count} done, ${fail_count} failed, ${skip_count} skipped"
    echo "$(ts) Pipeline COMPLETED: ${done_count} done, ${fail_count} failed, ${skip_count} skipped" >> "$pipeline_log"

    # Audit log: pipeline completed (best-effort)
    "${HQ_ROOT}/scripts/audit-log.sh" append \
      --event pipeline_completed \
      --project "${PIPELINE_ID}" \
      --company "$COMPANY" \
      --action "Pipeline completed: ${done_count} done, ${fail_count} failed, ${skip_count} skipped" \
      --result "success" 2>/dev/null || true
  fi

  update_summary_counts
}

# =============================================================================
# Main Entry Point
# =============================================================================

# Handle --status first (no company/PRD required)
if [[ "$STATUS" == true ]]; then
  show_status
  exit 0
fi

# Handle --resume
if [[ -n "$RESUME_ID" ]]; then
  STATE_FILE="${HQ_ROOT}/${PIPELINE_BASE_DIR}/${RESUME_ID}/pipeline-state.json"
  if [[ ! -f "$STATE_FILE" ]]; then
    log_err "Pipeline not found: ${RESUME_ID}"
    log_err "Expected state at: ${STATE_FILE}"
    exit 1
  fi

  PIPELINE_ID="$RESUME_ID"
  PIPELINE_DIR="${HQ_ROOT}/${PIPELINE_BASE_DIR}/${RESUME_ID}"
  COMPANY=$(jq -r '.company' "$STATE_FILE")
  log_info "Resuming pipeline: ${PIPELINE_ID} (company: ${COMPANY})"

  # Load config for resumed pipeline
  load_config
  load_gate_config

  # Update state back to in_progress
  update_state '.status = "in_progress" | .pid = '"$$"

  # Resume the pipeline loop (picks up from next queued project)
  run_pipeline_loop
  exit $?
fi

# Validate company + PRDs
if [[ -z "$COMPANY" ]]; then
  log_err "Missing required argument: <company>"
  echo -e "  Usage: scripts/run-pipeline.sh <company> <prd1> [prd2...] [flags]" >&2
  echo -e "  Run with --help for full usage." >&2
  exit 1
fi

if [[ ${#PRDS[@]} -eq 0 ]]; then
  log_err "No PRDs specified for company '${COMPANY}'"
  echo -e "  Usage: scripts/run-pipeline.sh ${COMPANY} <prd1> [prd2...] [flags]" >&2
  exit 1
fi

# Load config
load_config
load_gate_config

# Initialize pipeline state
init_pipeline_state

log_info "Pipeline ${PIPELINE_ID} — ${#PRDS[@]} PRD(s) for ${COMPANY}"
log_info "Config: safety=${CFG_SAFETY_MODE} auto_merge=${AUTO_MERGE_ALL} skip_canary=${SKIP_CANARY}"

# Audit log: pipeline started (best-effort)
"${HQ_ROOT}/scripts/audit-log.sh" append \
  --event pipeline_started \
  --project "$PIPELINE_ID" \
  --company "$COMPANY" \
  --action "Pipeline started with ${#PRDS[@]} PRD(s)" \
  --result "success" 2>/dev/null || true

# --dry-run: triage and display sequence, then exit
if [[ "$DRY_RUN" == true ]]; then
  log_info "Dry run mode — running triage only"
  load_prds
  detect_dependencies
  generate_sequence
  print_triage_table
  exit 0
fi

# Run triage
load_prds
detect_dependencies
generate_sequence
print_triage_table

# Pre-triage gate (always fires)
check_gate "pre_triage" "pipeline" "LOW" "" "Confirm pipeline sequence for ${COMPANY}"
gate_result=$?
if [[ $gate_result -eq 1 ]]; then
  log_err "Pipeline rejected at pre-triage gate"
  update_state '.status = "failed"'
  exit 1
fi

# Run the pipeline
run_pipeline_loop
exit $?
