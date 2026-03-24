#!/usr/bin/env bash
# gh-helper.sh — GitHub CLI wrapper with bd integration
# Usage: gh-helper.sh <subcommand> [options]
set -euo pipefail

COMPANY=""
BD_TASK=""

usage() {
  cat <<EOF
Usage: $(basename "$0") [options] <subcommand> [args]

GitHub CLI wrapper with bd cross-referencing.

Options:
  -c, --company SLUG     Company slug
  --bd-task TASK_ID      Beads task ID to cross-reference in PR/issue body
  -h, --help             Show this help

Subcommands:
  pr create [args]       Create a pull request
  pr list [args]         List pull requests
  pr view [number]       View a pull request
  pr merge [number]      Merge a pull request
  issue create [args]    Create an issue
  issue list [args]      List issues
  issue view [number]    View an issue
  run list               List CI workflow runs
  run view [id]          View a workflow run

Examples:
  $(basename "$0") pr create --title "feat: add auth" --body "Closes #42"
  $(basename "$0") --bd-task ghq-6 pr create --title "feat: new tool"
  $(basename "$0") pr list --state open
  $(basename "$0") issue create --title "Bug: login fails"
  $(basename "$0") issue list --label bug
EOF
  exit 0
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -c|--company)   COMPANY="$2"; shift 2 ;;
    --bd-task)      BD_TASK="$2"; shift 2 ;;
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

# For pr create, inject bd task reference into body if provided
inject_bd_ref() {
  local args=("$@")
  if [[ -n "$BD_TASK" ]]; then
    # Check if --body is already present; if not, append bd ref
    local has_body=false
    for arg in "${args[@]}"; do
      [[ "$arg" == "--body" || "$arg" == "-b" ]] && has_body=true
    done
    if [[ "$has_body" == false ]]; then
      args+=(--body "Beads task: $BD_TASK")
    else
      echo "Note: --body already provided; bd task ref not injected automatically." >&2
    fi
  fi
  echo "${args[@]}"
}

case "$SUBCOMMAND" in
  pr)
    ACTION="${1:-}"
    shift
    case "$ACTION" in
      create)
        if [[ -n "$BD_TASK" ]]; then
          # Check for existing --body flag
          HAS_BODY=false
          for arg in "$@"; do
            [[ "$arg" == "--body" || "$arg" == "-b" ]] && HAS_BODY=true
          done
          if [[ "$HAS_BODY" == false ]]; then
            gh pr create --body "Beads task: $BD_TASK" "$@"
          else
            gh pr create "$@"
          fi
        else
          gh pr create "$@"
        fi
        ;;
      list)   gh pr list "$@" ;;
      view)   gh pr view "$@" ;;
      merge)  gh pr merge "$@" ;;
      *)
        echo "Error: unknown pr action '$ACTION'." >&2
        exit 1
        ;;
    esac
    ;;
  issue)
    ACTION="${1:-}"
    shift
    case "$ACTION" in
      create)
        if [[ -n "$BD_TASK" ]]; then
          HAS_BODY=false
          for arg in "$@"; do
            [[ "$arg" == "--body" || "$arg" == "-b" ]] && HAS_BODY=true
          done
          if [[ "$HAS_BODY" == false ]]; then
            gh issue create --body "Beads task: $BD_TASK" "$@"
          else
            gh issue create "$@"
          fi
        else
          gh issue create "$@"
        fi
        ;;
      list)   gh issue list "$@" ;;
      view)   gh issue view "$@" ;;
      *)
        echo "Error: unknown issue action '$ACTION'." >&2
        exit 1
        ;;
    esac
    ;;
  run)
    ACTION="${1:-list}"
    shift || true
    case "$ACTION" in
      list)  gh run list "$@" ;;
      view)  gh run view "$@" ;;
      *)
        echo "Error: unknown run action '$ACTION'." >&2
        exit 1
        ;;
    esac
    ;;
  *)
    echo "Error: unknown subcommand '$SUBCOMMAND'." >&2
    echo "Run '$(basename "$0") --help' for usage." >&2
    exit 1
    ;;
esac
