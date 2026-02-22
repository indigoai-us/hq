# Skill: Enrich Contact

Research a contact on the web and fill in missing information (LinkedIn, company, title, GitHub).

## Input

A contact slug (e.g., `corey-epstein`) or name to look up first.

## Process

### 1. Load the Contact

```javascript
const crm = require('./.claude/lib/crm.js');
const contact = crm.readContact(slug);
```

If a name was provided instead of a slug, use `crm.findContact({ name: '...' })` to locate it first.

If the contact is not found, report an error and stop.

### 2. Identify Missing Fields

Check which fields are empty or missing:
- `title` -- job title / professional role
- `companies` -- current and past companies
- `emails` -- email addresses
- `identifiers.github` -- GitHub username
- `identifiers.linear` -- Linear workspace info
- LinkedIn URL (stored in notes or a custom identifier)

### 3. Web Research

Use WebSearch to find information about this person:

**Search queries to try (in order):**
1. `"{display name}" LinkedIn` -- most reliable for professional info
2. `"{display name}" {known company}` -- if a company is already on file
3. `"{display name}" GitHub` -- for developer contacts
4. `"{display name}" {known email domain}` -- domain-based search

**For each search result:**
- Verify the result refers to the correct person (match known identifiers, company, location)
- Extract: title, company, other social profiles
- Note the source URL for provenance

### 4. Update the Contact

Use `crm.updateContact()` to add discovered information:

```javascript
crm.updateContact(slug, {
  title: 'VP Engineering',
  companies: [{ name: 'Acme Corp', role: 'VP Engineering', current: true }],
  identifiers: {
    github: [{ username: 'janedoe', profileUrl: 'https://github.com/janedoe' }]
  },
  sources: [{
    type: 'web-research',
    ref: 'https://linkedin.com/in/janedoe',
    date: new Date().toISOString(),
    context: 'Enriched via web research: found LinkedIn profile'
  }]
});
```

### 5. Report Results

Output a summary:
- Fields that were enriched (before -> after)
- Sources used for each piece of information
- Fields that remain missing (could not be found)

## Output

The enriched contact JSON, plus a summary of what changed and what sources were used.

## Quality Checklist

- [ ] Only added verified information (from authoritative pages)
- [ ] Did not overwrite existing data
- [ ] Added source entries for all new data
- [ ] Contact still conforms to CRM schema
