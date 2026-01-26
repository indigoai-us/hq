---
description: Post approved content to X or LinkedIn immediately
allowed-tools: Task, Read, Glob, Grep, Edit, Write, Bash, AskUserQuestion, TodoWrite, mcp__Claude_in_Chrome__tabs_context_mcp, mcp__Claude_in_Chrome__tabs_create_mcp, mcp__Claude_in_Chrome__navigate, mcp__Claude_in_Chrome__read_page, mcp__Claude_in_Chrome__computer, mcp__Claude_in_Chrome__form_input, mcp__Claude_in_Chrome__find, mcp__Claude_in_Chrome__upload_image
argument-hint: [draft-id] [--platform x|linkedin|both]
---

# /post-now - Post Content Immediately

Post approved content to X and/or LinkedIn using browser automation.

**Arguments:** $ARGUMENTS

## Pre-flight Checks

1. Verify draft exists and is approved (or explicitly passed)
2. Check character limits
3. Confirm image is selected (if applicable)
4. Get final user confirmation

## Posting via Browser MCP

Since X and LinkedIn require authenticated sessions, use Claude-in-Chrome for posting:

### X/Twitter Posting

```
1. Get browser context
2. Navigate to x.com (should already be logged in)
3. Find compose button or go to /compose/post
4. Enter content
5. If image: upload via file input
6. Click post button
7. Wait for confirmation
8. Capture post URL
```

**For Articles (long-form):**
```
1. Navigate to x.com/compose/article (or use "Write an article" option)
2. Enter title
3. Enter body content
4. Add image if selected
5. Publish
6. Capture URL
```

**For Threads:**
```
1. Post first tweet
2. Reply to own tweet with next part
3. Repeat for all parts
4. Capture thread URL
```

### LinkedIn Posting

```
1. Navigate to linkedin.com
2. Click "Start a post"
3. Enter content
4. Add image if selected
5. Click "Post"
6. Capture URL
```

## Post-Posting Actions

### Update Queue
```json
{
  "status": "posted",
  "posted_at": "{ISO8601}",
  "post_url": "{captured URL}",
  "platform": "x|linkedin"
}
```

### Log to Posted History
Append to `workers/x-{your-name}/posted.json`:
```json
{
  "id": "{draft-id}",
  "posted_at": "{ISO8601}",
  "platform": "x",
  "url": "{post URL}",
  "content_preview": "{first 100 chars}",
  "type": "post|article|thread",
  "image": "{path or null}"
}
```

### Update INDEX.md
Change status from "Draft" to "Posted" with date

## Error Handling

**If posting fails:**
1. Set status to "post_failed"
2. Log error reason
3. Notify user
4. Offer retry option

**Common issues:**
- Session expired → Ask user to log in
- Rate limited → Schedule for later
- Content rejected → Show rejection reason

## Confirmation Template

Before posting, show:

```
═══════════════════════════════════════════════════════════════
READY TO POST
═══════════════════════════════════════════════════════════════

Platform: X (@{your-handle})
Type: Article
Title: "Your AGI Will Beat OpenAI's"

Content preview:
"{first 200 chars...}"

Image: ✓ selected.png attached
Characters: 1,847 / 25,000

═══════════════════════════════════════════════════════════════

Post now? [Yes / No / Edit first]
```

## Browser Automation Steps (X Article)

```python
# Pseudocode for X article posting

1. tabs_context_mcp() → get active tab
2. navigate(url="https://x.com") → ensure on X
3. find(query="Write") → find compose/article button
4. computer(action="click", ref=...) → click compose
5. Wait for editor
6. form_input(ref=title_field, value=title)
7. form_input(ref=body_field, value=content)
8. If image:
   - find(query="Add media")
   - upload_image(imageId=..., ref=...)
9. find(query="Post" or "Publish")
10. computer(action="click", ref=post_button)
11. Wait for URL
12. read_page() → extract post URL
```

## Usage Examples

```bash
# Post specific draft
/post-now personal-agi-article

# Post to both platforms
/post-now personal-agi-article --platform both

# Post next approved item
/post-now next
```
