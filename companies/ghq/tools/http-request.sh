#!/usr/bin/env bash
# http-request.sh — HTTP request wrapper with JSON defaults
# Usage: http-request.sh [options] <url>
set -euo pipefail

COMPANY=""
METHOD="GET"
AUTH_HEADER=""
DATA=""
RAW=false
EXTRA_HEADERS=()

usage() {
  cat <<EOF
Usage: $(basename "$0") [options] <url>

HTTP request wrapper. Defaults to JSON content-type and pipes through jq.

Options:
  -c, --company SLUG       Company slug (loads company-specific API tokens)
  -X, --method METHOD      HTTP method (default: GET)
  -d, --data DATA          Request body (JSON string or @file)
  -H, --header HEADER      Extra header (can be repeated)
  --auth TOKEN             Bearer token for Authorization header
  --raw                    Skip jq formatting (print raw response)
  -h, --help               Show this help

Examples:
  $(basename "$0") https://api.example.com/users
  $(basename "$0") -X POST -d '{"name":"test"}' https://api.example.com/users
  $(basename "$0") --auth "\$MY_TOKEN" https://api.example.com/me
  $(basename "$0") -H "X-Custom: value" https://api.example.com/data
  $(basename "$0") --raw https://api.example.com/text-endpoint
EOF
  exit 0
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -c|--company)   COMPANY="$2"; shift 2 ;;
    -X|--method)    METHOD="$2"; shift 2 ;;
    -d|--data)      DATA="$2"; shift 2 ;;
    -H|--header)    EXTRA_HEADERS+=("$2"); shift 2 ;;
    --auth)         AUTH_HEADER="$2"; shift 2 ;;
    --raw)          RAW=true; shift ;;
    -h|--help)      usage ;;
    --)             shift; break ;;
    -*)             echo "Unknown option: $1" >&2; exit 1 ;;
    *)              break ;;
  esac
done

URL="${1:-}"
if [[ -z "$URL" ]]; then
  echo "Error: URL is required." >&2
  echo "Run '$(basename "$0") --help' for usage." >&2
  exit 1
fi

CURL_ARGS=(-s -X "$METHOD")
CURL_ARGS+=(-H "Content-Type: application/json")
CURL_ARGS+=(-H "Accept: application/json")

if [[ -n "$AUTH_HEADER" ]]; then
  CURL_ARGS+=(-H "Authorization: Bearer $AUTH_HEADER")
fi

for header in "${EXTRA_HEADERS[@]:-}"; do
  CURL_ARGS+=(-H "$header")
done

if [[ -n "$DATA" ]]; then
  CURL_ARGS+=(-d "$DATA")
fi

CURL_ARGS+=("$URL")

if [[ "$RAW" == true ]]; then
  curl "${CURL_ARGS[@]}"
else
  curl "${CURL_ARGS[@]}" | jq .
fi
