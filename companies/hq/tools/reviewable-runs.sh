#!/usr/bin/env bash
# reviewable-runs.sh — List agent runs eligible for review
# Outputs run IDs (one per line, oldest first) where status is done/error
# and no reviewed.json exists.
#
# Usage: reviewable-runs.sh [-n max]
set -euo pipefail

MAX=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    -n) MAX="$2"; shift 2 ;;
    -h|--help)
      printf 'Usage: reviewable-runs.sh [-n max]\n'
      printf 'Lists agent run IDs eligible for review (done/error, not yet reviewed).\n'
      exit 0
      ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

REPO_ROOT="$(git rev-parse --show-toplevel)"
RUNS_DIR="$REPO_ROOT/.agents/runs"

if [[ ! -d "$RUNS_DIR" ]]; then
  exit 0
fi

COUNT=0
for run_dir in "$RUNS_DIR"/*/; do
  [[ -d "$run_dir" ]] || continue

  # Skip if already reviewed
  [[ -f "$run_dir/reviewed.json" ]] && continue

  # Skip if no status file
  [[ -f "$run_dir/status" ]] || continue

  status="$(cat "$run_dir/status")"
  if [[ "$status" == "done" || "$status" == "error" ]]; then
    basename "$run_dir"
    COUNT=$((COUNT + 1))
    if [[ "$MAX" -gt 0 && "$COUNT" -ge "$MAX" ]]; then
      break
    fi
  fi
done
