# coordinate-content

Coordinate with content team for social amplification of PR wins.

## Inputs

- `company` (required): Company name
- `placement_url` (optional): Specific placement to amplify
- `campaign_id` (optional): Campaign with recent placements to amplify

## Steps

1. **Identify content to amplify**
   - If placement_url: use that specific placement
   - If campaign_id: `GET /api/placements?campaign_id={id}` → recent placements
   - Else: `GET /api/placements?client_id={id}` → filter to last 7 days, positive sentiment

2. **For each placement, create content brief**
   - Key quote or data point from the coverage
   - Link to the article
   - Suggested social angles (2-3 options)
   - Tone guidance per platform (X vs LinkedIn)

3. **Create briefs for content team**
   - Write to `workspace/pr-drafts/{company}/content-briefs/{date}-amplify-{slug}.md`:

```markdown
# Content Amplification Brief

## Placement
- **Outlet:** {outlet name}
- **Title:** "{article title}"
- **URL:** {url}
- **Type:** {article/interview/podcast}
- **Sentiment:** {positive/neutral}

## Key Pull Quotes
- "{notable quote from the article}"
- "{data point or insight}"

## Social Angles

### Option 1: {angle}
**X (Twitter):** "{Draft tweet — under 280 chars}"
**LinkedIn:** "{Draft LinkedIn post — 2-3 paragraphs}"

### Option 2: {angle}
**X:** "{Draft tweet}"
**LinkedIn:** "{Draft post}"

## Timing
- Post within {N} hours of publication for maximum impact
- Share to: {X, LinkedIn, company channels}

## Tags/Mentions
- Mention: @{journalist handle} (credit the reporter)
- Hashtags: {relevant hashtags}
- Tag: @{outlet handle}
```

4. **Handoff to content workers**
   - Note: Use `/run x-{your-handle}` for X posting
   - Use content-brand worker for brand consistency check
   - All social posts require approval

## Rules

- Amplify within 24-48 hours of publication (timeliness matters)
- Always credit the journalist (tag/mention them)
- Don't overshare — 1-2 social posts per placement, max
- LinkedIn for professional/industry placements, X for breaking news
- Never amplify negative coverage
- All social posts go through approval
