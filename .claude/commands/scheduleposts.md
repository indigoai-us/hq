---
description: Choose what to post right now based on content inventory and current context
allowed-tools: Task, Read, Glob, Grep, WebSearch, WebFetch, AskUserQuestion
---

# /scheduleposts - Smart Post Scheduling

Analyze available content, current context, and world events to recommend what to post RIGHT NOW.

## Context to Load

1. `social-content/drafts/INDEX.md` - All available drafts
2. `workers/social/{platform}/queue.json` - Queue with status
3. `knowledge/{your-name}/social-calendar.md` - Timing strategy (if exists)

## Process

### 1. Inventory Check

Read all ready drafts from `social-content/drafts/`:
- List each by type (one-liner, short, thread, article)
- Note which are marked "Ready" vs "Draft"
- Check last posted date if tracked

### 2. Check Current Context

**Time-based factors:**
- What day is it? (Monday = professional, Friday = lighter, etc.)
- What time? (Morning, afternoon, evening optimal windows)
- Any relevant dates/events?

**World context (WebSearch):**
- Major news in your domain today?
- Anything you should react to?
- Competitor/peer activity?

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
- "Should I hold this and suggest something else?"
- "Want to tweak the content first?"

### 7. Post-Selection Actions

If user confirms posting:
1. Update draft status in INDEX.md → move to "Posted" section
2. Update queue.json status → "posted"
3. Note the post for future "what did we post recently" queries

## Timing Guidelines

**Optimal posting times:**
- Morning (8-10am local) - Morning engagement
- Afternoon (1-3pm local) - Afternoon peak
- Evening (6-8pm local) - Evening scroll

**Day themes (customize in social-calendar.md):**
- Monday: Industry/professional topics
- Tuesday: Business insights
- Wednesday: Flex
- Thursday: Future-focused
- Friday: Lighter content

**Avoid:**
- Posting similar content same day
- Back-to-back articles (space them out)
- Threads when news is breaking (short posts cut through)

## Output Format

```
# Post Scheduling - {date} {time}

## Current Context
- Day: {day} → Theme: {theme}
- Time: {time} → {optimal/suboptimal}
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
