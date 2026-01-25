---
description: Choose what to post right now based on content inventory and current context
allowed-tools: Task, Read, Glob, Grep, WebSearch, WebFetch, AskUserQuestion, mcp__Claude_in_Chrome__tabs_context_mcp, mcp__Claude_in_Chrome__navigate, mcp__Claude_in_Chrome__computer, mcp__Claude_in_Chrome__get_page_text
---

# /scheduleposts - Smart Post Scheduling

Analyze available content, current feed state, and world events to recommend what to post RIGHT NOW.

## Context to Load

1. `social-content/drafts/INDEX.md` - All available drafts
2. `workers/social/x-corey/queue.json` - Queue with status
3. `knowledge/corey-epstein/social-calendar.md` - Timing strategy

## Process

### 1. Inventory Check

Read all ready drafts from `social-content/drafts/`:
- List each by type (one-liner, short, thread, article)
- Note which are marked "Ready" vs "Draft"
- Check last posted date if tracked

### 2. Check Current Context

**Time-based factors:**
- What day is it? (Monday = AI/Tech, Friday = lighter, etc.)
- What time? (9am, 2pm, 7pm MT are optimal)
- Any relevant dates/events?

**World context (WebSearch):**
- Major AI/tech news today?
- Anything Corey should react to?
- Competitor activity?

**Feed context (if browser available):**
- Use Chrome MCP to check Corey's X feed
- What's the current conversation?
- Any threads to jump into?
- What have similar accounts posted recently?

### 3. Match Content to Moment

Score each ready draft:

| Factor | Weight | Question |
|--------|--------|----------|
| **Timeliness** | 30% | Does this connect to what's happening now? |
| **Freshness** | 25% | How long has this been in queue? |
| **Day alignment** | 20% | Does it match today's theme? |
| **Engagement potential** | 15% | Will this spark conversation? |
| **Variety** | 10% | Have we posted similar content recently? |

### 4. Recommend Post(s)

Provide top 1-3 recommendations:

```
## Recommended to Post NOW

### Primary: {draft title}
**File:** {path}
**Type:** {one-liner/short/article}
**Why now:**
- {reason 1}
- {reason 2}

**Content preview:**
> {first 100 chars or hook}

**Post to:** X / LinkedIn / Both

---

### Alternative: {draft title}
...
```

### 5. Show Quick-Copy

For the top recommendation, provide copy-paste ready content:

```
## Quick Copy (ready to paste)

{exact content to post}
```

For threads, show post-by-post.

### 6. Execution Options

Ask user:
- "Ready to post the primary recommendation?"
- "Want me to open X and help you post it?" (if browser MCP available)
- "Should I hold this and suggest something else?"
- "Want to tweak the content first?"

### 7. Post-Selection Actions

If user confirms posting:
1. Update draft status in INDEX.md → move to "Posted" section
2. Update queue.json status → "posted"
3. Log to `workers/social/logs/x-corey.log`
4. Note the post for future "what did we post recently" queries

## Timing Guidelines

**Optimal posting times (MT):**
- 9am - Morning engagement
- 2pm - Afternoon peak
- 7pm - Evening scroll

**Day themes:**
- Monday: AI/Tech trends
- Tuesday: Business insights
- Wednesday: Flex
- Thursday: Future of work
- Friday: Lighter content

**Avoid:**
- Posting similar content same day
- Back-to-back articles (space them out)
- Threads when news is breaking (short posts cut through)

## Feed Analysis (if browser available)

When checking X feed:
1. Navigate to twitter.com/home
2. Screenshot and analyze:
   - What's dominating the feed?
   - Any breaking news?
   - What's the mood? (serious, playful, outraged)
3. Check @coreyepstein profile:
   - When was last post?
   - What got engagement?

## Output Format

```
# Post Scheduling - {date} {time}

## Current Context
- Day: {day} → Theme: {theme}
- Time: {time} MT → {optimal/suboptimal}
- Last post: {when, if known}
- Breaking news: {yes/no - summary if yes}

## Content Inventory
| Draft | Type | Status | Days in Queue |
|-------|------|--------|---------------|
| ... | ... | ... | ... |

## Recommendation

### Post This Now: {title}

**Why:**
- {reason}

**Quick Copy:**
```
{content}
```

**Platform:** X / LinkedIn

## Next Up
After this, consider posting: {next recommendation}
```
