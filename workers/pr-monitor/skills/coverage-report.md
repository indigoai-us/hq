# coverage-report

Generate coverage report for a time period from platform data.

## Inputs

- `company` (required): Company name
- `period` (optional): "week", "month", "quarter" (default: "month")

## Steps

1. **Pull platform data**
   - `GET /api/clients` → find client_id
   - `GET /api/placements?client_id={id}` → all placements
   - `GET /api/analytics?client_id={id}` → aggregated stats
   - `GET /api/campaigns?client_id={id}` → campaign context
   - `GET /api/pitches?status=placed` → successful pitches

2. **Filter by period**
   - Filter placements to the specified time period

3. **Analyze**
   - Total placements by type (article, mention, interview, podcast, op-ed, social)
   - Placements by outlet tier (1, 2, 3)
   - Sentiment distribution
   - Total estimated reach
   - Pitch-to-placement conversion rate
   - Compare to previous period if data available

4. **Output report**
   - Write to `workspace/reports/pr/{date}-{company}-coverage-report.md`:

```markdown
# Coverage Report: {company}

## Period: {start_date} — {end_date}
## Generated: {date}

## Executive Summary
{2-3 sentence summary of coverage performance}

## Key Metrics
| Metric | This Period | Previous | Change |
|--------|------------|----------|--------|
| Total Placements | {N} | {N} | {+/-N} |
| Tier 1 Hits | {N} | {N} | {+/-N} |
| Estimated Reach | {N} | {N} | {+/-N} |
| Response Rate | {%} | {%} | {+/-} |
| Placement Rate | {%} | {%} | {+/-} |

## Placements by Type
| Type | Count | % of Total |
|------|-------|-----------|
| Article | {N} | {%} |
| Mention | {N} | {%} |
| Interview | {N} | {%} |
| Podcast | {N} | {%} |

## Placements by Tier
| Tier | Count | Estimated Reach |
|------|-------|----------------|
| Tier 1 | {N} | {reach} |
| Tier 2 | {N} | {reach} |
| Tier 3 | {N} | {reach} |

## Sentiment
- Positive: {N} ({%})
- Neutral: {N} ({%})
- Negative: {N} ({%})

## Notable Placements
1. **{outlet}**: "{title}" — {type}, {sentiment}
2. ...

## Campaign Performance
| Campaign | Pitches Sent | Responses | Placements | Rate |
|----------|-------------|-----------|------------|------|
| {name}   | {N}         | {N}       | {N}        | {%}  |

## Recommendations
1. {what to do more of}
2. {what to adjust}
3. {new opportunities}
```

## Platform API Reference

```
GET /api/placements?client_id={id} — all placements
GET /api/analytics?client_id={id} — aggregated stats
GET /api/campaigns?client_id={id} — campaigns
```
