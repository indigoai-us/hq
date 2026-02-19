# talking-points

Create structured talking points for interviews or events.

## Inputs

- `company` (required): Company name
- `topic` (required): Interview topic, event, or announcement
- `format` (optional): interview, panel, podcast, media-training (default: interview)

## Steps

1. **Load context**
   - Read `companies/{company}/knowledge/` for product details and positioning
   - Load template: `knowledge/public/pr/templates/talking-points-template.md`
   - WebSearch for recent coverage of topic for context

2. **Draft talking points**
   Output to `workspace/pr-drafts/{company}/{date}-talking-points-{slug}.md`:

```markdown
# Talking Points: {topic}

## Company: {company}
## Format: {interview/panel/podcast}
## Date: {date}

## Key Messages (Max 3)

### 1. {Core Message}
- **Say this:** "{Natural language version}"
- **Proof point:** {specific data or example}
- **Bridge from:** If asked about {related topic}, bridge to this message

### 2. {Secondary Message}
- **Say this:** "{Natural language version}"
- **Proof point:** {evidence}
- **Bridge from:** {common question that leads here}

### 3. {Supporting Message}
- **Say this:** "{Natural language version}"
- **Proof point:** {evidence}

## Anticipated Questions & Answers

**Q: {likely question}**
A: {answer that bridges to key message}

**Q: {tough question}**
A: {honest answer, then bridge}

**Q: {competitive question}**
A: {acknowledge, differentiate, bridge}

## Bridging Phrases
- "What's really interesting about that is..."
- "The bigger picture here is..."
- "What our data shows is..."
- "The way I'd frame that is..."

## Don't Say
- {specific phrases to avoid}
- {competitor names to not mention}
- {unannounced details}

## Sound Bites
- "{Memorable 10-word quote for headline}"
- "{Memorable 10-word quote for headline}"
```

## Rules

- Max 3 key messages — anything more dilutes the message
- Every message needs a specific proof point
- Answers should sound conversational, not scripted
- Include bridging techniques for off-topic questions
- Anticipate the hardest questions, not just friendly ones
