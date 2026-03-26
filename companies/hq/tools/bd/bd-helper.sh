#!/usr/bin/env bash
# bd-helper.sh — Beads issue tracker wrapper
# Usage: bd-helper.sh [options] <subcommand> [args]
set -euo pipefail

COMPANY="hq"
REPO_ROOT="$(git rev-parse --show-toplevel)"

usage() {
  cat <<EOF
Usage: $(basename "$0") [options] <subcommand> [args]

Beads issue tracker wrapper. Always runs bd from the correct company folder.

Options:
  -c, --company SLUG     Company slug (default: hq)
  -h, --help             Show this help

Subcommands:
  show <id>              Show task details
  list [args]            List tasks (pass bd filter args)
  create [args]          Create a new task
  close <id>             Close/complete a task
  children <id>          Show child tasks
  ready <id>             Show ready tasks in dependency order
  comments add <id> <msg> Add a comment to a task

Examples:
  $(basename "$0") show hq-5
  $(basename "$0") list --status open
  $(basename "$0") -c acme create --title "Fix login bug"
  $(basename "$0") close hq-5.1
  $(basename "$0") children hq-5
  $(basename "$0") comments add hq-5 "PR ready: https://github.com/..."
EOF
  exit 0
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -c|--company)   COMPANY="$2"; shift 2 ;;
    -h|--help)      usage ;;
    --)             shift; break ;;
    -*)             echo "Unknown option: $1" >&2; exit 1 ;;
    *)              break ;;
  esac
done

SUBCOMMAND="${1:-}"
if [[ -z "$SUBCOMMAND" ]]; then
  echo "Error: subcommand is required." >&2
  echo "Run '$(basename "$0") --help' for usage." >&2
  exit 1
fi
shift

COMPANY_DIR="$REPO_ROOT/companies/$COMPANY"
if [[ ! -d "$COMPANY_DIR" ]]; then
  echo "Error: company directory not found: $COMPANY_DIR" >&2
  exit 1
fi

run_bd() {
  (builtin cd "$COMPANY_DIR" && bd "$@")
}

case "$SUBCOMMAND" in
  show)
    ID="${1:-}"
    if [[ -z "$ID" ]]; then
      echo "Error: show requires a task ID." >&2
      exit 1
    fi
    run_bd show "$ID"
    ;;
  list)
    run_bd list "$@"
    ;;
  create)
    run_bd create "$@"
    ;;
  close)
    ID="${1:-}"
    if [[ -z "$ID" ]]; then
      echo "Error: close requires a task ID." >&2
      exit 1
    fi
    run_bd close "$ID"
    ;;
  children)
    ID="${1:-}"
    if [[ -z "$ID" ]]; then
      echo "Error: children requires a task ID." >&2
      exit 1
    fi
    run_bd children "${@:-$ID}"
    ;;
  ready)
    ID="${1:-}"
    if [[ -z "$ID" ]]; then
      echo "Error: ready requires a task ID." >&2
      exit 1
    fi
    run_bd ready --mol "$ID"
    ;;
  comments)
    run_bd comments "$@"
    ;;
  *)
    echo "Error: unknown subcommand '$SUBCOMMAND'." >&2
    echo "Run '$(basename "$0") --help' for usage." >&2
    exit 1
    ;;
esac
