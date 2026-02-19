# competitive-pr

Analyze competitor PR activity and identify positioning opportunities.

## Inputs

- `company` (required): Company name
- `competitors` (optional): Comma-separated competitor names. If not provided, use defaults:
  - {company-1}: Attentive, Postscript, Recart, Klaviyo
  - {company-2}: Palantir, C3.ai, DataRobot
  - {company-3}: Otter.ai, Fireflies, Read.ai

## Steps

1. **Load company context**
   - Read `companies/{company}/knowledge/` for positioning
   - `GET /api/clients` → find client_id
   - `GET /api/stories?client_id={id}` → our current angles

2. **Research each competitor**
   For each competitor:
   - WebSearch: `"{competitor}" press release OR announcement` (last 60 days)
   - WebSearch: `"{competitor}" funding OR acquisition OR partnership`
   - WebSearch: `"{competitor}" CEO interview OR podcast`
   - Note: key themes, messaging, outlets covered, volume

3. **Identify positioning gaps**
   - What narratives are competitors owning that we should counter?
   - What narratives are unowned in the space?
   - Where are competitors weak that we can exploit?
   - What trending topics could we attach to?

4. **Output report**
   - Write to `workspace/reports/pr/{date}-{company}-competitive-pr.md`:

```markdown
# Competitive PR Analysis: {company}

## Date: {date}

## Competitor Activity (Last 60 Days)

### {Competitor 1}
- **Key Announcements:** {list}
- **Messaging Themes:** {themes}
- **Coverage Volume:** ~{N} placements
- **Top Outlets:** {outlets}
- **Tone:** {aggressive/defensive/thought-leadership}

### {Competitor 2}
...

## Narrative Landscape

| Narrative | Who Owns It | Our Position | Opportunity |
|-----------|------------|--------------|-------------|
| {theme}   | {company}  | {weak/none}  | {high/med/low} |

## Recommended Story Angles
1. **{angle}**: {why this counters competitor narrative or fills gap}
   - Target outlets: {list}
   - Timing: {when to pitch}
2. ...

## Counter-Messaging
If asked about {competitor claim}:
- Say: {our response}
- Proof: {supporting evidence}

## Action Items
1. Create story: {title} → pr-strategist/plan-campaign
2. Pitch angle: {topic} to {outlet} → pr-outreach
```

## Rules

- Focus on actionable intelligence, not comprehensive competitor profiles
- Only track PR-relevant activity (not product features or pricing)
- Always connect findings to specific story opportunities for our client
