# personalize-pitch

Personalize a base pitch for a specific journalist using their enrichment data.

## Inputs

- `pitch_id` (required): Platform pitch ID to personalize
- OR `campaign_id` (required): Personalize all draft pitches in a campaign

## Steps

1. **Load pitch data**
   - If pitch_id: `GET /api/pitches/{pitch_id}` → get pitch + contact info
   - If campaign_id: `GET /api/pitches?campaign_id={id}&status=draft` → all draft pitches

2. **For each pitch**:
   a. Get contact enrichment:
      - `GET /api/contacts/{contact_id}` → get enrichment data
      - Key info: recent articles, beat focus, pitch preferences

   b. Get campaign/story context:
      - `GET /api/campaigns/{campaign_id}` → story angle, key messages

   c. Personalize:
      - **Hook**: Reference a specific recent article by this journalist
      - **Connection**: Link our story to their beat focus
      - **Tone**: Match the outlet's style (trade pub vs national press vs blog)
      - **CTA**: Tailor the ask (exclusive for Tier 1, data access for Tier 2, demo for Tier 3)

   d. Update pitch:
      - `PUT /api/pitches/{id}` with personalized subject, body, personalization_notes
      - Keep pitch under 150 words

3. **Output summary**
   - Write to `workspace/pr-drafts/{company}/pitches/{date}-personalized-{campaign-slug}.md`

## Rules

- Every pitch must reference something specific about the journalist
- "I read your article on X" must cite a real, recent article (from enrichment)
- Pitch body stays under 150 words after personalization
- Don't change the core story — only the hook, framing, and CTA
- Subject line must be personalized (not identical across all pitches)
- Pitches remain in draft status — they go to draft_queue for approval

## Platform API Reference

```
GET /api/pitches/{id} — get pitch details
GET /api/pitches?campaign_id={id}&status=draft — list draft pitches
GET /api/contacts/{id} — get contact with enrichment
PUT /api/pitches/{id} — update pitch content
```
