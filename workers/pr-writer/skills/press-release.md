# press-release

Draft AP-style press release from announcement brief.

## Inputs

- `company` (required): Company name
- `announcement` (required): What is being announced
- `campaign_id` (optional): Platform campaign to link this to

## Steps

1. **Load context**
   - Read `companies/{company}/knowledge/` for brand guidelines, boilerplate, key people
   - Load template: `knowledge/public/pr/templates/press-release-template.md`
   - If campaign_id provided: `GET /api/campaigns/{id}` for story context

2. **Research**
   - WebSearch for recent comparable announcements in the space
   - Identify key data points and proof points to include

3. **Draft press release**
   Follow AP style. Structure:

```markdown
# {HEADLINE — Action verb, specific, under 10 words}

## {Subhead — expands on headline with key detail}

**{CITY}, {STATE} — {Date}** — {Company} today announced {what}. {Why it matters in one sentence}.

{Paragraph 2: Key details — what specifically is launching/changing/happening. Include data.}

{Paragraph 3: Quote from executive. Format: "Quote here," said {Name}, {Title} of {Company}. "Second sentence of quote."}

{Paragraph 4: Additional detail — customer impact, availability, specifications.}

{Paragraph 5 (optional): Industry context — analyst quote, market data, or trend connection.}

{Paragraph 6 (optional): Partner/customer quote if relevant.}

## About {Company}
{Company boilerplate — 2-3 sentences from brand guidelines.}

## Media Contact
{Company-6} PR
hello@{company-6}pr.com
```

4. **Save draft**
   - Write to `workspace/pr-drafts/{company}/{date}-press-release-{slug}.md`
   - If campaign_id provided, note it in the draft header for linking

## Rules

- Under 600 words total
- Lead with WHO/WHAT/WHY — not "We're excited to announce"
- Quotes should sound human, not corporate
- Include at least one specific data point or metric
- No jargon, no buzzwords ("revolutionary", "game-changing", "cutting-edge")
- Boilerplate must come from company knowledge, not invented
- All press releases list {Company-6} PR as media contact
