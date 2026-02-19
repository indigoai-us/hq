# pr-dashboard

Show PR pipeline across all companies — full agency dashboard.

## Inputs

- `company` (optional): Filter to one company. Default: all companies

## Steps

1. **Pull cross-company data**
   - `GET /api/clients` → all clients
   - For each client:
     - `GET /api/analytics?client_id={id}` → stats
     - `GET /api/campaigns?client_id={id}&status=active` → active campaigns
     - `GET /api/placements?client_id={id}` → recent placements

2. **Pull agency-wide metrics**
   - `GET /api/analytics` → overall stats (no client filter)
   - `GET /api/follow-ups` → follow-ups due
   - `GET /api/drafts?status=pending` → draft queue size
   - `GET /api/contacts` → total contact count

3. **Compile dashboard**
   - Write to `workspace/reports/pr/{date}-pr-dashboard.md`:

```markdown
# {Company-6} PR Dashboard

## Date: {date}

## Agency Overview
| Metric | Value |
|--------|-------|
| Active Clients | {N} |
| Active Campaigns | {N} |
| Total Contacts | {N} |
| Pitches in Flight | {N} |
| Response Rate (30d) | {%} |
| Placement Rate (30d) | {%} |
| Draft Queue | {N} pending |
| Follow-ups Due | {N} |

## By Client

### {Client Name}
- Active Campaigns: {N}
- Pitches Sent (30d): {N}
- Placements (30d): {N}
- Response Rate: {%}
- Top Campaign: {name} — {status}

### {Client Name}
...

## Pipeline Snapshot
| Stage | Count |
|-------|-------|
| Draft | {N} |
| Queued | {N} |
| Sent | {N} |
| Followed Up | {N} |
| Responded | {N} |
| Placed | {N} |

## Recent Placements (Last 7 Days)
1. **{outlet}**: "{title}" for {client} — {sentiment}
2. ...

## Action Items
1. {most urgent action}
2. {second priority}
3. {third priority}

## This Week's Plan
- {Monday: action}
- {Tuesday: action}
- {etc.}
```

## Platform API Reference

```
GET /api/clients — all clients
GET /api/analytics — overall or per-client stats
GET /api/campaigns — active campaigns
GET /api/placements — placements
GET /api/follow-ups — follow-ups due
GET /api/drafts?status=pending — pending drafts
GET /api/contacts — contact count
```
