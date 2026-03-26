---
description: Audit knowledge base tags — find near-duplicates, orphans, and overly broad tags, then fix them
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
---

# /tag-audit — Tag Vocabulary Health Check

Audit the knowledge base tag vocabulary for quality issues and fix them interactively.

**Usage**: `/tag-audit [-c <company-slug>]`

## Company Context

All knowledge is scoped to a company. Determine the target company:

1. If `$ARGUMENTS` contains `-c <slug>`, use that slug.
2. Otherwise default to `hq`.

Set `COMPANY` to the resolved slug.

## Step 1: Extract Full Tag Inventory

Run:

```bash
./companies/hq/tools/tag-inventory.sh -c {COMPANY}
```

Parse the output into a tag frequency table: `{tag: count}`.

## Step 2: Detect Issues

Scan the inventory for these problem categories:

### a. Near-duplicates (highest priority)

Find tags that differ only by:
- **Pluralization**: `agent-loop` vs `agent-loops`, `container` vs `containers`
- **Hyphen variants**: `ai-agents` vs `aiagents`
- **Synonyms**: `sandbox` vs `sandboxing`, `knowledge` vs `knowledge-management`
- **Abbreviations**: `mcp` vs `model-context-protocol`

For each pair, note which has higher frequency (the canonical form).

### b. Orphans (used only once)

Tags appearing in exactly 1 entry. Not all orphans are bad — a niche topic legitimately has few entries. Flag only orphans that:
- Are vague (`knowledge`, `format`, `spec`)
- Look like test data (`tag-a`, `tag-b`)
- Could be replaced by an existing higher-frequency tag

### c. Overly broad tags

Tags that are so generic they add no signal: `knowledge`, `automation`, `configuration`. A tag is too broad if it could apply to >50% of all entries.

### d. Category-duplicating tags

Tags that match their entry's category directory name (e.g., `ai-agents` tag on a file in `companies/{COMPANY}/knowledge/ai-agents/`). These add no discovery value.

## Step 3: Present Findings

Output a structured report:

```
## Tag Audit Report ({COMPANY})

### Near-duplicates (merge recommended)
| Keep | Merge into it | Affected files |
|------|--------------|----------------|
| {canonical} | {variant} | {count} files |

### Suspicious orphans (review recommended)
| Tag | File | Recommendation |
|-----|------|----------------|
| {tag} | {path} | Remove / Replace with {alternative} |

### Overly broad tags
| Tag | Count | Recommendation |
|-----|-------|----------------|
| {tag} | {N} | Remove / Replace with more specific tag |

### Category-duplicating tags
| Tag | Category | Files |
|-----|----------|-------|
| {tag} | {category} | {count} files |

Total tags: {N} unique, {N} total uses
Health score: {good|fair|needs work} ({issues found}/{total tags} problematic)
```

## Step 4: Ask for Approval

Present the report and ask: **"Which fixes should I apply?"** with options:
- Apply all recommended fixes
- Apply only near-duplicate merges
- Apply specific fixes (let user pick)
- Skip (audit only, no changes)

## Step 5: Apply Fixes

For each approved fix:

1. **Read** the affected file
2. **Edit** the `tags:` line in frontmatter to apply the change (merge, remove, or replace)
3. Track changes for the summary

After all fixes:

```bash
npx tsx companies/hq/tools/reindex.ts -c {COMPANY}
```

## Step 6: Summary

```
## Tag Audit Complete ({COMPANY})

Changes applied:
- Merged {N} near-duplicate tags
- Removed {N} orphan/broad tags
- Replaced {N} tags with better alternatives

Tag vocabulary: {before} -> {after} unique tags
```

## Rules

- **Never delete tags without approval** — always present findings first.
- **Canonical form wins**: When merging duplicates, keep the higher-frequency variant.
- **Preserve semantics**: Don't merge tags that look similar but mean different things (e.g., `security` and `agent-security` are distinct).
- **Always reindex** after making changes.
- **Non-destructive**: Only modify `tags:` lines in frontmatter. Never change content or other metadata.
