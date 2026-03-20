#!/usr/bin/env bash
# tag-inventory.sh — Show frequency-ranked tag vocabulary from the knowledge base
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

grep -rh "^tags:" knowledge/ --include="*.md" \
  | sed 's/^tags: //' \
  | tr -d '[]"' \
  | tr ',' '\n' \
  | sed 's/^ *//;s/ *$//' \
  | sort | uniq -c | sort -rn
