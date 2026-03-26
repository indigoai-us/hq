#!/usr/bin/env bash
# git-helper.sh — Git workflow wrapper enforcing HQ conventions
# Usage: git-helper.sh <subcommand> [options]
set -euo pipefail

COMPANY=""

usage() {
  cat <<EOF
Usage: $(basename "$0") [options] <subcommand> [args]

Git workflow wrapper enforcing HQ conventions.

Options:
  -c, --company SLUG   Company slug (used to resolve project repos)
  -h, --help           Show this help

Subcommands:
  status               Show working tree status
  diff [args]          Show changes
  log [args]           Show commit history (oneline by default)
  branch [args]        List or manage branches
  commit -m <msg>      Commit staged changes with conventional message
  mv <src> <dst>       Move/rename files using git mv (never plain mv)
  push [args]          Push to remote

HQ Conventions:
  - Always use git mv for moves (never plain mv)
  - No absolute paths to repos; navigate via companies/{slug}/projects/

Examples:
  $(basename "$0") status
  $(basename "$0") diff --staged
  $(basename "$0") log --oneline -20
  $(basename "$0") commit -m "feat(auth): add OAuth2 support"
  $(basename "$0") mv old/path.sh new/path.sh
  $(basename "$0") push -u origin feature/my-branch
EOF
  exit 0
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -c|--company)  COMPANY="$2"; shift 2 ;;
    -h|--help)     usage ;;
    --)            shift; break ;;
    -*)            echo "Unknown option: $1" >&2; exit 1 ;;
    *)             break ;;
  esac
done

SUBCOMMAND="${1:-}"
if [[ -z "$SUBCOMMAND" ]]; then
  echo "Error: subcommand is required." >&2
  echo "Run '$(basename "$0") --help' for usage." >&2
  exit 1
fi
shift

case "$SUBCOMMAND" in
  status)
    git status "$@"
    ;;
  diff)
    git diff "$@"
    ;;
  log)
    if [[ $# -eq 0 ]]; then
      git log --oneline -20
    else
      git log "$@"
    fi
    ;;
  branch)
    git branch "$@"
    ;;
  commit)
    git commit "$@"
    ;;
  mv)
    if [[ $# -lt 2 ]]; then
      echo "Error: git-helper mv requires <src> and <dst>." >&2
      exit 1
    fi
    git mv "$@"
    ;;
  push)
    git push "$@"
    ;;
  *)
    echo "Error: unknown subcommand '$SUBCOMMAND'." >&2
    echo "Run '$(basename "$0") --help' for usage." >&2
    exit 1
    ;;
esac
