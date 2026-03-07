#!/usr/bin/env bash
# query-tree.sh — Query the knowledge tree by domain and optional category
# Usage:
#   query-tree.sh <domain> [category]   — show entries for domain/category
#   query-tree.sh --domains             — list all domains
#   query-tree.sh --stats               — show statistics
#
# Examples:
#   query-tree.sh integrations
#   query-tree.sh hq-core ui-specs
#   query-tree.sh companies/hollermgmt engineering

set -eo pipefail

HQ_ROOT="${HQ_ROOT:-C:/hq}"
ENTRIES_CACHE="$HQ_ROOT/knowledge/.knowledge-tree-entries.tsv"

if [[ ! -f "$ENTRIES_CACHE" ]]; then
  echo "Knowledge tree cache not found. Run: bash scripts/build-knowledge-tree.sh"
  exit 1
fi

###############################################################################
# Commands
###############################################################################

usage() {
  echo "Usage: query-tree.sh [--domains|--stats] <domain> [category]"
  echo ""
  echo "Options:"
  echo "  --domains    List all domains with entry counts"
  echo "  --stats      Show confidence distribution and domain stats"
  echo ""
  echo "Examples:"
  echo "  query-tree.sh integrations"
  echo "  query-tree.sh hq-core ui-specs"
  echo "  query-tree.sh companies/hollermgmt engineering"
}

list_domains() {
  echo "Knowledge Tree Domains:"
  echo ""
  awk -F'\t' '
  { d_count[$1]++ }
  END {
    for (d in d_count) {
      printf "  %-35s %3d entries\n", d, d_count[d]
    }
  }
  ' "$ENTRIES_CACHE" | sort
}

show_stats() {
  echo "Knowledge Tree Statistics"
  echo "========================="
  echo ""
  awk -F'\t' '
  BEGIN { total=0; high=0; med=0; low=0; none_c=0 }
  {
    total++
    d_count[$1]++
    conf = $5
    if (conf == "none" || conf == "") none_c++
    else if (conf+0 >= 0.8) high++
    else if (conf+0 >= 0.5) med++
    else low++
  }
  END {
    printf "Total entries: %d\n\n", total
    printf "By domain:\n"
    for (d in d_count) {
      printf "  %-35s %3d entries\n", d, d_count[d]
    }
    printf "\nConfidence distribution:\n"
    printf "  High (>=0.8):   %d\n", high
    printf "  Medium (0.5-0.79): %d\n", med
    printf "  Low (<0.5):     %d\n", low
    printf "  No score:       %d\n", none_c
  }
  ' "$ENTRIES_CACHE"
}

query_domain() {
  local domain="$1"
  local category="${2:-}"

  local pattern
  if [[ -n "$category" ]]; then
    pattern="^${domain}	${category}	"
  else
    pattern="^${domain}	"
  fi

  local matches
  matches=$(grep "$pattern" "$ENTRIES_CACHE" 2>/dev/null || true)

  if [[ -z "$matches" ]]; then
    echo "No entries found for domain='${domain}'${category:+ category='${category}'}"
    echo ""
    echo "Available domains:"
    cut -f1 "$ENTRIES_CACHE" | sort -u | sed 's/^/  /'
    exit 1
  fi

  local count
  count=$(echo "$matches" | wc -l | tr -d ' ')

  if [[ -n "$category" ]]; then
    echo "== ${domain} / ${category} (${count} entries) =="
  else
    echo "== ${domain} (${count} entries) =="
  fi
  echo ""

  echo "$matches" | awk -F'\t' '{
    conf = $5
    badge = "?"
    if (conf != "none" && conf != "") {
      if (conf+0 >= 0.8) badge = "H"
      else if (conf+0 >= 0.5) badge = "M"
      else badge = "L"
    }
    printf "  [%s] %-55s %s\n", badge, $3, $4
  }'

  # Show categories if no category filter
  if [[ -z "$category" ]]; then
    echo ""
    echo "Categories:"
    echo "$matches" | cut -f2 | sort | uniq -c | sort -rn | while read -r cnt cat; do
      echo "  ${cat} (${cnt})"
    done
  fi
}

###############################################################################
# Main
###############################################################################

if [[ $# -eq 0 ]]; then
  usage
  exit 0
fi

case "$1" in
  --domains) list_domains ;;
  --stats) show_stats ;;
  --help|-h) usage ;;
  *) query_domain "$1" "${2:-}" ;;
esac
