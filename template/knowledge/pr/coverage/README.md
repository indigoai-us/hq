# Coverage Tracking

Track all media placements and coverage.

## Schema (`placements.jsonl`)
```json
{
  "id": "string (COV-YYYYMMDD-NNN)",
  "company": "string ({company-1}|{company-2}|{company-3}|personal)",
  "outlet": "string",
  "outlet_tier": "number (1-3)",
  "title": "string (article headline)",
  "url": "string",
  "date": "string (ISO date)",
  "type": "string (article|mention|interview|podcast|op-ed|social)",
  "sentiment": "string (positive|neutral|negative)",
  "reach_estimate": "number (estimated audience)",
  "pitch_id": "string (PITCH-* that led to this, or null if organic)",
  "notes": "string"
}
```

## Metrics
- **Placements per quarter:** total count by company
- **Tier distribution:** % Tier 1 vs 2 vs 3
- **Sentiment breakdown:** positive/neutral/negative ratio
- **Pitch-to-placement rate:** placements from pitches / total pitches
- **Organic coverage:** placements without direct pitch
