---
description: Build out a content idea into posts, threads, articles, and potentially microsites
allowed-tools: Task, Read, Glob, Grep, Edit, Write, Bash, WebSearch, WebFetch, AskUserQuestion, TodoWrite
argument-hint: [idea description]
---

# /contentidea - Content Idea Builder

Transform a raw content idea into a full content suite.

**Input idea:** $ARGUMENTS

## Step 0: Log Raw Idea

**Before doing anything else**, append the raw idea to the inbox:

1. Generate a slug from the idea (e.g., "ai-workforce-management")
2. Create a unique ID: `idea-{timestamp}`
3. Append to `workspace/content-ideas/inbox.jsonl`:

```jsonl
{"id":"idea-{timestamp}","raw":"$ARGUMENTS","created":"{ISO8601}","status":"processing","tags":[],"processed_to":null}
```

This ensures every idea is captured, even if processing is interrupted.

## Context to Load

1. `companies/personal/knowledge/voice-style.md` - Voice, formats, patterns
2. `companies/personal/knowledge/profile.md` - Identity, companies, positioning
3. `workspace/social-drafts/INDEX.md` - Current draft inventory
4. `knowledge/Ralph/` - If idea relates to Ralph methodology

## Process

### 1. Understand the Idea
- What's the core insight?
- Who's the audience? (X followers, LinkedIn professionals, broader public)
- What action should the reader take?
- Is this timely or evergreen?

### 2. Assess Scope
Ask: How profound is this idea?

| Scope | Output |
|-------|--------|
| **Quick take** | One-liner + short post |
| **Medium depth** | Above + thread OR article |
| **Deep insight** | Full suite: one-liner, short, thread, article, LinkedIn |
| **Foundational** | All above + consider microsite/repo for OS |

### 3. Generate Content Suite

Based on scope, create drafts in this order:

**Always:**
- X one-liner (< 280 chars) - the hook
- X short post (< 280 chars) - slightly expanded

**If medium+:**
- X article (1500-3000 words, Dan Koe style)
  - Structure: Title → Hook → Numbered sections → Protocol → Choice/CTA
  - See `knowledge/{your-name}/voice-style.md` for X Article format

**If deep+:**
- LinkedIn long post (~300-500 words)

**If foundational:**
- Suggest: "This idea could become a {microsite/repo/project}. Want me to scaffold it?"
- Location would be: `projects/{idea-slug}/` or `repos/public/{idea-slug}/`

### 4. Store Drafts

Save all drafts to `workspace/social-drafts/`:
- X content → `x/{date}-{slug}-{type}.md`
- LinkedIn → `linkedin/{date}-{slug}.md`

Update `workspace/social-drafts/INDEX.md` with new entries.

### 5. Update Queue

Add to `workers/x-{your-name}/queue.json`:
```json
{
  "id": "{slug}-{type}-001",
  "type": "post|article",
  "topic": "{description}",
  "status": "draft_ready",
  "created": "{date}",
  "draft_file": "social-content/drafts/x/{filename}"
}
```

### 6. Generate Images (REQUIRED)

**ALWAYS generate images as part of content creation.** This happens automatically after writing drafts—do not skip.

1. Create output directory: `workspace/social-drafts/images/{date}-{slug}/`
2. Generate one image per style (7 total) for variety:

```bash
cd ~/Documents/HQ/repos/private/gemini-nano-banana

# Generate one image per approved style
for style in woodcut grainy minimal blackprint duotone vaporwave liminal; do
  node dist/index.js social "<visual metaphor prompt>" \
    --style $style \
    --variants 1 \
    --output ~/Documents/HQ/workspace/social-drafts/images/{date}-{slug} \
    --metadata
done
```

3. Wait for completion, then sync to preview site (Step 6b)

**Approved Styles:**

| Style | Best For | Aesthetic |
|-------|----------|-----------|
| `woodcut` | Philosophy, timeless ideas | B&W engraving, 1800s encyclopedia |
| `grainy` | Action, energy, nostalgia | 35mm film grain, orange/teal, lo-fi |
| `minimal` | Clean concepts, focus | White negative space, sparse |
| `blackprint` | Technical, systems | Black ink on white, patent illustration |
| `duotone` | Bold statements | Two-color halftone, poster quality |
| `vaporwave` | Retro-futurism, ironic | Pink/cyan, 80s computer |
| `liminal` | Future, transformation | Dark thresholds, warm portals |
| `cinematic` | Epic scale, vision | Silhouette against dramatic sky |

**Visual Prompt Patterns by Theme:**

AI/Workforce themes:
- "A single person at a glowing control panel, robotic arms working in synchronization behind them"
- "A conductor's baton leaving trails of light that become working machinery"
- "Mission control with one person and a hundred screens showing autonomous operations"

Creativity/Capitol themes:
- "People in gray suits walking through a doorway, emerging as elaborately dressed artists"
- "A factory production line where the product is beauty"
- "Human hands releasing origami birds that transform into real ones mid-flight"

Tools/Precision themes:
- "A Swiss Army knife next to a master craftsman's single perfect tool"
- "A surgeon's hands performing an operation with a single ray of light"
- "A cluttered toolbox versus a single gleaming instrument on velvet"

Systems/Infrastructure themes:
- "A city's power grid visualized as glowing arteries beneath glass streets"
- "A neural network that looks like a city at night, each node a lit window"
- "A clock face with visible gears, each gear a different system in harmony"

Transformation/Future themes:
- "A horizon where old tools set like the sun while new ones rise"
- "A caterpillar cocoon that's actually a server, butterfly emerging as pure capability"
- "The present moment as a door between the old world and the new"

Leverage/Scale themes:
- "A single finger pushing a domino that triggers a massive chain reaction"
- "A person's desk that extends infinitely in all directions, work happening everywhere"
- "A small match lighting a signal fire visible from space"

### 6b. Sync to Preview Site (REQUIRED)

After images are generated, sync them to the preview site for approval:

```bash
# Copy images to preview site
cp -r ~/Documents/HQ/workspace/social-drafts/images/{date}-{slug} \
  ~/Documents/HQ/repos/private/social-drafts/images/

# Deploy to Vercel
cd ~/Documents/HQ/repos/private/social-drafts && \
git add images/{date}-{slug} && \
git commit -m "Add images for {slug}" && \
git push
```

Then update `repos/private/social-drafts/index.html` to include the new images in the drafts array.

User reviews images at preview site, selects best variant, and approves for posting.

Save selected image to `workspace/social-drafts/images/{date}-{slug}/selected.png`

### 7. Report

Show user:
- Summary of what was created
- Links to draft files
- Generated images for selection
- Suggested posting order
- If foundational: ask about microsite/project expansion

## Content Formats Reference

**X One-liner:** Hook that makes people stop scrolling. Provocative or insightful.

**X Short Post:** Slightly expanded take. Still punchy.

**X Article (Dan Koe style):**
1. Bold title with transformative promise
2. Personal, contrarian opening hook
3. Numbered sections (I, II, III...) with bold subheadings
4. Short paragraphs, italics for emphasis
5. "Protocol" or actionable steps near end
6. Choice/call-to-action closing

**LinkedIn:** Professional but direct. Can be longer. Often more reflective.

## Examples

**Input:** "AI gave everyone a workforce but nobody knows how to manage it"

**Output:**
- One-liner: "You have 1,000 employees waiting..."
- Short: "AI gave everyone a free workforce..."
- Article: "How to build your empire while everyone else..."
- LinkedIn: "You have 1,000 employees ready to work for you..."

## Voice Reminders

- Direct, confident, forward-looking
- No corporate jargon
- No hedging
- Humor: strategic, not forced
- Emojis: minimal (🫡 occasionally)

## CRITICAL: Humanizer Rules (Anti-AI Slop)

**ALWAYS apply these rules to all content.** Based on Wikipedia's AI writing patterns guide.

### Never Use These Patterns:

**Rhetorical questions** - Don't ask "Sound familiar?" or "Where do you think...?" Just state things.

**Significance inflation** - No "pivotal", "testament", "vital role", "marking a shift", "underscores", "highlights its importance"

**Superficial -ing endings** - No "highlighting...", "underscoring...", "reflecting...", "symbolizing...", "showcasing..."

**Promotional language** - No "groundbreaking", "vibrant", "nestled", "breathtaking", "stunning"

**Em dash overuse** - Use commas and periods instead. One em dash per article max.

**Rule of three** - Don't force ideas into groups of three

**AI vocabulary words** - Avoid: additionally, crucial, delve, enhance, fostering, garner, interplay, intricate, landscape (abstract), pivotal, showcase, tapestry, underscore, vibrant

**Copula avoidance** - Use "is/are/has" not "serves as/stands as/marks/represents/boasts/features"

**Negative parallelisms** - No "It's not just X, it's Y" or "Not only...but..."

**Title Case headings** - Use sentence case: "Strategic negotiations" not "Strategic Negotiations"

**Generic positive conclusions** - No "The future looks bright" or "Exciting times lie ahead"

### Do This Instead:

**Have opinions** - React to facts, don't just report them

**Use first person** - "I keep thinking about..." "I don't know why..." "I'm running three companies..."

**Be specific** - Name sources, give numbers, cite examples

**Vary rhythm** - Mix short punchy sentences with longer ones

**Acknowledge complexity** - "I don't know" is human

**Let some mess in** - Perfect structure feels algorithmic

### Before/After Examples:

❌ "This serves as a pivotal moment in the evolution of AI, underscoring its vital role in reshaping how we work."

✅ "AI changed how I work. I don't think we're going back."

❌ "Have you ever wondered what happens when automation takes over? Sound familiar?"

✅ "Automation took over my boring work. Now I do something else with that time."

❌ "It's not just about the technology — it's about the mindset shift that comes with embracing these groundbreaking tools."

✅ "The technology matters less than deciding to use it differently."

## Step 8: Mark Idea as Processed

After all drafts are saved, update the inbox entry:

1. Find the entry in `workspace/content-ideas/inbox.jsonl` by ID
2. Update status to "processed"
3. Add `processed_to` array with paths to created drafts

Example updated entry:
```jsonl
{"id":"idea-1705312200","raw":"AI gave everyone a workforce...","created":"2026-01-15T10:30:00Z","status":"processed","tags":["ai","ralph"],"processed_to":["social-content/drafts/x/2026-01-15-ai-workforce-oneliner.md","social-content/drafts/x/2026-01-15-ai-workforce-article.md"]}
```
