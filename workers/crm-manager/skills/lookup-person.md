# Skill: Lookup Person

Search the CRM by name, email, or identifier and return a formatted contact card.

## Input

A search query -- can be any of:
- A name: `"Corey Epstein"`, `"Corey"`, `"epstein"`
- An email: `"corey@getindigo.ai"`
- A Slack user ID: `"U042Z9XCRK3"`
- A Linear user ID: `"0f41fe7e-..."`
- A GitHub username: `"therealstefan"`

## Process

### 1. Parse the Query

Determine the query type based on format:
- Contains `@` -> email lookup
- Starts with `U` + alphanumeric (Slack pattern) -> Slack identifier lookup
- Looks like a UUID -> Linear identifier lookup
- Otherwise -> name search (fuzzy)

### 2. Search the CRM

```javascript
const crm = require('./.claude/lib/crm.js');

// By email
const results = crm.findContact({ email: 'corey@getindigo.ai' });

// By name
const results = crm.findContact({ name: 'Corey' });

// By Slack ID
const results = crm.findContact({ slack: { userId: 'U042Z9XCRK3' } });

// By Linear ID
const results = crm.findContact({ linear: { userId: '0f41fe7e-...' } });

// By GitHub
const results = crm.findContact({ github: { username: 'therealstefan' } });
```

### 3. Format Contact Card

For each matching contact, display a formatted card:

```
--- Contact Card ---
Name:      Corey Epstein
Title:     Co-founder
Company:   Indigo AI
Email:     corey@getindigo.ai
Tags:      team, indigo-team, co-founder

Identifiers:
  Slack:   U042Z9XCRK3 (indigo-ai), DM: D0672CEKJ1E
  Linear:  be96bce2-... (corey1)
  GitHub:  coreyepstein

Sources:   3 (migration, slack, web-research)
Interactions: 12 (last: 2026-02-20)
---
```

### 4. Handle No Results

If no contacts match:
- Report: `No contacts found matching "{query}"`
- Suggest: `Use "add-contact" skill to create a new contact, or "enrich-contact" to research this person.`

## Output

A formatted contact card for each matching result, or a "not found" message with suggestions.

## Quality Checklist

- [ ] All matching contacts are displayed (not just the first)
- [ ] Sensitive fields (like DM channel IDs) are included for operational use
- [ ] Last interaction date is shown for context
- [ ] No-result case includes actionable suggestions
