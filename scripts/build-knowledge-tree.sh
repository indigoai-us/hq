#!/usr/bin/env bash
# build-knowledge-tree.sh — Generate knowledge-tree.yaml and knowledge-tree.md
# Scans knowledge/ and companies/*/knowledge/ for .md files.
# Designed for Windows Git Bash. Target: <5s for ~200 files.

set -euo pipefail

HQ_ROOT="${HQ_ROOT:-C:/hq}"
YAML_OUT="$HQ_ROOT/knowledge/knowledge-tree.yaml"
MD_OUT="$HQ_ROOT/knowledge/knowledge-tree.md"
ENTRIES_CACHE="$HQ_ROOT/knowledge/.knowledge-tree-entries.tsv"
TMPDIR_TREE="${TMPDIR:-/tmp}/knowledge-tree-$$"
mkdir -p "$TMPDIR_TREE"
trap 'rm -rf "$TMPDIR_TREE"' EXIT

###############################################################################
# 1. Collect all knowledge .md files
###############################################################################

file_list="$TMPDIR_TREE/files.txt"
: > "$file_list"

find "$HQ_ROOT/knowledge/" -name "*.md" 2>/dev/null >> "$file_list"
for co_dir in "$HQ_ROOT"/companies/*/knowledge; do
  [[ -d "$co_dir" ]] && find "$co_dir/" -name "*.md" 2>/dev/null >> "$file_list"
done

total=$(wc -l < "$file_list")
echo "Found $total knowledge files"

###############################################################################
# 2. Parse all files with awk — one awk invocation per file, output TSV
###############################################################################

entries_file="$TMPDIR_TREE/entries.tsv"
xref_file="$TMPDIR_TREE/xrefs.tsv"
: > "$entries_file"
: > "$xref_file"

hq_root_escaped="${HQ_ROOT//\//\\/}"

while IFS= read -r filepath; do
  [[ -z "$filepath" ]] && continue
  bn=$(basename "$filepath")
  [[ "$bn" == "INDEX.md" || "$bn" == "README.md" ]] && continue

  relpath="${filepath#$HQ_ROOT/}"

  # Infer domain and category from path
  if [[ "$relpath" =~ ^companies/([^/]+)/knowledge/(.+)$ ]]; then
    domain="companies/${BASH_REMATCH[1]}"
    rest="${BASH_REMATCH[2]}"
    if [[ "$rest" =~ / ]]; then
      category="${rest%%/*}"
    else
      category="_root"
    fi
  elif [[ "$relpath" =~ ^knowledge/([^/]+)/(.+)$ ]]; then
    domain="${BASH_REMATCH[1]}"
    rest="${BASH_REMATCH[2]}"
    if [[ "$rest" =~ / ]]; then
      category="${rest%%/*}"
    else
      category="_root"
    fi
  else
    domain="other"; category="_root"
  fi

  # Single awk pass to extract confidence, tags, related, summary
  awk_out=$(awk '
    BEGIN { in_fm=0; fm_done=0; in_field=""; conf="none"; summ=""; tags=""; rel="" }
    /^---$/ { if(!in_fm && !fm_done){in_fm=1;next} if(in_fm){in_fm=0;fm_done=1;next} }
    in_fm {
      if(/^confidence:/){ gsub(/^confidence:[[:space:]]*/,""); gsub(/["\047\r]/,""); conf=$0; in_field=""; next }
      if(/^tags:/){ in_field="tags"; next }
      if(/^related:/){ in_field="related"; next }
      if(/^[a-z_]+:/){ in_field=""; next }
      if(in_field!="" && /^[[:space:]]*-[[:space:]]/){
        v=$0; gsub(/^[[:space:]]*-[[:space:]]*/,"",v); gsub(/["\047\r]/,"",v)
        if(in_field=="tags"){ tags=(tags==""?v:tags","v) }
        if(in_field=="related"){ rel=(rel==""?v:rel","v) }
        next
      }
      next
    }
    summ=="" && fm_done {
      gsub(/\r/,"")
      if($0=="") next
      if(/^#+[[:space:]]/){ summ=$0; gsub(/^#+[[:space:]]+/,"",summ) }
      else if(!/^#/){ summ=substr($0,1,120) }
    }
    summ=="" && !in_fm && !fm_done && !/^---$/ {
      gsub(/\r/,"")
      if($0=="") next
      if(/^#+[[:space:]]/){ summ=$0; gsub(/^#+[[:space:]]+/,"",summ) }
      else if(!/^#/){ summ=substr($0,1,120) }
    }
    END {
      if(summ=="") summ="(no summary)"
      gsub(/\t/," ",summ); gsub(/"/,"",summ)
      printf "%s\t%s\t%s\n", conf, tags, rel
      printf "%s\n", summ
    }
  ' "$filepath" 2>/dev/null || echo -e "none\t\t\n(parse error)")

  # Parse awk output (2 lines: fields, summary)
  fm_line=$(echo "$awk_out" | head -1)
  fm_summary=$(echo "$awk_out" | tail -1)

  IFS=$'\t' read -r fm_confidence fm_tags fm_related <<< "$fm_line"

  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
    "$domain" "$category" "$relpath" "$fm_summary" "$fm_confidence" "$fm_tags" "$fm_related" \
    >> "$entries_file"

  # Write cross-references
  if [[ -n "$fm_related" ]]; then
    IFS=',' read -ra rels <<< "$fm_related"
    for r in "${rels[@]}"; do
      [[ -z "$r" ]] && continue
      printf '%s\t%s\n' "$relpath" "$r" >> "$xref_file"
    done
  fi

done < "$file_list"

echo "Parsed $(wc -l < "$entries_file") entries"

###############################################################################
# 3. Build bidirectional cross-reference map
###############################################################################

bidi_file="$TMPDIR_TREE/bidi_xrefs.tsv"
if [[ -s "$xref_file" ]]; then
  # Create reverse refs
  awk -F'\t' '{print $2"\t"$1}' "$xref_file" > "$TMPDIR_TREE/reverse_xrefs.tsv"
  cat "$xref_file" "$TMPDIR_TREE/reverse_xrefs.tsv" | sort -u > "$bidi_file"
else
  : > "$bidi_file"
fi

###############################################################################
# 4. Save entries cache for query-tree.sh
###############################################################################

cp "$entries_file" "$ENTRIES_CACHE"

###############################################################################
# 5. Sort entries
###############################################################################

sort -t$'\t' -k1,1 -k2,2 -k3,3 "$entries_file" > "$TMPDIR_TREE/sorted.tsv"

###############################################################################
# 6. Generate YAML with awk (single pass over sorted entries)
###############################################################################

echo "Generating knowledge-tree.yaml..."

GENERATED=$(date -u +%Y-%m-%dT%H:%M:%SZ)

awk -F'\t' -v bidi_file="$bidi_file" -v gen_date="$GENERATED" '
BEGIN {
  # Pre-load bidirectional xrefs
  while ((getline line < bidi_file) > 0) {
    split(line, parts, "\t")
    if (parts[1] in xrefs) {
      xrefs[parts[1]] = xrefs[parts[1]] "," parts[2]
    } else {
      xrefs[parts[1]] = parts[2]
    }
  }
  close(bidi_file)

  # Pre-scan: count entries per domain and per domain+category
  # (we do this in a second pass, so use ARGV trick)
}

# First pass: count
NR==FNR {
  domain=$1; cat=$2
  d_count[domain]++
  dc_count[domain "\t" cat]++
  next
}

# Second pass: output YAML
FNR==1 {
  print "# Knowledge Tree - Auto-generated by build-knowledge-tree.sh"
  print "# Generated: " gen_date
  print "# Do not edit manually - regenerate with: scripts/build-knowledge-tree.sh"
  print ""
  print "domains:"
}
{
  domain=$1; cat=$2; relpath=$3; summary=$4; conf=$5; tags=$6; related=$7

  if (domain != prev_domain) {
    printf "  %s:\n", domain
    printf "    entry_count: %d\n", d_count[domain]
    printf "    categories:\n"
    prev_domain = domain
    prev_cat = ""
  }

  if (cat != prev_cat) {
    cc = dc_count[domain "\t" cat]
    printf "      %s:\n", cat
    printf "        entry_count: %d\n", cc
    if (cc > 20) {
      printf "        summarized: true\n"
      printf "        note: \"%d entries - use query-tree.sh to list\"\n", cc
      printf "        entries: []\n"
    } else {
      printf "        entries:\n"
    }
    prev_cat = cat
  }

  # Skip entries for summarized categories
  if (dc_count[domain "\t" cat] > 20) next

  printf "          - path: \"%s\"\n", relpath
  printf "            summary: \"%s\"\n", summary
  if (conf != "none" && conf != "") {
    printf "            confidence: %s\n", conf
  }
  if (tags != "") {
    gsub(/,/, ", ", tags)
    printf "            tags: [%s]\n", tags
  }
  if (relpath in xrefs) {
    printf "            related:\n"
    n = split(xrefs[relpath], xr_arr, ",")
    for (i = 1; i <= n; i++) {
      if (xr_arr[i] != "") {
        printf "              - \"%s\"\n", xr_arr[i]
      }
    }
  }
}
' "$TMPDIR_TREE/sorted.tsv" "$TMPDIR_TREE/sorted.tsv" > "$YAML_OUT"

echo "Wrote $YAML_OUT"

###############################################################################
# 7. Generate Markdown table of contents with awk
###############################################################################

echo "Generating knowledge-tree.md..."

awk -F'\t' -v gen_date="$GENERATED" '
# First pass: count per domain
NR==FNR {
  d_count[$1]++
  dc_count[$1 "\t" $2]++
  if (!seen_domain[$1]) { domains[++nd] = $1; seen_domain[$1] = 1 }
  next
}

# Second pass: output markdown
FNR==1 {
  print "# Knowledge Tree"
  print ""
  print "_Auto-generated by `scripts/build-knowledge-tree.sh` on " gen_date "_"
  print ""
  print "Hierarchical index of all knowledge files. Confidence: **H** (>=0.8), **M** (0.5-0.79), **L** (<0.5), **?** (none)."
  print ""
  print "## Domains"
  print ""
  for (i = 1; i <= nd; i++) {
    d = domains[i]
    anchor = d; gsub(/\//, "-", anchor)
    printf "- [%s](#%s) (%d entries)\n", d, anchor, d_count[d]
  }
  print ""
  print "---"
  print ""
}
{
  domain=$1; cat=$2; relpath=$3; summary=$4; conf=$5

  if (domain != prev_domain) {
    if (prev_domain != "") print ""
    printf "## %s\n\n", domain
    prev_domain = domain
    prev_cat = ""
  }

  if (cat != prev_cat) {
    if (cat == "_root") {
      print "### (root)"
    } else {
      printf "### %s\n", cat
    }
    print ""

    cc = dc_count[domain "\t" cat]
    if (cc > 20) {
      printf "_%d entries (summarized) -- run `scripts/query-tree.sh %s %s` to list_\n\n", cc, domain, cat
    }
    prev_cat = cat
  }

  if (dc_count[domain "\t" cat] > 20) next

  badge = "?"
  if (conf != "none" && conf != "") {
    if (conf + 0 >= 0.8) badge = "H"
    else if (conf + 0 >= 0.5) badge = "M"
    else badge = "L"
  }
  printf "- **[%s]** `%s` -- %s\n", badge, relpath, summary
}
END { print "" }
' "$TMPDIR_TREE/sorted.tsv" "$TMPDIR_TREE/sorted.tsv" > "$MD_OUT"

echo "Wrote $MD_OUT"

entry_count=$(wc -l < "$entries_file")
domain_count=$(cut -f1 "$entries_file" | sort -u | wc -l | tr -d ' ')
echo "Done. ${entry_count} entries across ${domain_count} domains."
