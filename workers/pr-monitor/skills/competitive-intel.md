# competitive-intel

Monitor competitor PR activity and media presence.

## Inputs

- `company` (required): Company name
- `competitors` (optional): Comma-separated names. Defaults:
  - {company-1}: Attentive, Postscript, Recart, Klaviyo
  - {company-2}: Palantir, C3.ai, DataRobot
  - {company-3}: Otter.ai, Fireflies, Read.ai

## Steps

1. **Research each competitor**
   For each competitor:
   - WebSearch: `"{competitor}" press release OR announcement` (last 30 days)
   - WebSearch: `"{competitor}" funding OR acquisition OR partnership`
   - WebSearch: `"{competitor}" {beat keywords} coverage`
   - Note: volume, outlets covering them, key narratives

2. **Compare to our coverage**
   - `GET /api/placements?client_id={id}` → our recent placements
   - `GET /api/analytics?client_id={id}` → our stats
   - Compare share of voice (rough estimate from search results)

3. **Identify opportunities**
   - Narratives competitors are pushing that we should counter
   - Outlets covering competitors but not us
   - Trends competitors are missing that we could own

4. **Output report**
   - Write to `workspace/reports/pr/{date}-{company}-competitive-intel.md`:

```markdown
# Competitive Intelligence: {company}

## Date: {date}
## Period: Last 30 days

## Share of Voice (Estimated)
| Company | Mentions | Key Outlets | Dominant Narrative |
|---------|----------|-------------|-------------------|
| {ours}  | ~{N}     | {outlets}   | {narrative}       |
| {comp1} | ~{N}     | {outlets}   | {narrative}       |
| {comp2} | ~{N}     | {outlets}   | {narrative}       |

## Competitor Activity

### {Competitor 1}
- **Recent Announcements:** {list}
- **Key Coverage:** {notable articles}
- **Messaging:** {what they're saying}
- **Threat Level:** {low/medium/high}

### {Competitor 2}
...

## Opportunities
1. **{opportunity}**: {why and how to execute}
2. **{opportunity}**: {why and how to execute}

## Recommended Actions
1. Counter-narrative: {action} → pr-strategist/messaging-framework
2. Target outlet: {outlet} → pr-outreach/research-journalist
3. Story angle: {angle} → pr-strategist/plan-campaign
```

## Rules

- Focus on PR activity, not product/feature comparisons
- Estimate share of voice from search result volume (rough is fine)
- Every finding should connect to an actionable recommendation
- Track competitor funding/partnerships as potential PR triggers
