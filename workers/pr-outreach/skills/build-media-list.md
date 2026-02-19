# build-media-list

Build targeted media list for a specific announcement and add contacts to a campaign.

## Inputs

- `company` (required): Company name
- `announcement` (required): Story angle or announcement
- `campaign_id` (optional): Platform campaign to add contacts to
- `count` (optional): Target list size (default: 15)

## Steps

1. **Define targeting criteria**
   - Based on announcement, identify: relevant beats, outlet types, tier distribution
   - Target: 3-5 Tier 1, 5-10 Tier 2, 5-10 Tier 3

2. **Search existing contacts**
   - `GET /api/contacts?beat={beat}` for each relevant beat
   - `GET /api/contacts?tier={tier}` to check tier distribution
   - Identify existing contacts who match the announcement

3. **Research new contacts**
   - WebSearch: `"{announcement topic}" journalist OR reporter` (identify who covers this)
   - WebSearch: `{target outlet} {beat} editor OR reporter`
   - For each new journalist found:
     - `POST /api/contacts` with name, email, beat, tier
     - Run research-journalist skill or `POST /api/contacts/{id}/enrich`

4. **Build the list**
   - Combine existing + new contacts
   - Score by relevance: recent coverage of similar topics > beat match > tier
   - Ensure no duplicate outlets (max 1 journalist per outlet)

5. **Add to campaign (if campaign_id provided)**
   - For each contact on the list:
     - `POST /api/pitches` with campaign_id, contact_id, status: "draft"
   - This creates draft pitches ready for personalization

6. **Output list**
   - Write to `workspace/pr-drafts/{company}/media-lists/{date}-media-list-{slug}.md`:

```markdown
# Media List: {announcement}

## Company: {company}
## Campaign ID: {id}
## Total Contacts: {N}

## Tier 1 (National/Major Tech)
| # | Name | Outlet | Beat | Email | Relevance |
|---|------|--------|------|-------|-----------|
| 1 | {name} | {outlet} | {beat} | {email} | {why they're relevant} |

## Tier 2 (Industry)
| # | Name | Outlet | Beat | Email | Relevance |
|---|------|--------|------|-------|-----------|

## Tier 3 (Niche/Blog/Newsletter)
| # | Name | Outlet | Beat | Email | Relevance |
|---|------|--------|------|-------|-----------|

## Pitch Sequence
- Day 1: Tier 1 exclusives (if applicable)
- Day 3: Remaining Tier 1 + Tier 2
- Day 5: Tier 3
```

## Rules

- Max 1 journalist per outlet
- Every contact must have a relevance justification
- Tier 1 contacts should have enrichment data before pitching
- Max 25 contacts per campaign (send cap)

## Platform API Reference

```
GET /api/contacts — list/search contacts
POST /api/contacts — create contact
POST /api/contacts/{id}/enrich — AI enrichment
POST /api/pitches — create draft pitch in campaign
```
