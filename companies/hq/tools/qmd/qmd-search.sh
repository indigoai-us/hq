#!/usr/bin/env bash
# qmd-search.sh — Knowledge search wrapper for qmd
# Usage: qmd-search.sh [options] <query>
set -euo pipefail

COMPANY=""
SEARCH_TYPE="hybrid"
COUNT=10

usage() {
  cat <<EOF
Usage: $(basename "$0") [options] <query>

Search the knowledge base using qmd.

Options:
  -c, --company SLUG        Company slug (scopes search to company collection)
  --type bm25|vector|hybrid Search type (default: hybrid)
  -n, --count N             Number of results (default: 10)
  -h, --help                Show this help

Examples:
  $(basename "$0") "agent patterns"
  $(basename "$0") -c acme --type vector "authentication flow"
  $(basename "$0") -c hq -n 5 "knowledge pipeline"
EOF
  exit 0
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -c|--company)  COMPANY="$2"; shift 2 ;;
    --type)        SEARCH_TYPE="$2"; shift 2 ;;
    -n|--count)    COUNT="$2"; shift 2 ;;
    -h|--help)     usage ;;
    --)            shift; break ;;
    -*)            echo "Unknown option: $1" >&2; exit 1 ;;
    *)             break ;;
  esac
done

QUERY="${*:-}"
if [[ -z "$QUERY" ]]; then
  echo "Error: query is required." >&2
  echo "Run '$(basename "$0") --help' for usage." >&2
  exit 1
fi

if [[ "$COUNT" -lt 1 || "$COUNT" -gt 100 ]] 2>/dev/null; then
  echo "Error: --count must be between 1 and 100." >&2
  exit 1
fi

COMPANY_ARGS=()
if [[ -n "$COMPANY" ]]; then
  COMPANY_ARGS=(-c "$COMPANY")
fi

case "$SEARCH_TYPE" in
  bm25)   CMD="search" ;;
  vector) CMD="vsearch" ;;
  hybrid) CMD="query" ;;
  *)
    echo "Error: --type must be bm25, vector, or hybrid." >&2
    exit 1
    ;;
esac

qmd "$CMD" "$QUERY" -n "$COUNT" "${COMPANY_ARGS[@]}"
