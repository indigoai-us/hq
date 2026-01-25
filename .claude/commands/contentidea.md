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

1. `knowledge/corey-epstein/voice-style.md` - Voice, formats, patterns
2. `knowledge/corey-epstein/profile.md` - Identity, companies, positioning
3. `social-content/drafts/INDEX.md` - Current draft inventory
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
  - See `knowledge/corey-epstein/voice-style.md` for X Article format

**If deep+:**
- LinkedIn long post (~300-500 words)

**If foundational:**
- Suggest: "This idea could become a {microsite/repo/project}. Want me to scaffold it?"
- Location would be: `projects/{idea-slug}/` or `repos/public/{idea-slug}/`

### 4. Store Drafts

Save all drafts to `social-content/drafts/`:
- X content → `x/{date}-{slug}-{type}.md`
- LinkedIn → `linkedin/{date}-{slug}.md`

Update `social-content/drafts/INDEX.md` with new entries.

### 5. Update Queue

Add to `workers/social/x-corey/queue.json`:
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

### 6. Generate Images (After Content Approval)

Once user approves the written content, generate 10 image variants using gnb:

```bash
cd apps/gemini-nano-banana && node dist/index.js generate "<visual prompt>" --landscape --output ./output --metadata
```

**Image Generation Guidelines:**
- Generate 10 variants exploring different visual concepts
- Style: realistic/dreamy (Midjourney/Perplexity aesthetic), NOT pure fantasy
- Use metaphors that visualize the core concept
- Run generations in parallel (background with &)
- Open all for user to review and select

**Visual Prompt Patterns:**
- Person orchestrating/observing autonomous work
- Architectural metaphors (city, building, rooms)
- Nature metaphors (garden, ecosystem, constellation)
- Professional settings with ethereal elements
- Magic realism over high fantasy

Save selected image to `social-content/images/{date}-{slug}.png`

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

## Step 8: Mark Idea as Processed

After all drafts are saved, update the inbox entry:

1. Find the entry in `workspace/content-ideas/inbox.jsonl` by ID
2. Update status to "processed"
3. Add `processed_to` array with paths to created drafts

Example updated entry:
```jsonl
{"id":"idea-1705312200","raw":"AI gave everyone a workforce...","created":"2026-01-15T10:30:00Z","status":"processed","tags":["ai","ralph"],"processed_to":["social-content/drafts/x/2026-01-15-ai-workforce-oneliner.md","social-content/drafts/x/2026-01-15-ai-workforce-article.md"]}
```
