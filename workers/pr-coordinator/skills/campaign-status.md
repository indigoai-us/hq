# campaign-status

Check status of an active PR campaign using platform data.

## Inputs

- `campaign_id` (optional): Specific campaign. If omitted, show all active campaigns
- `company` (optional): Filter to company

## Steps

1. **Pull campaign data**
   - If campaign_id: `GET /api/campaigns/{id}` → campaign details
   - If company: `GET /api/campaigns?client_id={id}&status=active`
   - Else: `GET /api/campaigns?status=active` → all active

2. **For each campaign, get pipeline stats**
   - `GET /api/pitches?campaign_id={id}` → all pitches
   - Count by status: draft, queued, sent, followed_up, responded, placed, declined, no_response
   - Calculate: response rate, placement rate, avg days in current stage

3. **Check follow-ups due**
   - `GET /api/follow-ups` → count of pitches needing follow-up

4. **Check draft queue**
   - `GET /api/drafts?status=pending` → pending approvals

5. **Output report**
   - Write to `workspace/reports/pr/{date}-campaign-status.md`:

```markdown
# Campaign Status Report

## Date: {date}

## Active Campaigns: {N}

### {Campaign Name} ({company})
**Story:** {story title}
**Created:** {date}
**Status:** {status}

| Stage | Count | % |
|-------|-------|---|
| Draft | {N} | {%} |
| Queued | {N} | {%} |
| Sent | {N} | {%} |
| Followed Up | {N} | {%} |
| Responded | {N} | {%} |
| Placed | {N} | {%} |
| Declined | {N} | {%} |
| No Response | {N} | {%} |

**Response Rate:** {%}
**Placement Rate:** {%}
**Follow-ups Due:** {N}
**Drafts Pending:** {N}

**Next Action:** {what should happen next}

---

## Summary
- Total active campaigns: {N}
- Total pitches in flight: {N}
- Follow-ups due today: {N}
- Drafts awaiting approval: {N}

## Recommended Actions
1. {action}
2. {action}
```

## Platform API Reference

```
GET /api/campaigns — list campaigns
GET /api/campaigns/{id} — campaign detail
GET /api/pitches?campaign_id={id} — pitches for campaign
GET /api/follow-ups — follow-ups due count
GET /api/drafts?status=pending — pending drafts
```
