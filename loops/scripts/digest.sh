#!/usr/bin/env bash
# digest.sh -- Daily digest generator for GHQ autonomous scheduler
#
# Generates a markdown digest at loops/digests/YYYY-MM-DD.md.
# Reads bd state across all enabled companies from manifest.yaml.
#
# Sections:
#   - Completed tasks (closed today)
#   - In-progress tasks
#   - Blocked / failed tasks
#   - Drafts needing review (wisps/escalations)
#   - Pending decisions (with bd-resolve commands)
#
# Usage:
#   digest.sh                     # Generate today's digest
#   digest.sh --date YYYY-MM-DD   # Generate digest for a specific date
#   digest.sh --dry-run            # Print to stdout, don't write file
#   digest.sh --help               # Show usage
#
# Environment:
#   GHQ_ROOT    Override GHQ root directory (default: auto-detected)
#   BD_CMD      Override bd command path (default: "bd")
#
# Designed to be invoked by the scheduler at end-of-day (configurable
# via digest_hour in scheduler.yaml).
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
DIGESTS_DIR="$GHQ/loops/digests"
LOG_PREFIX="[digest]"
BD="${BD_CMD:-bd}"
DRY_RUN=false
DIGEST_DATE=""

# ─────────────────────────────────────────────────
# Usage
# ─────────────────────────────────────────────────
usage() {
  cat <<'EOF'
Usage: digest.sh [--date YYYY-MM-DD] [--dry-run] [--help]

Options:
  --date YYYY-MM-DD   Generate digest for a specific date (default: today)
  --dry-run           Print digest to stdout without writing file
  --help              Show this help

Environment:
  GHQ_ROOT    Override GHQ root directory
  BD_CMD      Override bd command path
EOF
}

# ─────────────────────────────────────────────────
# Logging
# ─────────────────────────────────────────────────
log()  { echo "$LOG_PREFIX $(date -u +%H:%M:%S) $*" >&2; }
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
    --date)
      if [[ -z "${2:-}" ]]; then
        err "Missing date value for --date"
        usage
        exit 1
      fi
      DIGEST_DATE="$2"
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

# Default date is today
if [[ -z "$DIGEST_DATE" ]]; then
  DIGEST_DATE=$(date +%Y-%m-%d)
fi

# ─────────────────────────────────────────────────
# Validate configuration
# ─────────────────────────────────────────────────
if [[ ! -f "$MANIFEST" ]]; then
  err "Manifest not found: $MANIFEST"
  exit 2
fi

# ─────────────────────────────────────────────────
# Parse manifest for enabled companies
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
        'epic': config.get('epic', '')
    })

print(json.dumps(companies))
" "$MANIFEST") || { err "Failed to parse manifest.yaml"; exit 2; }

# ─────────────────────────────────────────────────
# Count enabled companies
# ─────────────────────────────────────────────────
ENABLED_COUNT=$(echo "$COMPANIES_JSON" | python3 -c "
import json, sys
companies = json.loads(sys.stdin.read())
print(sum(1 for c in companies if c['enabled']))
")

# ─────────────────────────────────────────────────
# Collect digest data per company
# ─────────────────────────────────────────────────
collect_company_data() {
  local slug="$1"
  local epic="$2"

  python3 -c "
import json, sys, subprocess

bd = sys.argv[1]
epic = sys.argv[2]
slug = sys.argv[3]
digest_date = sys.argv[4]

def run_bd(args):
    try:
        result = subprocess.run(
            [bd] + args,
            capture_output=True, text=True, timeout=30
        )
        if result.returncode == 0 and result.stdout.strip():
            return json.loads(result.stdout.strip())
    except Exception:
        pass
    return []

# Closed tasks (completed)
closed = run_bd(['list', '--parent', epic, '--status', 'closed', '--json', '-n', '0', '--all'])

# Filter to tasks closed on the digest date
completed_today = []
for t in closed:
    closed_at = t.get('closed_at', '')
    if closed_at.startswith(digest_date):
        completed_today.append(t)

# In-progress tasks
in_progress = run_bd(['list', '--parent', epic, '--status', 'in_progress', '--json', '-n', '0'])

# Blocked tasks
blocked = run_bd(['blocked', '--parent', epic, '--json'])

# Open decisions
all_decisions = run_bd(['list', '-t', 'decision', '--status', 'open', '--json', '-n', '0'])
company_decisions = [d for d in all_decisions if slug in d.get('labels', [])]

# Open tasks (pending)
open_tasks = run_bd(['list', '--parent', epic, '--status', 'open', '--json', '-n', '0'])

result = {
    'slug': slug,
    'epic': epic,
    'completed': completed_today,
    'in_progress': in_progress,
    'blocked': blocked,
    'decisions': company_decisions,
    'open': open_tasks
}

print(json.dumps(result))
" "$BD" "$epic" "$slug" "$DIGEST_DATE"
}

# ─────────────────────────────────────────────────
# Generate markdown
# ─────────────────────────────────────────────────
generate_markdown() {
  local all_data="$1"

  python3 -c "
import json, sys

digest_date = sys.argv[1]
all_data = json.loads(sys.argv[2])

lines = []
lines.append(f'# Daily Digest -- {digest_date}')
lines.append('')
lines.append('> Auto-generated by GHQ scheduler. Scan time: ~2 min.')
lines.append('')

# Summary counts
total_completed = sum(len(d['completed']) for d in all_data)
total_in_progress = sum(len(d['in_progress']) for d in all_data)
total_blocked = sum(len(d['blocked']) for d in all_data)
total_decisions = sum(len(d['decisions']) for d in all_data)
total_open = sum(len(d['open']) for d in all_data)

lines.append('## Summary')
lines.append('')
lines.append(f'| Metric | Count |')
lines.append(f'|--------|-------|')
lines.append(f'| Completed today | {total_completed} |')
lines.append(f'| In progress | {total_in_progress} |')
lines.append(f'| Blocked | {total_blocked} |')
lines.append(f'| Pending decisions | {total_decisions} |')
lines.append(f'| Open (backlog) | {total_open} |')
lines.append('')

# Per-company sections
for company_data in all_data:
    slug = company_data['slug']
    lines.append(f'---')
    lines.append('')
    lines.append(f'## {slug}')
    lines.append('')

    # Completed
    completed = company_data['completed']
    if completed:
        lines.append('### Completed')
        lines.append('')
        for t in completed:
            tid = t.get('id', '?')
            title = t.get('title', '?')
            lines.append(f'- [x] **{tid}** {title}')
        lines.append('')
    else:
        lines.append('### Completed')
        lines.append('')
        lines.append('_No tasks completed today._')
        lines.append('')

    # In-progress
    in_progress = company_data['in_progress']
    if in_progress:
        lines.append('### In Progress')
        lines.append('')
        for t in in_progress:
            tid = t.get('id', '?')
            title = t.get('title', '?')
            priority = t.get('priority', '?')
            lines.append(f'- [ ] **{tid}** {title} (P{priority})')
        lines.append('')
    else:
        lines.append('### In Progress')
        lines.append('')
        lines.append('_No tasks in progress._')
        lines.append('')

    # Blocked
    blocked = company_data['blocked']
    if blocked:
        lines.append('### Blocked')
        lines.append('')
        for t in blocked:
            tid = t.get('id', '?')
            title = t.get('title', '?')
            blocked_by = t.get('blocked_by', [])
            reason = ', '.join(blocked_by) if blocked_by else 'unknown dependency'
            lines.append(f'- **{tid}** {title}')
            lines.append(f'  - Blocked by: {reason}')
        lines.append('')

    # Pending decisions
    decisions = company_data['decisions']
    if decisions:
        lines.append('### Pending Decisions')
        lines.append('')
        for d in decisions:
            did = d.get('id', '?')
            dtitle = d.get('title', '?')
            desc = d.get('description', '')
            context = desc[:120] + '...' if len(desc) > 120 else desc
            lines.append(f'- **{did}** {dtitle}')
            if context:
                lines.append(f'  - Context: {context}')
            lines.append(f'  - Resolve: \`bd-resolve {did} --answer \"<your decision>\"\`')
        lines.append('')

    # Open backlog (brief)
    open_tasks = company_data['open']
    if open_tasks:
        lines.append('### Open Backlog')
        lines.append('')
        for t in open_tasks[:5]:
            tid = t.get('id', '?')
            title = t.get('title', '?')
            priority = t.get('priority', '?')
            lines.append(f'- **{tid}** {title} (P{priority})')
        remaining = len(open_tasks) - 5
        if remaining > 0:
            lines.append(f'- _...and {remaining} more_')
        lines.append('')

lines.append('---')
lines.append(f'_Generated: {digest_date}_')

print('\n'.join(lines))
" "$DIGEST_DATE" "$all_data"
}

# ─────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────
log "Generating digest for $DIGEST_DATE"

if [[ "$ENABLED_COUNT" -eq 0 ]]; then
  log "No enabled companies found. Generating minimal digest."
  MARKDOWN="# Daily Digest -- $DIGEST_DATE

> Auto-generated by GHQ scheduler.

No enabled companies found in manifest.
"
  if $DRY_RUN; then
    echo "$MARKDOWN"
    log "[dry-run] Digest printed to stdout"
    exit 0
  fi

  mkdir -p "$DIGESTS_DIR"
  DIGEST_FILE="$DIGESTS_DIR/$DIGEST_DATE.md"
  echo "$MARKDOWN" > "$DIGEST_FILE"
  log "Digest written to $DIGEST_FILE"
  exit 0
fi

# Collect data for each enabled company
ALL_COMPANY_DATA="["
FIRST=true

while IFS= read -r company_entry; do
  slug=$(echo "$company_entry" | jq -r '.slug')
  enabled=$(echo "$company_entry" | jq -r '.enabled')
  epic=$(echo "$company_entry" | jq -r '.epic')

  # Skip disabled companies
  if [[ "$enabled" != "true" ]]; then
    log "Skipping $slug (scheduler.enabled: false)"
    continue
  fi

  log "Collecting data for $slug (epic: $epic)"
  company_data=$(collect_company_data "$slug" "$epic") || {
    warn "Failed to collect data for $slug, skipping"
    continue
  }

  if $FIRST; then
    ALL_COMPANY_DATA="$ALL_COMPANY_DATA$company_data"
    FIRST=false
  else
    ALL_COMPANY_DATA="$ALL_COMPANY_DATA,$company_data"
  fi
done < <(echo "$COMPANIES_JSON" | jq -c '.[]')

ALL_COMPANY_DATA="$ALL_COMPANY_DATA]"

# Generate markdown
MARKDOWN=$(generate_markdown "$ALL_COMPANY_DATA")

if $DRY_RUN; then
  echo "$MARKDOWN"
  log "[dry-run] Digest printed to stdout"
  exit 0
fi

# Write to file
mkdir -p "$DIGESTS_DIR"
DIGEST_FILE="$DIGESTS_DIR/$DIGEST_DATE.md"
echo "$MARKDOWN" > "$DIGEST_FILE"
log "Digest written to $DIGEST_FILE"
log "Done."
