# sentiment-scan

Analyze sentiment of recent coverage and social mentions.

## Inputs

- `company` (required): Company name
- `days` (optional): Look back period (default: 30)

## Steps

1. **Gather coverage**
   - `GET /api/placements?client_id={id}` → filter by date range
   - WebSearch: `"{company name}" review OR opinion OR analysis` (last {days} days)
   - WebSearch: `"{company name}" site:twitter.com OR site:reddit.com OR site:news.ycombinator.com`

2. **Analyze sentiment for each mention**
   For each piece of coverage:
   - Classify: positive, neutral, negative
   - Identify key phrases and themes
   - Note the author and outlet for relationship context

3. **Identify trends**
   - Is sentiment shifting? (compare to baseline)
   - Are there recurring themes in negative coverage?
   - What topics generate the most positive coverage?

4. **Output report**
   - Write to `workspace/reports/pr/{date}-{company}-sentiment-scan.md`:

```markdown
# Sentiment Scan: {company}

## Period: Last {days} days
## Date: {date}

## Overall Sentiment
- Score: {positive%} positive / {neutral%} neutral / {negative%} negative
- Trend: {improving / stable / declining} vs. previous period

## Sentiment by Source Type
| Source | Positive | Neutral | Negative |
|--------|----------|---------|----------|
| Tech Press | {N} | {N} | {N} |
| Industry Pubs | {N} | {N} | {N} |
| Social Media | {N} | {N} | {N} |
| Blogs/Newsletters | {N} | {N} | {N} |

## Key Themes

### Positive
- {theme}: "{example quote}" — {source}

### Neutral
- {theme}: "{example quote}" — {source}

### Negative
- {theme}: "{example quote}" — {source}

## Alerts
{Any negative coverage requiring immediate attention}

## Recommendations
- {how to amplify positive themes}
- {how to address negative themes}
```

## Rules

- Flag any negative Tier 1 coverage immediately
- Track sentiment trends over time, not just snapshots
- Social media mentions are signal, not definitive sentiment
