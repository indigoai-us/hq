#!/usr/bin/env bash
# python-runner.sh — Python runner wrapper with venv awareness
# Usage: python-runner.sh [options] <subcommand> [args]
set -euo pipefail

COMPANY=""
TARGET_DIR="."
VENV_NAME=".venv"

usage() {
  cat <<EOF
Usage: $(basename "$0") [options] <subcommand> [args]

Python runner with automatic venv detection and activation.

Options:
  -c, --company SLUG     Company slug
  --dir PATH             Directory to run commands in (default: current dir)
  --venv NAME            Venv directory name (default: .venv)
  -h, --help             Show this help

Subcommands:
  run <script> [args]    Run a Python script (activates venv if found)
  pip install [packages] Install packages into venv
  pip list               List installed packages
  venv create            Create a new venv
  exec <cmd> [args]      Run a command inside the venv's bin/
  info                   Show Python version and venv status

Venv detection: looks for .venv, venv, env in the target directory.

Examples:
  $(basename "$0") run main.py
  $(basename "$0") run script.py --arg value
  $(basename "$0") pip install requests pandas
  $(basename "$0") venv create
  $(basename "$0") exec pytest tests/
  $(basename "$0") --dir ./my-project run app.py
EOF
  exit 0
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -c|--company)   COMPANY="$2"; shift 2 ;;
    --dir)          TARGET_DIR="$2"; shift 2 ;;
    --venv)         VENV_NAME="$2"; shift 2 ;;
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

# Find venv directory
find_venv() {
  local dir="$1"
  for candidate in "$VENV_NAME" ".venv" "venv" "env"; do
    if [[ -f "$dir/$candidate/bin/python" ]]; then
      echo "$dir/$candidate"
      return
    fi
  done
  echo ""
}

VENV_DIR="$(find_venv "$TARGET_DIR")"

get_python() {
  if [[ -n "$VENV_DIR" ]]; then
    echo "$VENV_DIR/bin/python"
  else
    command -v python3 2>/dev/null || command -v python 2>/dev/null || echo "python3"
  fi
}

get_pip() {
  if [[ -n "$VENV_DIR" ]]; then
    echo "$VENV_DIR/bin/pip"
  else
    command -v pip3 2>/dev/null || command -v pip 2>/dev/null || echo "pip3"
  fi
}

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
    PYTHON="$(get_python)"
    run_in_dir "$PYTHON" "$SCRIPT" "$@"
    ;;
  pip)
    PIP="$(get_pip)"
    run_in_dir "$PIP" "$@"
    ;;
  venv)
    ACTION="${1:-create}"
    shift || true
    case "$ACTION" in
      create)
        run_in_dir python3 -m venv "$VENV_NAME"
        echo "Venv created at $TARGET_DIR/$VENV_NAME"
        ;;
      *)
        echo "Error: unknown venv action '$ACTION'." >&2
        exit 1
        ;;
    esac
    ;;
  exec)
    CMD="${1:-}"
    if [[ -z "$CMD" ]]; then
      echo "Error: exec requires a command." >&2
      exit 1
    fi
    shift
    if [[ -n "$VENV_DIR" ]]; then
      run_in_dir "$VENV_DIR/bin/$CMD" "$@"
    else
      run_in_dir "$CMD" "$@"
    fi
    ;;
  info)
    PYTHON="$(get_python)"
    echo "Python: $PYTHON"
    echo "Version: $("$PYTHON" --version 2>&1)"
    if [[ -n "$VENV_DIR" ]]; then
      echo "Venv: $VENV_DIR (active)"
    else
      echo "Venv: none found in $TARGET_DIR"
    fi
    ;;
  *)
    echo "Error: unknown subcommand '$SUBCOMMAND'." >&2
    echo "Run '$(basename "$0") --help' for usage." >&2
    exit 1
    ;;
esac
