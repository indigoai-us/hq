# pitch-email

Write personalized journalist pitch email and create as draft in platform.

## Inputs

- `company` (required): Company name
- `story` (required): Story angle or announcement to pitch
- `journalist` (optional): Journalist name (for single pitch)
- `campaign_id` (optional): Platform campaign ID (for batch pitch creation)

## Steps

1. **Load context**
   - Load template: `knowledge/public/pr/templates/pitch-template.md`
   - Read `companies/{company}/knowledge/` for brand context
   - If campaign_id: `GET /api/campaigns/{campaign_id}` for story details
   - If journalist: `GET /api/contacts?search={journalist}` for contact details + enrichment

2. **Draft pitch**
   Structure (under 150 words):

```
Subject: {Specific, not clickbait — reference their beat or recent article}

Hi {First Name},

{Hook — 1 sentence connecting to their recent work or beat focus.}

{The news — 2-3 sentences max. What, why it matters, one proof point.}

{The ask — specific CTA: interview, exclusive, demo, data access.}

{Sign-off}
{Name}
{Company-6} PR
hello@{company-6}pr.com
```

3. **Create in platform**
   - If campaign_id and journalist specified:
     - Find contact_id from `GET /api/contacts?search={journalist}`
     - `POST /api/pitches` with campaign_id, contact_id, subject, body, personalization_notes
   - If campaign_id without journalist (batch mode):
     - `GET /api/contacts` for campaign's target contacts
     - Create draft pitch for each via `POST /api/pitches`
   - Drafts go to `draft_queue` automatically

4. **Save local copy**
   - Write to `workspace/pr-drafts/{company}/pitches/{date}-pitch-{journalist-slug}.md`

## Rules

- Under 150 words — journalists delete long pitches
- Personalized hook is mandatory — reference their specific work
- One clear CTA, not multiple asks
- No attachments mentioned (provide links instead)
- Subject line: specific and relevant to their beat, not generic
- Never pitch competing journalists at the same outlet simultaneously
- All pitches require approval before sending (draft_queue)

## Platform API Reference

```
Authorization: Bearer {RPR_API_KEY}
POST /api/pitches — create draft pitch
GET /api/contacts — find journalist contact
GET /api/campaigns/{id} — get campaign/story context
```
