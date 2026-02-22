# Skill: Clean CRM

Audit the entire CRM, detect duplicates, merge records, and optionally enrich contacts with missing data via web research.

## Input

Optional flags:
- `--auto` -- Skip confirmation prompts, auto-merge all detected duplicates
- `--enrich` -- After dedup, also run web research to fill missing fields
- `--dry-run` -- Report what would change without making modifications

## Process

### 1. Load All Contacts

```javascript
const crm = require('./.claude/lib/crm.js');
const contacts = crm.listContacts();
```

Report: `Found N contacts in CRM.`

### 2. Detect Duplicates

Check every pair of contacts for potential duplicates using these criteria:

**Definite duplicates (auto-merge safe):**
- Exact email match (same address on two contacts)
- Same Slack userId (same userId, any workspace)
- Same Linear userId
- Same GitHub username

**Probable duplicates (confirm before merging):**
- Fuzzy name match: Levenshtein distance <= 2 on display names
- Same company + similar first name

For each duplicate pair found, record:
- The two slugs involved
- Which criteria matched
- Confidence level: `definite` or `probable`

### 3. Merge Duplicates

For each duplicate pair:

**If `--auto` flag or confidence = `definite`:**
```javascript
crm.mergeContacts(primarySlug, duplicateSlug);
```
The contact with more data (more emails, more identifiers, more interactions) becomes the primary.

**If confidence = `probable` and no `--auto` flag:**
- Show both contacts side-by-side:
  - Name, emails, companies, identifiers, tags
  - Number of interactions and sources
- Ask user: "Merge these contacts? [Y/n/skip]"
- If confirmed, merge. If skipped, continue.

### 4. Identify Incomplete Contacts

After dedup, scan remaining contacts for missing fields:
- No company
- No title
- No email
- No interactions (never been contacted)
- Only one identifier (limited reach)

### 5. Enrich Incomplete Contacts (if --enrich flag)

For each contact with missing critical fields (company, title, email):
- Use the enrich-contact skill process (web research)
- Rate-limit: max 10 enrichments per run to avoid excessive API calls

### 6. Generate Summary Report

```
CRM Cleanup Report
==================
Total contacts: N
Duplicates detected: M
  - Definite: X (auto-merged)
  - Probable: Y (Z confirmed by user, W skipped)
Contacts enriched: K
Contacts unchanged: L

Changes made:
- Merged: slug-a + slug-b -> slug-a (matched by: email)
- Enriched: slug-c (added: title, company)
- ...
```

## Output

A summary report of all changes made, plus counts of duplicates merged, contacts enriched, and contacts unchanged.

## Quality Checklist

- [ ] No data was lost during merges (all identifiers, sources, interactions preserved)
- [ ] Probable duplicates were confirmed before merging (unless --auto)
- [ ] Enrichment sources are recorded on each updated contact
- [ ] Final contact count is accurate
- [ ] All remaining contacts conform to CRM schema
