# op-ed

Draft thought leadership op-ed in {your-name}'s voice.

## Inputs

- `company` (required): Company name (often "personal" for thought leadership)
- `topic` (required): The thesis or argument
- `target_outlet` (optional): Publication to match tone for

## Steps

1. **Load voice**
   - Read `companies/personal/knowledge/voice-style.md` for {your-name}'s writing style
   - Read `agents-profile.md` for background and expertise areas
   - Read `companies/{company}/knowledge/` for domain expertise

2. **Research**
   - WebSearch for recent op-eds on similar topics (identify what's been said)
   - WebSearch for data points and examples to support the thesis
   - If target_outlet specified, WebSearch for their op-ed style and recent pieces

3. **Draft op-ed**
   Output to `workspace/pr-drafts/{company}/{date}-op-ed-{slug}.md`:

```markdown
# {Headline — provocative but defensible}

*By {Your Name}, {Title} of {Company}*

{Lede — hook the reader with a specific story, data point, or provocative statement. 2-3 sentences max.}

{Thesis paragraph — state the argument clearly. "Here's what most people get wrong about X..."}

{Evidence 1 — specific example, data, or experience that supports the thesis.}

{Evidence 2 — different angle or data point reinforcing the argument.}

{Counter-argument — acknowledge the strongest objection, then refute it.}

{Forward-looking — what should the reader/industry do differently?}

{Closing — circle back to opening, leave reader with actionable insight. One strong sentence.}
```

4. **Save as draft** (approval_required)

## Rules

- 600-800 words for most outlets
- Must have a clear, defensible thesis — not a product pitch
- Evidence-based: specific data, named examples, real experiences
- Match {your-name}'s voice: direct, no fluff, occasionally contrarian
- Address counter-arguments honestly
- No company promotion in the body — byline establishes credibility
- If target_outlet specified, match their editorial style and word count
