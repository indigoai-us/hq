# coverage-check

Search web for recent media mentions of a company and log placements.

## Inputs

- `company` (required): Company name
- `days` (optional): Look back period in days (default: 7)

## Steps

1. **Load company context**
   - `GET /api/clients` → find client_id
   - Read `companies/{company}/knowledge/` for product names, exec names, brand terms

2. **Search for mentions**
   Run multiple WebSearches:
   - `"{company name}" press OR article OR review` (last {days} days)
   - `"{product name}" announcement OR launch OR update`
   - `"{CEO name}" interview OR quote OR podcast`
   - `"{company name}" site:techcrunch.com OR site:forbes.com OR site:venturebeat.com`
   - `"{company name}" site:producthunt.com OR site:ycombinator.com`

3. **Evaluate each result**
   For each mention found:
   - Is this a new mention or already tracked?
   - `GET /api/placements?client_id={id}` → check existing placements by URL
   - Classify: article, mention, interview, podcast, op-ed, social
   - Assess sentiment: positive, neutral, negative
   - Estimate reach based on outlet tier

4. **Log new placements**
   For each new mention:
   - Try to match to existing pitch: check if we pitched this outlet/journalist
   - `POST /api/placements` with: contact_id (if known), client_id, pitch_id (if linked), url, published_date, type, sentiment, reach, notes

5. **Output report**
   - Write to `workspace/reports/pr/{date}-{company}-coverage-check.md`:

```markdown
# Coverage Check: {company}

## Date: {date}
## Period: Last {days} days

## New Mentions Found: {N}

| # | Outlet | Title | Type | Sentiment | Reach | Linked Pitch? |
|---|--------|-------|------|-----------|-------|---------------|
| 1 | {outlet} | {title} | {type} | {pos/neu/neg} | {est.} | {yes/no} |

## Summary
- Positive: {N}, Neutral: {N}, Negative: {N}
- Tier 1 hits: {N}
- Pitch-to-placement conversions: {N}

## Notable Mentions
{Highlight any significant coverage}

## Action Items
- {any negative coverage requiring response}
- {opportunities to amplify positive coverage}
```

## Platform API Reference

```
GET /api/clients — find client_id
GET /api/placements?client_id={id} — check existing placements
POST /api/placements — log new placement
```
