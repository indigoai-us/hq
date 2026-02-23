# Skill: Add Contact

Manually add a new contact to the CRM with provided information.

## Input

A name and any known identifiers. Examples:
- `"Jane Doe, jane@acme.com, VP Engineering at Acme Corp"`
- `"Aaron Hazen"` (just a name, identifiers to be added later)
- `"New contact: Bob Smith, Slack U08RANNQC5C in frogbear workspace, GitHub: bobsmith"`

## Process

### 1. Parse the Input

Extract structured data from the free-form input:
- **Name**: Required. Full display name.
- **Email**: Any email addresses mentioned
- **Title**: Job title if mentioned
- **Company**: Company name if mentioned
- **Identifiers**: Slack IDs, Linear IDs, GitHub usernames if mentioned
- **Tags**: Any tags or categories mentioned

### 2. Check for Existing Contact

Before creating, search the CRM to prevent duplicates:

```javascript
const crm = require('./.claude/lib/crm.js');

// Check by name
const byName = crm.findContact({ name: parsedName });

// Check by email if provided
const byEmail = parsedEmail ? crm.findContact({ email: parsedEmail }) : [];

// Check by identifier if provided
const byIdent = parsedSlackId ? crm.findContact({ slack: { userId: parsedSlackId } }) : [];
```

If an existing contact is found:
- Show the existing contact
- Ask: "A similar contact already exists. Update the existing contact instead? [Y/n]"
- If yes, use `crm.updateContact()` to add the new information
- If no, proceed with creating a new contact

### 3. Create the Contact

```javascript
const contact = crm.createContact({
  name: parsedName,
  emails: parsedEmails.map(e => ({ address: e })),
  title: parsedTitle,
  companies: parsedCompany ? [{ name: parsedCompany, role: parsedTitle, current: true }] : [],
  identifiers: {
    slack: parsedSlackIds,
    linear: parsedLinearIds,
    github: parsedGithubUsernames
  },
  sources: [{
    type: 'manual',
    date: new Date().toISOString(),
    context: 'Added manually via crm-manager add-contact skill'
  }],
  tags: parsedTags
});
```

### 4. Confirm Creation

Display the created contact card (same format as lookup-person skill):

```
Contact created successfully!

--- Contact Card ---
Name:      Jane Doe
Title:     VP Engineering
Company:   Acme Corp
Email:     jane@acme.com
Slug:      jane-doe
Tags:      (none)

Sources:   1 (manual)
Interactions: 0
---

File: workspace/crm/contacts/jane-doe.json
```

## Output

The created (or updated) contact card, with confirmation of the file location.

## Quality Checklist

- [ ] Duplicate check performed before creation
- [ ] Contact has at least a name and one source entry
- [ ] All provided identifiers are structured correctly per CRM schema
- [ ] Slug is valid (lowercase, hyphenated, no special characters)
- [ ] File saved to correct location
