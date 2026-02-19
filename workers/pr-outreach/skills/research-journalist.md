# research-journalist

Research a journalist and enrich their contact profile via platform API.

## Inputs

- `journalist` (required): Journalist name
- `outlet` (optional): Publication they write for

## Steps

1. **Find or create contact in platform**
   - `GET /api/contacts?search={journalist}` → check if they exist
   - If not found: `POST /api/contacts` with name, outlet if known
   - Note the contact_id

2. **Web research**
   - WebSearch: `"{journalist name}" {outlet} articles` (recent 3 months)
   - WebSearch: `"{journalist name}" twitter OR x.com` → find X handle
   - WebSearch: `"{journalist name}" linkedin` → find LinkedIn
   - WebSearch: `"{journalist name}" email` → verify/find email
   - Note: recent article topics, beat focus, preferred story types

3. **Enrich via platform API**
   - `POST /api/contacts/{contact_id}/enrich` — triggers AI enrichment
   - This stores findings in the contact's enrichment JSONB field

4. **Update contact details**
   - If new info found (email, X handle, LinkedIn):
     - These should be included when creating the contact or noted in enrichment

5. **Output summary**
   - Write to `workspace/pr-drafts/{company}/research/{date}-research-{journalist-slug}.md`:

```markdown
# Journalist Research: {name}

## Outlet: {outlet}
## Beat: {beat focus}
## Tier: {1/2/3}
## Contact ID: {id}

## Recent Articles (Last 3 Months)
1. "{title}" — {date} — {URL}
2. "{title}" — {date} — {URL}
3. "{title}" — {date} — {URL}

## Beat Focus
{What they primarily cover, patterns in their writing}

## Pitch Preferences
- Prefers: {data-driven stories / exclusive access / trend pieces}
- Avoids: {product launches without data / unsolicited PR}
- Best approach: {email / DM / specific tips}

## Contact Info
- Email: {email}
- X: {handle}
- LinkedIn: {URL}

## Relevance to Our Clients
- {company}: {why they'd be interested in our stories}
```

## Platform API Reference

```
GET /api/contacts?search={name} — find contact
POST /api/contacts — create contact
POST /api/contacts/{id}/enrich — AI enrichment
```
