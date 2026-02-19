# Pitch Library

Track all pitches sent, their status, and outcomes.

## Schema (`pitches.jsonl`)
```json
{
  "id": "string (PITCH-YYYYMMDD-NNN)",
  "company": "string ({company-1}|{company-2}|{company-3}|personal)",
  "type": "string (launch|funding|thought-leadership|trend|event)",
  "subject": "string (email subject line)",
  "journalist": "string (journalist name)",
  "outlet": "string (outlet name)",
  "status": "string (draft|sent|followed_up|responded|placed|declined|no_response)",
  "sent_date": "string (ISO date or null)",
  "follow_up_dates": ["string (ISO dates)"],
  "response": "string (journalist response summary or null)",
  "placement_url": "string (published article URL or null)",
  "notes": "string"
}
```

## Status Flow
```
draft → sent → followed_up → responded → placed
                                        → declined
                           → no_response
```

## Metrics
- **Response rate:** responses / pitches sent
- **Placement rate:** placed / pitches sent
- **Follow-up effectiveness:** responses after follow-up / total follow-ups
