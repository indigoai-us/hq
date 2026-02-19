# messaging-framework

Build messaging hierarchy: key messages, proof points, talking points, Q&A.

## Inputs

- `company` (required): Company name
- `topic` (required): The product, feature, or narrative to build messaging around
- `audience` (optional): Primary audience (journalists, investors, customers)

## Steps

1. **Load context**
   - Read `companies/{company}/knowledge/` for product details, positioning, brand guidelines
   - Load any existing stories from platform: `GET /api/stories?client_id={id}`

2. **Research**
   - WebSearch for how competitors message similar products
   - WebSearch for industry terminology and trends relevant to topic
   - Identify what resonates with target audience

3. **Build framework**
   - Output to `workspace/reports/pr/{date}-{company}-messaging-framework.md`:

```markdown
# Messaging Framework: {topic}

## Company: {company}
## Date: {date}

## Headline Message
{Single sentence that captures the core value proposition}

## Key Messages (max 3)

### 1. {Message}
- **Proof Point:** {specific data, customer example, or product capability}
- **Talking Point:** {how to say this in conversation}
- **For Press:** {how to frame for journalists}

### 2. {Message}
- **Proof Point:** {proof}
- **Talking Point:** {conversational}
- **For Press:** {media framing}

### 3. {Message}
- **Proof Point:** {proof}
- **Talking Point:** {conversational}
- **For Press:** {media framing}

## Positioning Statement
For {target audience} who {need/pain}, {product} is a {category} that {key differentiator}. Unlike {competitor/alternative}, {product} {unique value}.

## Q&A

**Q: {anticipated question}**
A: {answer using key messages}

**Q: {competitive question}**
A: {answer}

**Q: {technical/skeptical question}**
A: {answer}

## Do's and Don'ts
- DO: {messaging guidance}
- DON'T: {anti-patterns to avoid}

## Boilerplate
{company boilerplate paragraph for press releases}
```

## Rules

- Max 3 key messages — fewer is better
- Every message needs a concrete proof point (no unsupported claims)
- Talking points should sound natural, not corporate
- Q&A should anticipate tough questions, not softball ones
