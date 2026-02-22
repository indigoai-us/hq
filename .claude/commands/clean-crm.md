---
description: Audit CRM contacts for duplicates, merge records, and optionally enrich missing data via web research
allowed-tools: Task, Read, Glob, Grep, Bash, Write, Edit, WebSearch, WebFetch, AskUserQuestion
argument-hint: [--auto] [--enrich] [--dry-run]
visibility: public
---

# /clean-crm - CRM Cleanup & Deduplication

Audits all contacts in `workspace/crm/contacts/`, detects duplicates, merges records, fills missing data via web research, and reports what changed.

**User's input:** $ARGUMENTS

## Flags

| Flag | Effect |
|------|--------|
| (none) | Interactive mode: report duplicates, ask before merging |
| `--auto` | Auto-merge all detected duplicates without confirmation prompts |
| `--enrich` | After dedup, run web research to fill missing company/title/email |
| `--dry-run` | Report what would change without making any modifications |

Flags can be combined: `--auto --enrich` merges all duplicates then enriches.

## Delegation

This command delegates to the **crm-manager** worker's **clean-crm** skill. Load the worker config and skill before executing:

1. Read `workers/crm-manager/worker.yaml` for worker instructions
2. Read `workers/crm-manager/skills/clean-crm.md` for the detailed skill process
3. Read `knowledge/hq-core/crm-schema.json` for the contact schema
4. Read `.claude/lib/crm.js` for the CRM utility library

## Process

### 1. Load All Contacts

Read every `.json` file in `workspace/crm/contacts/`:

```javascript
const crm = require('./.claude/lib/crm.js');
const contacts = crm.listContacts();
```

Report: `Found N contacts in CRM.`

If zero contacts found, report and exit early.

### 2. Detect Duplicates

Compare every pair of contacts for potential duplicates.

**Definite duplicates (auto-merge safe):**
- Exact email match: same `address` in `emails[]` on two different contacts
- Same Slack userId: matching `identifiers.slack[].userId`
- Same Linear userId: matching `identifiers.linear[].userId`
- Same GitHub username: matching `identifiers.github[].username`

**Probable duplicates (require confirmation):**
- Fuzzy name match: Levenshtein distance <= 2 on `name.display` values
- Same company + similar first name (Levenshtein distance <= 1 on first names)

Use the `levenshtein` function from `.claude/lib/crm.js` for distance calculations.

For each duplicate pair, record:
- The two slugs
- Which criteria matched
- Confidence: `definite` or `probable`

### 3. Merge Duplicates

For each duplicate pair:

**If `--auto` flag is set OR confidence is `definite`:**
- Determine primary: the contact with more data (more emails + identifiers + interactions) becomes primary
- Run `crm.mergeContacts(primarySlug, secondarySlug)`
- Log: `Merged: {secondarySlug} into {primarySlug} (matched by: {criteria})`

**If confidence is `probable` AND `--auto` is NOT set:**
- Show both contacts side-by-side:
  ```
  Contact A: {name.display}
    Emails: {emails list}
    Companies: {companies list}
    Identifiers: {summary}
    Tags: {tags}
    Interactions: {count}

  Contact B: {name.display}
    Emails: {emails list}
    Companies: {companies list}
    Identifiers: {summary}
    Tags: {tags}
    Interactions: {count}

  Match criteria: {criteria}
  ```
- Ask user: "Merge these contacts? [Y/n/skip]"
- If confirmed: merge (more-data contact is primary)
- If skipped: continue to next pair

**If `--dry-run`:** Report all detected pairs but do not merge. Show what would happen.

### 4. Identify Incomplete Contacts

After deduplication, scan all remaining contacts for missing critical fields:
- No company (`companies` array is empty)
- No title (empty string or missing)
- No email (`emails` array is empty)
- No interactions (`interactions` array is empty)
- Only one identifier type (limited reach across systems)

Report count of incomplete contacts and which fields are missing.

### 5. Enrich Incomplete Contacts (if --enrich)

Only if `--enrich` flag is provided:

For each contact missing company, title, or email (max 10 per run):
1. Use WebSearch to find: `"{name.display}" LinkedIn`, `"{name.display}" {known company}`
2. Parse results for professional info: title, company, email
3. Only add verified information (appears on authoritative pages)
4. Update via `crm.updateContact(slug, patch)`
5. Add source: `{ type: 'web-research', date: 'ISO8601', ref: 'search URL', context: 'CRM enrichment' }`

**If `--dry-run`:** Report which contacts would be enriched and what searches would run, but do not search or modify.

### 6. Generate Summary Report

```
CRM Cleanup Report
==================
Total contacts: N (before: X, after: Y)
Duplicates detected: M
  - Definite: A (auto-merged)
  - Probable: B (C confirmed by user, D skipped)
Contacts enriched: K
Contacts unchanged: L
Incomplete contacts remaining: I
  - Missing company: ...
  - Missing title: ...
  - Missing email: ...

Changes made:
- Merged: slug-b into slug-a (matched by: email)
- Merged: slug-d into slug-c (matched by: slack-userId)
- Enriched: slug-e (added: title, company)
- ...

Run `/clean-crm --enrich` to fill missing fields via web research.
```

## Quality Checklist

After completion, verify:
- [ ] No data was lost during merges (all identifiers, sources, interactions preserved in primary)
- [ ] Probable duplicates were confirmed before merging (unless `--auto`)
- [ ] Enrichment sources are recorded on each updated contact
- [ ] Final contact count is accurate
- [ ] All remaining contacts conform to `knowledge/hq-core/crm-schema.json`
- [ ] No duplicate slug files remain in `workspace/crm/contacts/`

## Rules

- **Safe by default**: With no flags, the command only reports and asks before merging
- **`--dry-run` never modifies**: Useful for previewing what cleanup would do
- **Enrichment is rate-limited**: Max 10 web searches per run to avoid excessive API calls
- **Merge preserves all data**: Union of emails, identifiers, sources, interactions -- nothing is deleted
- **Primary contact wins on conflicts**: If both contacts have a title, the primary's title is kept
- **Always re-read contacts between operations**: Merges change the contact list, so re-scan after each merge
