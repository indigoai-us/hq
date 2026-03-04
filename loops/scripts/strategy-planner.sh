#!/usr/bin/env bash
# strategy-planner.sh -- Phase 1 of the scheduler: strategy-to-task planner
#
# Reads companies/{company}/strategy.yaml (goals, cadences, milestones,
# task_templates). Compares against existing bd tasks. Creates draft tasks
# to fill gaps (e.g. cadence says 2 videos/week but only 1 exists).
#
# Idempotent -- running it twice produces no duplicates.
#
# Usage:
#   strategy-planner.sh --company <slug>                    # Plan for one company
#   strategy-planner.sh --all                               # Plan for all enabled companies
#   strategy-planner.sh --dry-run --company <slug>          # Show what would be created
#   strategy-planner.sh --strategy-file <path> --epic <id> --company <name>  # Direct mode
#
# Environment:
#   GHQ_ROOT    Override GHQ root directory (default: auto-detected)
#   BD_CMD      Override bd command path (default: "bd")
#
# Exit codes:
#   0  Success
#   1  Invalid arguments
#   2  Configuration error

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
BD="${BD_CMD:-bd}"
LOG_PREFIX="[planner]"
DRY_RUN=false
COMPANY=""
ALL_COMPANIES=false
STRATEGY_FILE=""
EPIC=""
EXTRA_LABELS=""

# ─────────────────────────────────────────────────
# Usage
# ─────────────────────────────────────────────────
usage() {
  cat <<'EOF'
Usage: strategy-planner.sh [options]

Options:
  --company <slug>          Plan for a specific company
  --all                     Plan for all enabled companies
  --dry-run                 Show what would be created without creating
  --strategy-file <path>    Use a specific strategy.yaml (overrides company lookup)
  --epic <id>               Parent epic ID (required with --strategy-file)
  --labels <csv>            Extra labels to add to created tasks
  --help                    Show this help

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
    --company)
      COMPANY="$2"
      shift 2
      ;;
    --all)
      ALL_COMPANIES=true
      shift
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --strategy-file)
      STRATEGY_FILE="$2"
      shift 2
      ;;
    --epic)
      EPIC="$2"
      shift 2
      ;;
    --labels)
      EXTRA_LABELS="$2"
      shift 2
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
# Validate arguments
# ─────────────────────────────────────────────────
if [[ -z "$COMPANY" && "$ALL_COMPANIES" == "false" && -z "$STRATEGY_FILE" ]]; then
  err "Must specify --company <slug>, --all, or --strategy-file <path>"
  usage
  exit 1
fi

if [[ -n "$STRATEGY_FILE" && -z "$EPIC" ]]; then
  err "--epic is required when using --strategy-file"
  exit 1
fi

# ─────────────────────────────────────────────────
# Core: plan for a single company
# ─────────────────────────────────────────────────
run_planner() {
  local company="$1"
  local strategy_file="$2"
  local epic="$3"
  local extra_labels="${4:-}"

  log "Planning for company: $company (epic: $epic)"

  # Validate strategy file exists
  if [[ ! -f "$strategy_file" ]]; then
    warn "No strategy.yaml found for $company at $strategy_file -- skipping"
    return 0
  fi

  # Validate YAML
  if ! python3 -c "
import yaml, sys
with open(sys.argv[1]) as f:
    yaml.safe_load(f)
" "$strategy_file" 2>/dev/null; then
    err "Invalid YAML in $strategy_file"
    return 2
  fi

  # Get existing tasks for this epic (all statuses for dedup)
  local existing_open existing_draft existing_in_progress existing_closed_recent
  existing_open=$($BD list --parent "$epic" --status open --json 2>/dev/null) || existing_open="[]"
  existing_draft=$($BD list --parent "$epic" --status draft --json 2>/dev/null) || existing_draft="[]"
  existing_in_progress=$($BD list --parent "$epic" --status in_progress --json 2>/dev/null) || existing_in_progress="[]"
  # Recently closed = within the last 7 days
  local week_ago
  week_ago=$(date -u -v-7d +%Y-%m-%d 2>/dev/null || date -u -d '7 days ago' +%Y-%m-%d 2>/dev/null || echo "2026-02-25")
  existing_closed_recent=$($BD list --parent "$epic" --all --closed-after "$week_ago" --json 2>/dev/null) || existing_closed_recent="[]"

  # Write Python output to a temp file (avoids macOS head -n -1 issues)
  local tmp_tasks
  tmp_tasks=$(mktemp)

  # Run the planner in Python
  # stdout = JSON (tasks to create), stderr = log messages
  python3 - "$strategy_file" "$existing_open" "$existing_draft" "$existing_in_progress" "$existing_closed_recent" "$epic" "$company" "$extra_labels" > "$tmp_tasks" <<'PYEOF' || { err "Python planner failed"; rm -f "$tmp_tasks"; return 2; }
import yaml
import json
import sys
import re
from datetime import datetime, timedelta

strategy_file = sys.argv[1]
existing_open = json.loads(sys.argv[2])
existing_draft = json.loads(sys.argv[3])
existing_in_progress = json.loads(sys.argv[4])
existing_closed_recent = json.loads(sys.argv[5])
epic = sys.argv[6]
company = sys.argv[7]
extra_labels = sys.argv[8]

# Load strategy
with open(strategy_file) as f:
    strategy = yaml.safe_load(f) or {}

cadences = strategy.get("cadences", [])

# Combine all existing tasks for dedup
all_existing = existing_open + existing_draft + existing_in_progress + existing_closed_recent
seen_ids = set()
unique_existing = []
for t in all_existing:
    tid = t.get("id", "")
    if tid not in seen_ids:
        seen_ids.add(tid)
        unique_existing.append(t)

# Build fingerprint set from existing tasks
existing_fingerprints = set()
for t in unique_existing:
    meta = t.get("metadata", {}) or {}
    cid = meta.get("cadence_id", "")
    period = meta.get("cadence_period", "")
    slot = meta.get("cadence_slot", "")
    if cid and period:
        if slot:
            existing_fingerprints.add(f"{cid}:{period}:#{slot}")
        existing_fingerprints.add(f"{cid}:{period}")

def parse_frequency(freq_str):
    m = re.match(r"(\d+)\s*/\s*(day|week|month)", str(freq_str).lower())
    if not m:
        return (0, "unknown", 0)
    count = int(m.group(1))
    period = m.group(2)
    days = {"day": 1, "week": 7, "month": 30}[period]
    return (count, period, days)

def get_current_period(period_name):
    now = datetime.utcnow()
    if period_name == "day":
        return now.strftime("%Y-%m-%d")
    elif period_name == "week":
        return now.strftime("%Y-W%V")
    elif period_name == "month":
        return now.strftime("%Y-%m")
    return "unknown"

def count_existing_for_cadence(cadence_id, period_key):
    count = 0
    for t in unique_existing:
        meta = t.get("metadata", {}) or {}
        if meta.get("cadence_id") == cadence_id and meta.get("cadence_period") == period_key:
            count += 1
    return count

def count_title_matches(title_pattern, period_name):
    now = datetime.utcnow()
    if period_name == "week":
        period_start = now - timedelta(days=now.weekday())
    elif period_name == "month":
        period_start = now.replace(day=1)
    elif period_name == "day":
        period_start = now.replace(hour=0, minute=0, second=0)
    else:
        period_start = now - timedelta(days=7)
    period_start_str = period_start.strftime("%Y-%m-%dT%H:%M:%S")
    pattern_lower = title_pattern.lower()
    count = 0
    for t in unique_existing:
        title = t.get("title", "").lower()
        created = t.get("created_at", "")
        if pattern_lower in title and created >= period_start_str:
            count += 1
    return count

# Process cadences
tasks_to_create = []

if not cadences:
    print("[planner] No cadences defined in strategy -- no gaps to fill", file=sys.stderr)
    print("[]")
    sys.exit(0)

for cadence in cadences:
    cid = cadence.get("id", "unknown")
    freq_str = cadence.get("frequency", "0/week")
    template = cadence.get("task_template", {})
    count_needed, period_name, period_days = parse_frequency(freq_str)
    if count_needed == 0:
        continue

    period_key = get_current_period(period_name)
    existing_count = count_existing_for_cadence(cid, period_key)
    title_pattern = template.get("title", cid)
    title_matches = count_title_matches(title_pattern, period_name)
    total_existing = max(existing_count, title_matches)
    gap = count_needed - total_existing

    if gap <= 0:
        print(f"[planner] Cadence '{cid}': {total_existing}/{count_needed} for {period_key} -- already exists, no gap", file=sys.stderr)
        continue

    print(f"[planner] Cadence '{cid}': {total_existing}/{count_needed} for {period_key} -- gap of {gap}", file=sys.stderr)

    for i in range(gap):
        slot_num = total_existing + i + 1
        title = template.get("title", f"Task for {cid}")
        if count_needed > 1:
            title = f"{title} ({period_key} #{slot_num})"
        else:
            title = f"{title} ({period_key})"

        task_labels = list(template.get("labels", []))
        task_labels.append(company)
        if extra_labels:
            task_labels.extend(extra_labels.split(","))

        task_priority = template.get("priority", 2)
        task_type = template.get("type", "task")
        task_desc = template.get("description", f"Auto-generated from cadence '{cid}' in strategy.yaml")

        fp = f"{cid}:{period_key}"
        if count_needed > 1:
            fp = f"{cid}:{period_key}:#{slot_num}"

        if fp in existing_fingerprints:
            print(f"[planner] Task '{cid}' slot #{slot_num} already exists -- skipping", file=sys.stderr)
            continue

        metadata = {
            "cadence_id": cid,
            "cadence_period": period_key,
            "cadence_slot": slot_num,
            "generated_by": "strategy-planner",
            "goal": cadence.get("goal", "")
        }

        tasks_to_create.append({
            "title": title,
            "description": task_desc,
            "type": task_type,
            "priority": task_priority,
            "labels": task_labels,
            "parent": epic,
            "metadata": metadata,
            "fingerprint": fp
        })

if not tasks_to_create:
    print("[planner] No gaps found -- nothing to create", file=sys.stderr)

print(json.dumps(tasks_to_create))
PYEOF

  # Read JSON from temp file
  local tasks_json
  tasks_json=$(cat "$tmp_tasks")
  rm -f "$tmp_tasks"

  # Parse task count
  local task_count
  task_count=$(echo "$tasks_json" | python3 -c "import json,sys; print(len(json.load(sys.stdin)))" 2>/dev/null) || task_count=0

  if [[ "$task_count" -eq 0 ]]; then
    log "No draft tasks to create for $company"
    return 0
  fi

  if $DRY_RUN; then
    log "[dry-run] Would create $task_count draft task(s) for $company:"
    echo "$tasks_json" | python3 -c "
import json, sys
tasks = json.load(sys.stdin)
for t in tasks:
    labels_str = ','.join(t['labels'])
    print(f\"  [dry-run] - {t['title']} (priority={t['priority']}, labels={labels_str})\")
"
    return 0
  fi

  # Create draft tasks via bd -- use Python to generate individual bd commands
  log "Creating $task_count draft task(s) for $company..."

  local tmp_cmds
  tmp_cmds=$(mktemp)

  echo "$tasks_json" | python3 -c "
import json, sys

tasks = json.load(sys.stdin)
# Write one JSON object per line for bash to consume
for t in tasks:
    print(json.dumps(t))
" > "$tmp_cmds"

  local created=0
  while IFS= read -r task_line; do
    local title desc labels priority parent task_type metadata_json task_id

    title=$(echo "$task_line" | python3 -c "import json,sys; print(json.load(sys.stdin)['title'])")
    desc=$(echo "$task_line" | python3 -c "import json,sys; print(json.load(sys.stdin)['description'])")
    labels=$(echo "$task_line" | python3 -c "import json,sys; print(','.join(json.load(sys.stdin)['labels']))")
    priority=$(echo "$task_line" | python3 -c "import json,sys; print(json.load(sys.stdin)['priority'])")
    parent=$(echo "$task_line" | python3 -c "import json,sys; print(json.load(sys.stdin)['parent'])")
    task_type=$(echo "$task_line" | python3 -c "import json,sys; print(json.load(sys.stdin)['type'])")
    metadata_json=$(echo "$task_line" | python3 -c "import json,sys; print(json.dumps(json.load(sys.stdin)['metadata']))")

    task_id=$($BD create "$title" \
      --description "$desc" \
      --labels "$labels" \
      --priority "$priority" \
      --parent "$parent" \
      --type "$task_type" \
      --metadata "$metadata_json" \
      --silent 2>/dev/null) || {
      warn "Failed to create draft task: $title"
      continue
    }
    # Set status to draft (bd create does not support --status)
    $BD update "$task_id" --status draft 2>/dev/null || {
      warn "Failed to set draft status on $task_id"
    }
    log "Created draft task: $task_id -- $title"
    created=$((created + 1))
  done < "$tmp_cmds"

  rm -f "$tmp_cmds"
  log "Planner complete for $company: $created task(s) created"
}

# ─────────────────────────────────────────────────
# Main: dispatch based on mode
# ─────────────────────────────────────────────────

# Direct mode: --strategy-file + --epic
if [[ -n "$STRATEGY_FILE" ]]; then
  run_planner "$COMPANY" "$STRATEGY_FILE" "$EPIC" "$EXTRA_LABELS"
  exit $?
fi

# Single company mode
if [[ -n "$COMPANY" && "$ALL_COMPANIES" == "false" ]]; then
  if [[ ! -f "$MANIFEST" ]]; then
    err "Manifest not found: $MANIFEST"
    exit 2
  fi

  # Get company config from manifest
  COMPANY_CONFIG=$(python3 -c "
import yaml, sys, json

with open(sys.argv[1]) as f:
    manifest = yaml.safe_load(f)

company = sys.argv[2]
if company not in manifest:
    print(json.dumps({'error': 'Company not found in manifest'}))
    sys.exit(0)

config = manifest[company]
print(json.dumps({
    'slug': company,
    'epic': config.get('epic', ''),
    'symlink': config.get('symlink', company)
}))
" "$MANIFEST" "$COMPANY" 2>/dev/null) || { err "Failed to parse manifest"; exit 2; }

  COMPANY_EPIC=$(echo "$COMPANY_CONFIG" | python3 -c "import json,sys; print(json.load(sys.stdin).get('epic',''))")
  COMPANY_SYMLINK=$(echo "$COMPANY_CONFIG" | python3 -c "import json,sys; print(json.load(sys.stdin).get('symlink',''))")

  if [[ -z "$COMPANY_EPIC" ]]; then
    err "No epic found for company $COMPANY in manifest"
    exit 2
  fi

  STRATEGY_PATH="$GHQ/companies/$COMPANY_SYMLINK/strategy.yaml"
  run_planner "$COMPANY" "$STRATEGY_PATH" "$COMPANY_EPIC" "$EXTRA_LABELS"
  exit $?
fi

# All companies mode
if $ALL_COMPANIES; then
  if [[ ! -f "$MANIFEST" ]]; then
    err "Manifest not found: $MANIFEST"
    exit 2
  fi

  log "Running planner for all enabled companies..."

  COMPANIES_JSON=$(python3 -c "
import yaml, sys, json

with open(sys.argv[1]) as f:
    manifest = yaml.safe_load(f)

companies = []
for slug, config in (manifest or {}).items():
    sched = config.get('scheduler', {})
    companies.append({
        'slug': slug,
        'epic': config.get('epic', ''),
        'symlink': config.get('symlink', slug),
        'enabled': sched.get('enabled', False)
    })

print(json.dumps(companies))
" "$MANIFEST" 2>/dev/null) || { err "Failed to parse manifest"; exit 2; }

  echo "$COMPANIES_JSON" | python3 -c "
import json, sys
companies = json.load(sys.stdin)
for c in companies:
    print(f\"{c['slug']}|{c['epic']}|{c['symlink']}|{c['enabled']}\")
" | while IFS='|' read -r slug epic_id symlink enabled; do
    if [[ "$enabled" != "True" ]]; then
      log "Skipping $slug (scheduler not enabled)"
      continue
    fi

    STRATEGY_PATH="$GHQ/companies/$symlink/strategy.yaml"
    run_planner "$slug" "$STRATEGY_PATH" "$epic_id" "$EXTRA_LABELS" || {
      warn "Planner failed for $slug -- continuing with next company"
    }
  done

  log "All-companies planner complete"
  exit 0
fi
