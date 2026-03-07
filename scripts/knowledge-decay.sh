#!/usr/bin/env bash
# knowledge-decay.sh — Apply confidence decay to knowledge files with frontmatter
# Idempotent: safe to run repeatedly. Called by the cron (US-006).
#
# Usage: ./scripts/knowledge-decay.sh [--dry-run]
#
# Processes all .md files under knowledge/ that have YAML frontmatter with
# confidence and last_validated fields. Applies decay based on weeks elapsed
# since last_validated, updates confidence in-place, and emits observations
# for files dropping below thresholds.

set -euo pipefail

HQ_ROOT="${HQ_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
DRY_RUN=false
TODAY=$(date +%Y-%m-%d)
TODAY_EPOCH=$(date -d "$TODAY" +%s 2>/dev/null || date -j -f "%Y-%m-%d" "$TODAY" +%s 2>/dev/null || echo "")
OBSERVATIONS_DIR="$HQ_ROOT/workspace/observations"
OBSERVATION_COUNT=0
PROCESSED_COUNT=0
DECAYED_COUNT=0
WARNING_COUNT=0

if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=true
  echo "[dry-run] No files will be modified"
fi

# Ensure observations directory exists
mkdir -p "$OBSERVATIONS_DIR"

# Convert date string to epoch seconds (cross-platform)
date_to_epoch() {
  local datestr="$1"
  # Try GNU date first, then BSD date
  date -d "$datestr" +%s 2>/dev/null || date -j -f "%Y-%m-%d" "$datestr" +%s 2>/dev/null || echo ""
}

# Calculate weeks between two dates
weeks_between() {
  local from_epoch="$1"
  local to_epoch="$2"
  if [[ -z "$from_epoch" || -z "$to_epoch" ]]; then
    echo "0"
    return
  fi
  local diff=$(( to_epoch - from_epoch ))
  if [[ $diff -lt 0 ]]; then
    echo "0"
    return
  fi
  echo $(( diff / 604800 ))  # 604800 = 7 * 24 * 60 * 60
}

# Extract a YAML frontmatter field value from a file
# Usage: extract_field <file> <field_name>
extract_field() {
  local file="$1"
  local field="$2"
  # Match the field in frontmatter (between first two --- lines)
  sed -n '/^---$/,/^---$/p' "$file" | grep "^${field}:" | head -1 | sed "s/^${field}:[[:space:]]*//" | tr -d '"' | tr -d "'"
}

# Check if file has YAML frontmatter with required fields
has_frontmatter() {
  local file="$1"
  local first_line
  first_line=$(head -1 "$file" 2>/dev/null)
  if [[ "$first_line" != "---" ]]; then
    return 1
  fi
  # Check for confidence and last_validated fields
  local conf
  conf=$(extract_field "$file" "confidence")
  local validated
  validated=$(extract_field "$file" "last_validated")
  if [[ -n "$conf" && -n "$validated" ]]; then
    return 0
  fi
  return 1
}

# Apply decay using awk for float arithmetic
calculate_decay() {
  local confidence="$1"
  local decay_rate="$2"
  local weeks="$3"
  awk "BEGIN { result = $confidence - ($decay_rate * $weeks); if (result < 0) result = 0; printf \"%.2f\", result }"
}

# Compare floats: returns 0 if $1 < $2
float_lt() {
  awk "BEGIN { exit !($1 < $2) }"
}

# Emit an observation JSON file
emit_observation() {
  local file="$1"
  local confidence="$2"
  local threshold="$3"
  local message="$4"
  local timestamp
  timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date +%Y-%m-%dT%H:%M:%SZ)
  local slug
  slug=$(basename "$file" .md)
  local obs_file="$OBSERVATIONS_DIR/decay-${slug}-$(date +%Y%m%d%H%M%S).json"

  if [[ "$DRY_RUN" == "true" ]]; then
    echo "[dry-run] Would emit observation: $message"
    return
  fi

  cat > "$obs_file" << OBSEOF
{
  "type": "knowledge-decay",
  "source": "scripts/knowledge-decay.sh",
  "timestamp": "$timestamp",
  "file": "$file",
  "confidence": $confidence,
  "threshold": $threshold,
  "message": "$message"
}
OBSEOF
  OBSERVATION_COUNT=$((OBSERVATION_COUNT + 1))
}

# Update confidence value in file frontmatter
update_confidence() {
  local file="$1"
  local old_conf="$2"
  local new_conf="$3"

  if [[ "$DRY_RUN" == "true" ]]; then
    echo "[dry-run] $file: $old_conf -> $new_conf"
    return
  fi

  # Use sed to replace the confidence line in frontmatter
  # Handle both quoted and unquoted values
  sed -i "s/^confidence:[[:space:]]*[\"']*${old_conf}[\"']*/confidence: ${new_conf}/" "$file"
}

# Add or update warning banner for low-confidence files
manage_warning_banner() {
  local file="$1"
  local confidence="$2"
  local needs_warning=false
  local has_warning=false

  if float_lt "$confidence" "0.3"; then
    needs_warning=true
  fi

  # Check if warning banner exists right after frontmatter (within 3 lines of closing ---)
  local closing_line
  closing_line=$(awk '/^---$/{c++;if(c==2){print NR;exit}}' "$file")
  if [[ -n "$closing_line" ]]; then
    local check_start=$((closing_line + 1))
    local check_end=$((closing_line + 3))
    if sed -n "${check_start},${check_end}p" "$file" | grep -q "^> WARNING: This knowledge has low confidence"; then
      has_warning=true
    fi
  fi

  if [[ "$needs_warning" == "true" && "$has_warning" == "false" ]]; then
    if [[ "$DRY_RUN" == "true" ]]; then
      echo "[dry-run] Would add warning banner to $file (confidence: $confidence)"
      return
    fi
    # Insert warning banner after the closing --- of frontmatter
    # Find the second --- line and insert after it
    local line_num
    line_num=$(awk '/^---$/{c++;if(c==2){print NR;exit}}' "$file")
    if [[ -n "$line_num" ]]; then
      sed -i "${line_num}a\\
> WARNING: This knowledge has low confidence (${confidence}). It may be outdated.\\
" "$file"
      WARNING_COUNT=$((WARNING_COUNT + 1))
    fi
  elif [[ "$needs_warning" == "true" && "$has_warning" == "true" ]]; then
    if [[ "$DRY_RUN" == "true" ]]; then
      echo "[dry-run] Would update warning banner in $file (confidence: $confidence)"
      return
    fi
    # Update existing warning banner with new confidence value
    sed -i "s/^> WARNING: This knowledge has low confidence ([0-9.]*)\./> WARNING: This knowledge has low confidence (${confidence})./" "$file"
  elif [[ "$needs_warning" == "false" && "$has_warning" == "true" ]]; then
    if [[ "$DRY_RUN" == "true" ]]; then
      echo "[dry-run] Would remove warning banner from $file (confidence: $confidence)"
      return
    fi
    # Remove warning banner (and trailing blank line if present)
    sed -i '/^> WARNING: This knowledge has low confidence/d' "$file"
  fi
}

echo "Knowledge Decay Processor"
echo "========================="
echo "Date: $TODAY"
echo "HQ Root: $HQ_ROOT"
echo ""

# Find all .md files under knowledge/
while IFS= read -r -d '' file; do
  # Skip files without frontmatter
  if ! has_frontmatter "$file"; then
    continue
  fi

  PROCESSED_COUNT=$((PROCESSED_COUNT + 1))

  # Extract fields
  confidence=$(extract_field "$file" "confidence")
  last_validated=$(extract_field "$file" "last_validated")
  decay_rate=$(extract_field "$file" "decay_rate")
  decay_rate="${decay_rate:-0.02}"  # Default decay rate

  # Calculate weeks since last validated
  validated_epoch=$(date_to_epoch "$last_validated")
  if [[ -z "$validated_epoch" || -z "$TODAY_EPOCH" ]]; then
    echo "SKIP: $file (could not parse dates)"
    continue
  fi

  weeks=$(weeks_between "$validated_epoch" "$TODAY_EPOCH")

  if [[ "$weeks" -eq 0 ]]; then
    # No decay needed — validated this week
    rel_path="${file#$HQ_ROOT/}"
    echo "OK:   $rel_path (confidence: $confidence, validated this week)"
    manage_warning_banner "$file" "$confidence"
    continue
  fi

  # Calculate new confidence
  new_confidence=$(calculate_decay "$confidence" "$decay_rate" "$weeks")

  rel_path="${file#$HQ_ROOT/}"

  if [[ "$confidence" != "$new_confidence" ]]; then
    DECAYED_COUNT=$((DECAYED_COUNT + 1))
    echo "DECAY: $rel_path: $confidence -> $new_confidence (${weeks}w elapsed)"
    update_confidence "$file" "$confidence" "$new_confidence"

    # Check thresholds and emit observations
    if float_lt "$new_confidence" "0.3" && ! float_lt "$confidence" "0.3"; then
      emit_observation "$rel_path" "$new_confidence" 0.3 "Knowledge file dropped below 0.3 confidence: $rel_path ($new_confidence)"
    elif float_lt "$new_confidence" "0.5" && ! float_lt "$confidence" "0.5"; then
      emit_observation "$rel_path" "$new_confidence" 0.5 "Knowledge file dropped below 0.5 confidence — needs revalidation: $rel_path ($new_confidence)"
    fi

    # Manage warning banner
    manage_warning_banner "$file" "$new_confidence"
  else
    echo "OK:   $rel_path (confidence: $confidence, no decay needed)"
    manage_warning_banner "$file" "$confidence"
  fi

done < <(find "$HQ_ROOT/knowledge" -name "*.md" -print0 2>/dev/null)

echo ""
echo "Summary"
echo "-------"
echo "Files processed: $PROCESSED_COUNT"
echo "Files decayed:   $DECAYED_COUNT"
echo "Warnings added:  $WARNING_COUNT"
echo "Observations:    $OBSERVATION_COUNT"
