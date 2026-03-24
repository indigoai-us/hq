#!/usr/bin/env bash
# report_issue.sh — Create a bd issue with duplicate detection
# Uses the report-issue formula (investigate → implement → human-review gate)
#
# Usage: report_issue.sh <title> [-d description] [-p priority] [-l labels]
# Exit codes: 0 = created, 1 = duplicate found, 2 = usage error
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BEADS_DIR="$SCRIPT_DIR/../.beads"

TITLE=""
DESCRIPTION=""
PRIORITY="2"
LABELS=""

# Parse args
while [[ $# -gt 0 ]]; do
  case "$1" in
    -d) DESCRIPTION="$2"; shift 2 ;;
    -p) PRIORITY="$2"; shift 2 ;;
    -l) LABELS="$2"; shift 2 ;;
    -h|--help)
      printf 'Usage: report_issue.sh <title> [-d description] [-p priority] [-l labels]\n'
      printf 'Creates a bd molecule from the report-issue formula.\n'
      printf 'Steps: investigate → implement → human-review (gate)\n'
      exit 0
      ;;
    -*) printf 'Unknown flag: %s\n' "$1" >&2; exit 2 ;;
    *)
      if [ -z "$TITLE" ]; then
        TITLE="$1"
      else
        printf 'Unexpected argument: %s\n' "$1" >&2; exit 2
      fi
      shift
      ;;
  esac
done

if [ -z "$TITLE" ]; then
  printf 'Usage: report_issue.sh <title> [-d description] [-p priority] [-l labels]\n' >&2
  exit 2
fi

# --- Duplicate detection ---
# Strip run IDs and prefixes for a broader search
STRIPPED_TITLE=$(echo "$TITLE" \
  | sed -E 's/[0-9]{8}_[0-9]{6}_[a-z0-9]{4}//g' \
  | sed -E 's/\([[:space:]]*\)//g' \
  | sed -E 's/^agent-review:[[:space:]]*//' \
  | sed -E 's/[[:space:]]+/ /g' \
  | sed 's/^ *//;s/ *$//')

# Search with both original and stripped title to catch more matches
SEARCH_RESULTS=$(cd "$SCRIPT_DIR/.." && bd search "$TITLE" --status all --json 2>/dev/null || echo "[]")
if [ -n "$STRIPPED_TITLE" ] && [ "$STRIPPED_TITLE" != "$TITLE" ]; then
  EXTRA_RESULTS=$(cd "$SCRIPT_DIR/.." && bd search "$STRIPPED_TITLE" --status all --json 2>/dev/null || echo "[]")
  # Merge results (python dedupes by id)
  SEARCH_RESULTS=$(python3 -c "
import sys, json
a = json.loads(sys.argv[1])
b = json.loads(sys.argv[2])
items_a = a if isinstance(a, list) else a.get('issues', a.get('results', []))
items_b = b if isinstance(b, list) else b.get('issues', b.get('results', []))
seen = set()
merged = []
for item in items_a + items_b:
    iid = item.get('id', '')
    if iid not in seen:
        seen.add(iid)
        merged.append(item)
print(json.dumps(merged))
" "$SEARCH_RESULTS" "$EXTRA_RESULTS" 2>/dev/null || echo "$SEARCH_RESULTS")
fi

# Normalize text to lowercase words for comparison
# Strips agent run IDs (YYYYMMDD_HHMMSS_xxxx) and mol IDs (ghq-mol-xxxx) so
# issues about the same root cause with different run IDs are caught as duplicates
normalize() {
  echo "$1" \
    | sed -E 's/[0-9]{8}_[0-9]{6}_[a-z0-9]{4}//g' \
    | sed -E 's/ghq-mol-[a-z0-9]+//g' \
    | tr '[:upper:]' '[:lower:]' | tr -cs '[:alnum:]' '\n' | sort -u
}

TITLE_WORDS=$(normalize "$TITLE")
TITLE_WORD_COUNT=$(echo "$TITLE_WORDS" | grep -c . || true)

if [ "$TITLE_WORD_COUNT" -gt 0 ]; then
  DUPLICATES=""
  while IFS= read -r line; do
    EXISTING_TITLE=$(echo "$line" | python3 -c "import sys,json; print(json.load(sys.stdin).get('title',''))" 2>/dev/null || true)
    EXISTING_ID=$(echo "$line" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null || true)

    [ -z "$EXISTING_TITLE" ] && continue

    EXISTING_WORDS=$(normalize "$EXISTING_TITLE")
    # Count overlapping words
    OVERLAP=$(comm -12 <(echo "$TITLE_WORDS") <(echo "$EXISTING_WORDS") | grep -c . || true)

    # Require >50% word overlap to flag as duplicate
    THRESHOLD=$(( (TITLE_WORD_COUNT + 1) / 2 ))
    if [ "$OVERLAP" -ge "$THRESHOLD" ] && [ "$OVERLAP" -gt 1 ]; then
      DUPLICATES="${DUPLICATES}  ${EXISTING_ID}: ${EXISTING_TITLE}\n"
    fi
  done < <(echo "$SEARCH_RESULTS" | python3 -c "
import sys, json
data = json.load(sys.stdin)
items = data if isinstance(data, list) else data.get('issues', data.get('results', []))
for item in items:
    print(json.dumps(item))
" 2>/dev/null || true)

  if [ -n "$DUPLICATES" ]; then
    printf 'Potential duplicates found:\n%b' "$DUPLICATES" >&2
    printf 'Skipping creation. Use bd create directly to force.\n' >&2
    exit 1
  fi
fi

# --- Create molecule from formula ---
POUR_ARGS=(
  "report-issue"
  --var "title=$TITLE"
)
[ -n "$DESCRIPTION" ] && POUR_ARGS+=(--var "description=$DESCRIPTION")
[ -n "$PRIORITY" ] && POUR_ARGS+=(--var "priority=$PRIORITY")
[ -n "$LABELS" ] && POUR_ARGS+=(--var "labels=$LABELS")

RESULT=$(cd "$SCRIPT_DIR/.." && bd mol pour "${POUR_ARGS[@]}" --json 2>&1)

if [ $? -eq 0 ]; then
  MOL_ID=$(echo "$RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('new_epic_id', d.get('id','unknown')))" 2>/dev/null || echo "unknown")
  printf 'Created molecule: %s\n' "$MOL_ID"
else
  printf 'Failed to create molecule:\n%s\n' "$RESULT" >&2
  exit 1
fi
