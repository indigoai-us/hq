# plan-campaign

Create an end-to-end PR campaign plan for a launch or announcement.

## Inputs

- `company` (required): Company name ({company-1}, {company-2}, {company-3}, personal)
- `announcement` (required): What is being announced
- `story_type` (optional): launch, funding, thought-leadership, trend, event, milestone

## Steps

1. **Load company context**
   - Read `companies/{company}/knowledge/` for brand, product, positioning
   - Call platform API: `GET /api/clients` to find client_id for this company
   - Call `GET /api/stories?client_id={id}` to see existing stories and avoid overlap

2. **Research landscape**
   - WebSearch for recent news in the company's space (last 30 days)
   - WebSearch for competitor announcements
   - Identify timeliness hooks (industry events, trends, seasonal angles)

3. **Develop story angle**
   - Create the newsworthy angle connecting announcement to broader trend
   - Define key messages (3 max), each with proof point
   - Map to target outlets by tier:
     - Tier 1 (3-5): National tech press (TechCrunch, VentureBeat, Forbes Tech)
     - Tier 2 (5-10): Industry publications (sector-specific)
     - Tier 3 (5-10): Niche blogs, newsletters, podcasts

4. **Create story in platform**
   - Call `POST /api/stories` with: title, client_id, type, narrative, key_messages, proof_points
   - Call `POST /api/campaigns` with: name, client_id, story_id, description

5. **Write campaign plan**
   - Output to `workspace/reports/pr/{date}-{company}-plan-campaign.md`:

```markdown
# PR Campaign Plan: {title}

## Company: {company}
## Date: {date}
## Campaign ID: {id}
## Story ID: {id}

## Objective
{one sentence}

## Story Angle
{angle connecting announcement to trend}

## Key Messages
1. {message} — Proof: {proof point}
2. {message} — Proof: {proof point}
3. {message} — Proof: {proof point}

## Target Outlets
### Tier 1
- {outlet}: {journalist name if known} — {beat}

### Tier 2
- ...

### Tier 3
- ...

## Timeline
- Day 1: Press release draft (pr-writer/press-release)
- Day 2: Media list finalization (pr-outreach/build-media-list)
- Day 3: Pitch personalization (pr-outreach/personalize-pitch)
- Day 4: Embargo pitches to Tier 1
- Day 5-7: Broad outreach to Tier 2-3
- Day 10: Follow-up round 1
- Day 15: Follow-up round 2
- Day 20: Coverage report (pr-monitor/coverage-report)

## Success Metrics
- Target placements: {N}
- Target response rate: >25%
- Target Tier 1 hits: {N}

## Next Steps
- [ ] pr-writer/press-release for {announcement}
- [ ] pr-outreach/build-media-list for {story angle}
```

## Platform API Reference

All API calls use Bearer token auth:
```
Authorization: Bearer {RPR_API_KEY}
Base URL: https://{company-6}pr.com
```

| Endpoint | Method | Purpose |
|----------|--------|---------|
| /api/clients | GET | List all clients |
| /api/stories | GET/POST | List/create stories |
| /api/campaigns | GET/POST | List/create campaigns |
| /api/contacts | GET | List contacts for media list planning |
