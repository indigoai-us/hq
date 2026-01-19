---
description: Research and suggest posts aligned with your goals
allowed-tools: Task, Read, Glob, Grep, WebSearch, WebFetch, AskUserQuestion
---

# /suggestposts - Strategic Content Suggestions

Research what you should be posting to progress your overall goals.

## Context to Load

1. `knowledge/{your-name}/profile.md` - Identity, goals, audience
2. `knowledge/{your-name}/voice-style.md` - Content style, themes
3. `social-content/drafts/INDEX.md` - What's already in the pipeline

## Research Process

### 1. Audit Current State

**Check what's in queue:**
- `social-content/drafts/` - Pending drafts
- `workers/social/{platform}/queue.json` - Queued tasks

**Check recent activity:**
- What have you posted recently? (if tracking exists)
- Any gaps in content themes?

### 2. Research External Context

**Scan relevant sources:**
- News in your domain (what's trending?)
- Competitor/peer activity (what are others posting?)
- Industry events (anything timely to react to?)

Use WebSearch for:
- "{your industry} news today"
- Trending topics in your space
- Topics from your profile.md

### 3. Align with Strategic Goals

Cross-reference your positioning from profile.md:

| Goal | Content Angle |
|------|---------------|
| **Thought leadership** | Posts about your expertise, unique insights |
| **Network building** | Engagement-focused, conversation starters |
| **Brand building** | Consistent voice, values-aligned content |
| **Product/service awareness** | Subtle mentions, case studies |

### 4. Generate Suggestions

Provide 3-5 post ideas ranked by:
1. **Timeliness** - Is there a news hook?
2. **Alignment** - Does it progress strategic goals?
3. **Engagement potential** - Will it resonate with audience?
4. **Originality** - Are you uniquely positioned to say this?

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

Check if you already have relevant drafts:
- Could an existing draft be adapted?
- Is there a queued item that addresses this?

### 6. Recommend Next Action

Ask user:
- "Want me to build out any of these with `/contentidea`?"
- "Should I check what's happening now for real-time opportunities?"
- "Any of these feel off-brand or should be skipped?"

## Weekly Theme Reference (customize in social-calendar.md)

- **Monday:** Professional/industry
- **Tuesday:** Business insights
- **Wednesday:** Flex
- **Thursday:** Future-focused
- **Friday:** Lighter content
- **Weekend:** Opportunistic

## Evergreen Themes That Often Work

- Behind-the-scenes observations
- Contrarian takes (when authentic)
- Industry predictions
- Lessons learned
- Useful frameworks
- Hot takes on trending topics

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
