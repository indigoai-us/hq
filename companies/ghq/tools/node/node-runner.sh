#!/usr/bin/env bash
# node-runner.sh — Node/npm/bun runner wrapper
# Usage: node-runner.sh [options] <subcommand> [args]
set -euo pipefail

COMPANY=""
TARGET_DIR="."

usage() {
  cat <<EOF
Usage: $(basename "$0") [options] <subcommand> [args]

Node/npm/bun runner. Detects package manager automatically.

Options:
  -c, --company SLUG     Company slug
  --dir PATH             Directory to run commands in (default: current dir)
  -h, --help             Show this help

Subcommands:
  run <script> [args]    Run a package.json script
  install [packages]     Install dependencies (or specific packages)
  exec <cmd> [args]      Execute a binary via npx/bunx
  test [args]            Run tests
  build [args]           Run build script
  info                   Show detected package manager and node version

Package manager detection order: bun → pnpm → npm

Examples:
  $(basename "$0") run dev
  $(basename "$0") install
  $(basename "$0") install lodash
  $(basename "$0") exec ts-node script.ts
  $(basename "$0") test --watch
  $(basename "$0") --dir ./my-project run build
EOF
  exit 0
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -c|--company)   COMPANY="$2"; shift 2 ;;
    --dir)          TARGET_DIR="$2"; shift 2 ;;
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

# Detect package manager
detect_pm() {
  local dir="${1:-.}"
  if [[ -f "$dir/bun.lockb" ]] || command -v bun &>/dev/null && [[ -f "$dir/package.json" ]]; then
    if [[ -f "$dir/bun.lockb" ]]; then echo "bun"; return; fi
  fi
  if [[ -f "$dir/pnpm-lock.yaml" ]]; then echo "pnpm"; return; fi
  echo "npm"
}

PM="$(detect_pm "$TARGET_DIR")"

run_in_dir() {
  (builtin cd "$TARGET_DIR" && "$@")
}

case "$SUBCOMMAND" in
  run)
    SCRIPT="${1:-}"
    if [[ -z "$SCRIPT" ]]; then
      echo "Error: run requires a script name." >&2
      exit 1
    fi
    shift
    run_in_dir "$PM" run "$SCRIPT" "$@"
    ;;
  install)
    run_in_dir "$PM" install "$@"
    ;;
  exec)
    CMD="${1:-}"
    if [[ -z "$CMD" ]]; then
      echo "Error: exec requires a command." >&2
      exit 1
    fi
    shift
    case "$PM" in
      bun)  run_in_dir bunx "$CMD" "$@" ;;
      pnpm) run_in_dir pnpm dlx "$CMD" "$@" ;;
      npm)  run_in_dir npx "$CMD" "$@" ;;
    esac
    ;;
  test)
    run_in_dir "$PM" test "$@"
    ;;
  build)
    run_in_dir "$PM" run build "$@"
    ;;
  info)
    echo "Package manager: $PM"
    echo "Node version: $(node --version 2>/dev/null || echo 'not found')"
    if command -v bun &>/dev/null; then
      echo "Bun version: $(bun --version)"
    fi
    ;;
  *)
    echo "Error: unknown subcommand '$SUBCOMMAND'." >&2
    echo "Run '$(basename "$0") --help' for usage." >&2
    exit 1
    ;;
esac
