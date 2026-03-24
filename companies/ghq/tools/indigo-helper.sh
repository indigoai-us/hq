#!/usr/bin/env bash
# indigo-helper.sh — Indigo CLI wrapper with ergonomic defaults
# Usage: indigo-helper.sh [options] <subcommand> [args]
set -euo pipefail

COMPANY=""

usage() {
  cat <<EOF
Usage: $(basename "$0") [options] <subcommand> [args]

Indigo CLI wrapper with ergonomic defaults.

Options:
  -c, --company SLUG     Company slug (scopes operations to company context)
  -h, --help             Show this help

Subcommands:
  query <collection> [filter]  Query a collection
  list [collection]            List collections or documents
  get <collection> <id>        Get a document by ID
  raw [args]                   Pass arguments directly to indigo CLI

Examples:
  $(basename "$0") list
  $(basename "$0") -c acme query signals
  $(basename "$0") get meetings abc123
  $(basename "$0") raw --help
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

COMPANY_ARGS=()
if [[ -n "$COMPANY" ]]; then
  COMPANY_ARGS=(--company "$COMPANY")
fi

case "$SUBCOMMAND" in
  query)
    COLLECTION="${1:-}"
    if [[ -z "$COLLECTION" ]]; then
      echo "Error: query requires a collection name." >&2
      exit 1
    fi
    shift
    indigo query "$COLLECTION" "${COMPANY_ARGS[@]}" "$@"
    ;;
  list)
    indigo list "${COMPANY_ARGS[@]}" "$@"
    ;;
  get)
    COLLECTION="${1:-}"
    ID="${2:-}"
    if [[ -z "$COLLECTION" || -z "$ID" ]]; then
      echo "Error: get requires <collection> and <id>." >&2
      exit 1
    fi
    indigo get "$COLLECTION" "$ID" "${COMPANY_ARGS[@]}"
    ;;
  raw)
    indigo "$@"
    ;;
  *)
    echo "Error: unknown subcommand '$SUBCOMMAND'." >&2
    echo "Run '$(basename "$0") --help' for usage." >&2
    exit 1
    ;;
esac
