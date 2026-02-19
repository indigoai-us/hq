# send-pitch

Send approved pitches via the platform (approval-gated).

## Inputs

- `pitch_id` (optional): Single pitch to send
- `campaign_id` (optional): Send all queued pitches in a campaign

## Steps

1. **Verify pitches are ready**
   - If pitch_id: `GET /api/pitches/{pitch_id}` → verify status is "draft" or "queued"
   - If campaign_id: `GET /api/pitches?campaign_id={id}&status=queued` → all queued pitches
   - Verify each pitch has: subject, body, contact with email

2. **Pre-send checklist**
   For each pitch, verify:
   - [ ] Subject line is personalized (not generic)
   - [ ] Body is under 150 words
   - [ ] Contact has valid email
   - [ ] No duplicate outlet (not pitching 2 journalists at same outlet)
   - [ ] Daily send count < 25

3. **Request approval**
   - Display each pitch: To, Subject, Preview of body
   - **STOP and wait for explicit user approval before sending**
   - This is an approval gate — never auto-send

4. **Send approved pitches**
   - For each approved pitch:
     - `POST /api/pitches/{id}/send`
     - This calls Resend to send the email, creates a thread, links to pitch, updates status to "sent"
   - Log results

5. **Output summary**
   - Report: {N} sent, {N} skipped, any errors

```markdown
# Pitch Send Report

## Date: {date}
## Campaign: {campaign name}

| # | Contact | Outlet | Subject | Status |
|---|---------|--------|---------|--------|
| 1 | {name}  | {outlet} | {subject} | Sent ✓ |
| 2 | {name}  | {outlet} | {subject} | Skipped (no email) |

## Daily Total: {N}/25
```

## Rules

- **NEVER send without explicit user approval** — this is the #1 rule
- Max 25 sends per day (advisory cap)
- Verify no duplicate outlets before sending batch
- If a pitch send fails, log the error and continue with remaining
- After sending, follow-up is due in 5 days (tracked by platform)

## Platform API Reference

```
GET /api/pitches/{id} — get pitch details
GET /api/pitches?campaign_id={id}&status=queued — list queued pitches
POST /api/pitches/{id}/send — send pitch (creates email thread)
```
