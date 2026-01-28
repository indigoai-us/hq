---
description: Research and suggest posts aligned with life/OS goals
allowed-tools: Task, Read, Glob, Grep, WebSearch, WebFetch, AskUserQuestion
---

# /suggestposts - Strategic Content Suggestions

Research what Corey should be posting to progress overall life and OS goals.

## Context to Load

1. `agents.md` - Current roles, companies, strategic positioning
2. `knowledge/{your-name}/profile.md` - Identity, goals, audience
3. `knowledge/{your-name}/social-calendar.md` - Content strategy, themes
4. `social-content/drafts/INDEX.md` - What's already in the pipeline
5. `projects/social-presence-strategy/` - Lulu Meservey framework if exists

## Research Process

### 1. Audit Current State

**Check what's in queue:**
- `social-content/drafts/` - Pending drafts
- `workers/social/x-poster/queue.json` - Queued tasks

**Check recent activity:**
- What has Corey posted recently? (if tracking exists)
- Any gaps in content themes?

### 2. Research External Context

**Scan relevant sources:**
- AI/tech news (what's trending in Your space?)
- Competitor/peer activity (what are other founders posting?)
- Industry events (anything timely to react to?)

Use WebSearch for:
- "AI agents news today"
- "startup founder twitter trending"
- Topics from `knowledge/{your-name}/social-calendar.md`

### 3. Align with Strategic Goals

Reference Your positioning:

| Goal | Content Angle |
|------|---------------|
| **Ralph methodology thought leader** | Posts about autonomous AI, loops, building infrastructure |
| **e/acc identity** | Pro-technology, abundance mindset, forward-looking |
| **{Your Role}** | SMS, e-commerce, AI for brands |
| **Startup ecosystem voice** | Disruption observations, founder insights |
| **Human value in AI age** | Taste, creativity, agency themes |

### 4. Generate Suggestions

Provide 3-5 post ideas ranked by:
1. **Timeliness** - Is there a news hook?
2. **Alignment** - Does it progress strategic goals?
3. **Engagement potential** - Will it resonate with audience?
4. **Originality** - Is Corey uniquely positioned to say this?

For each suggestion, provide:
```
## Suggestion: {title}

**Hook:** {1-sentence pitch}
**Why now:** {timeliness/relevance}
**Goal alignment:** {which strategic goal it serves}
**Format:** {one-liner / short / article / thread}
**Effort:** {quick / medium / deep dive}

**Draft idea:**
> {rough draft or key points}
```

### 5. Cross-reference Existing Content

Check if we already have relevant drafts:
- Could an existing draft be adapted?
- Is there a queued item that addresses this?

### 6. Recommend Next Action

Ask user:
- "Want me to build out any of these with `/contentidea`?"
- "Should I check what's happening on X right now for real-time opportunities?"
- "Any of these feel off-brand or should be skipped?"

## Weekly Theme Reference

From social-calendar.md:
- **Monday:** AI/Tech trends
- **Tuesday:** Business insights
- **Wednesday:** Flex
- **Thursday:** Future of work
- **Friday:** Lighter content
- **Weekend:** Opportunistic

## Evergreen Themes That Always Work

- Taste, creativity, agency observations
- "X industry is gonna cook" format
- Platform vs brand dynamics
- Ralph/autonomous AI insights
- E-commerce/SMS strategy
- Disruption predictions

## Output Format

```
# Post Suggestions for {date}

## Today's Context
- Day: {day of week} → Theme: {theme}
- Trending: {relevant news if any}
- Queue status: {X drafts ready, Y pending}

## Recommendations

### 1. {Top suggestion}
...

### 2. {Second suggestion}
...

### 3. {Third suggestion}
...

## Existing Content That Could Work
- {draft title} - {why it's relevant now}

## Next Steps
- Run `/contentidea {suggestion}` to build out
- Run `/scheduleposts` to pick what to post now
```
