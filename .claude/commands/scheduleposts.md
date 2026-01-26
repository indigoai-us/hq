---
description: Choose what to post right now based on content inventory and current context
allowed-tools: Task, Read, Write, Edit, Bash, Glob, Grep, WebSearch, WebFetch, AskUserQuestion, TodoWrite, mcp__Claude_in_Chrome__tabs_context_mcp, mcp__Claude_in_Chrome__navigate, mcp__Claude_in_Chrome__computer, mcp__Claude_in_Chrome__get_page_text
---

# /scheduleposts - Smart Post Scheduling

Analyze available content, generate images, and post.

## Queue File
`workspace/social-drafts/queue.json`

## Process

### 1. Load Queue
Read `workspace/social-drafts/queue.json` and show summary:

```
QUEUE STATUS
============
Ready to post (has image): X
Need images: X
In draft: X
Scheduled: X
Posted: X

READY TO POST NOW:
1. [post-XXX] X oneliner: "The best AGI..."
2. [post-XXX] X short: "Everyone's waiting..."

NEED IMAGES:
1. [post-XXX] X article: "Your AGI Will Beat..." → suggest: woodcut
...
```

### 2. Ask User
Present options:
1. **Post now** - which post?
2. **Generate images** - batch generate for posts needing images
3. **Schedule posts** - set times for future posting
4. **View full queue**
5. **Update status** - mark posts as draft/ready/approved

### 3. If Generating Images

For each post, extract visual metaphor and generate:

```bash
cd ~/Documents/HQ/repos/private/gemini-nano-banana && \
node dist/index.js social "<visual metaphor>" \
--style <selected-style> \
--variants 3 \
--output ~/Documents/HQ/workspace/social-drafts/images/<post-id> \
--metadata
```

Then sync to preview site:
```bash
cp -r ~/Documents/HQ/workspace/social-drafts/images/<post-id> \
  ~/Documents/HQ/repos/private/social-drafts/images/
cd ~/Documents/HQ/repos/private/social-drafts && \
git add images/<post-id> && git commit -m "Add images for <post-id>" && git push
```

Update queue.json with imageFile path and add to preview site index.html.

### 4. If Posting Now

1. Confirm the post content
2. Verify image (if applicable)
3. Use X API credentials from `.env`:
   - X_API_KEY, X_API_SECRET
   - X_ACCESS_TOKEN, X_ACCESS_SECRET
4. Post via API or open browser to post manually
5. Update queue.json: status → posted, postedAt, postUrl

### 5. If Scheduling

- Ask for date/time or slot (morning 9am / afternoon 2pm / evening 7pm)
- Update queue.json scheduledFor field
- Show confirmation with full schedule

## Approved Image Styles

| Style | Best For | Aesthetic |
|-------|----------|-----------|
| **woodcut** | Philosophical, timeless | B&W engraving, 1800s encyclopedia |
| **grainy** | Action, energy, nostalgia | 35mm film grain, orange/teal, lo-fi |
| **minimal** | Clean concepts, focus | White negative space, sparse |
| **blackprint** | Technical, systems | Black ink on white, patent illustration |
| **polaroid** | Personal, casual | Instant camera, warm overexposed |
| **vaporwave** | Retro-futurism, ironic | Pink/cyan, 80s computer |
| **duotone** | Bold statements | Two-color halftone, poster quality |

## Style Recommendations by Content Type

| Content Theme | Recommended Styles |
|---------------|-------------------|
| AI/Tech/Systems | blackprint, minimal, woodcut |
| Personal journey | grainy, polaroid |
| Philosophy/deep | woodcut, duotone |
| Future/vision | vaporwave, minimal |
| Action/energy | grainy, duotone |

## Post Best Practices

- **X one-liners**: Usually no image, pure text hook
- **X short posts**: Optional image, can boost engagement
- **X articles**: Image recommended (appears in preview card)
- **LinkedIn**: Image strongly recommended

## Optimal Posting Times (ET)

| Time | Slot | Best For |
|------|------|----------|
| 9:00 AM | Morning | Professional content |
| 12:00 PM | Noon | Quick hits, engagement |
| 5:00 PM | Evening | Threads, longer content |

## Day Themes

- **Monday**: AI/Tech trends
- **Tuesday**: Business insights
- **Wednesday**: Flex
- **Thursday**: Future of work
- **Friday**: Lighter content, personal

## Queue Status Values

- `draft` - Still being written/edited
- `ready` - Content approved, needs image
- `approved` - Has content + image, ready to post
- `scheduled` - Set for specific time
- `posted` - Live on platform
