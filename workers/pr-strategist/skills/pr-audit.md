# pr-audit

Audit current PR posture for a company: coverage, gaps, opportunities.

## Inputs

- `company` (required): Company name

## Steps

1. **Pull platform data**
   - `GET /api/clients` → find client_id
   - `GET /api/placements?client_id={id}` → all coverage
   - `GET /api/pitches?status=sent` + `?status=responded` → outreach activity
   - `GET /api/campaigns?client_id={id}` → campaign history
   - `GET /api/analytics?client_id={id}` → pipeline stats

2. **Web research**
   - WebSearch: `"{company name}" press coverage site:techcrunch.com OR site:forbes.com OR site:venturebeat.com`
   - WebSearch: `"{company name}" news` (last 90 days)
   - WebSearch: `"{CEO name}" interview OR podcast OR op-ed`
   - Compare against competitor coverage volume

3. **Analyze gaps**
   - Which outlet tiers are under-represented?
   - Which beats are not being targeted?
   - Is thought leadership present or absent?
   - Are there seasonal or event-based opportunities being missed?

4. **Output report**
   - Write to `workspace/reports/pr/{date}-{company}-pr-audit.md`:

```markdown
# PR Audit: {company}

## Date: {date}
## Period: Last 90 days

## Coverage Summary
- Total placements: {N}
- By tier: Tier 1: {N}, Tier 2: {N}, Tier 3: {N}
- By type: Articles: {N}, Mentions: {N}, Interviews: {N}, Podcasts: {N}
- Sentiment: Positive: {N}, Neutral: {N}, Negative: {N}

## Pipeline Health
- Active campaigns: {N}
- Pitches sent: {N}
- Response rate: {%}
- Placement rate: {%}

## Strengths
- {what's working well}

## Gaps
- {missing coverage areas}
- {untapped outlet tiers}
- {missing content types}

## Opportunities
1. {opportunity with rationale and timing}
2. {opportunity}
3. {opportunity}

## Recommended Actions
1. {action} → assign to {worker/skill}
2. {action} → assign to {worker/skill}
3. {action} → assign to {worker/skill}

## Competitive Benchmark
| Company | Placements (90d) | Tier 1 Hits | Sentiment |
|---------|-----------------|-------------|-----------|
| {ours}  | {N}             | {N}         | {ratio}   |
| {comp1} | {N}             | {N}         | {ratio}   |
```

## Platform API Reference

```
Authorization: Bearer {RPR_API_KEY}
Base URL: https://{company-6}pr.com
```
