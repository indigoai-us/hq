# follow-up

Generate and queue follow-up emails for non-responsive pitches.

## Inputs

- `campaign_id` (optional): Scope to a specific campaign
- `days` (optional): Days since last contact before follow-up (default: 5)

## Steps

1. **Find pitches due for follow-up**
   - `GET /api/follow-ups` → returns count of pitches due
   - Or manually: `GET /api/pitches?status=sent` and filter by sent_at > {days} ago

2. **Generate follow-ups**
   - `POST /api/follow-ups` → triggers AI follow-up generation for all due pitches
   - This creates draft_queue items with type "follow_up"
   - Each follow-up references the original pitch thread

3. **Review queue**
   - `GET /api/drafts?type=follow_up&status=pending` → list generated follow-ups
   - Display each: original pitch context, follow-up draft, contact info
   - **Require approval before sending**

4. **Output summary**
   - Write to `workspace/reports/pr/{date}-follow-up-report.md`:

```markdown
# Follow-Up Report

## Date: {date}
## Pitches Due for Follow-Up: {N}
## Follow-Ups Generated: {N}

| # | Contact | Original Pitch | Days Since Sent | Follow-Up # | Status |
|---|---------|---------------|-----------------|-------------|--------|
| 1 | {name}  | {subject}     | {N} days        | {1st/2nd}   | Queued |

## Next Steps
- Review and approve follow-ups in /drafts
- Pitches with 2+ follow-ups and no response → consider "no_response" status
```

## Rules

- Follow-up at day 5 (1st) and day 10 (2nd)
- After 2 follow-ups with no response, recommend marking as "no_response"
- Follow-ups should add new value (new angle, new data) — not just "checking in"
- All follow-ups go through draft_queue (approval required)
- Never follow up on pitches that received a decline

## Platform API Reference

```
GET /api/follow-ups — count pitches due for follow-up
POST /api/follow-ups — generate follow-up drafts
GET /api/drafts?type=follow_up — list pending follow-ups
PUT /api/drafts — approve/reject follow-ups
```
