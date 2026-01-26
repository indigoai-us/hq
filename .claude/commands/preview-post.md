---
description: Preview social post drafts, select images, approve for posting
allowed-tools: Task, Read, Glob, Grep, Edit, Write, Bash, AskUserQuestion, TodoWrite, mcp__Claude_in_Chrome__tabs_context_mcp, mcp__Claude_in_Chrome__tabs_create_mcp, mcp__Claude_in_Chrome__navigate, mcp__Claude_in_Chrome__read_page, mcp__Claude_in_Chrome__computer, mcp__Claude_in_Chrome__javascript_tool
argument-hint: [draft-id or "next" or "all"]
---

# /preview-post - Preview & Approve Social Posts

Preview draft content, select images, and approve posts for scheduling/publishing.

**Argument:** $ARGUMENTS

## Workflow

### 1. Load Draft(s)

**If arg is draft ID (e.g., "personal-agi-article"):**
- Find matching draft in `workspace/social-drafts/`
- Load the specific file

**If arg is "next":**
- Read `workers/x-{your-name}/queue.json`
- Find oldest `draft_ready` item
- Load that draft

**If arg is "all" or no arg:**
- Show list of all `draft_ready` items
- Let user pick which to preview

### 2. Display Preview

For each draft, show:

```
═══════════════════════════════════════════════════════════════
DRAFT PREVIEW: {title}
═══════════════════════════════════════════════════════════════

Platform: X / LinkedIn
Type: {post|article|thread}
Characters: {count} / {limit}
Created: {date}

───────────────────────────────────────────────────────────────
CONTENT:
───────────────────────────────────────────────────────────────

{actual content here}

───────────────────────────────────────────────────────────────
```

### 3. Image Selection (if images exist)

Check for images in `workspace/social-drafts/images/{date}-{slug}/`

If images exist:
1. Open Finder to show image folder
2. Display image count
3. Ask user to select winner

```bash
open /path/to/images/
```

Ask: "Which image number would you like to use? (1-10, or 'none')"

If user selects, copy to `selected.png`:
```bash
cp "{chosen-image}" "{folder}/selected.png"
```

### 4. Approval Decision

Ask user via AskUserQuestion:

**Options:**
1. **Approve & Schedule** - Mark ready for next posting window
2. **Approve & Post Now** - Post immediately (runs /post-now)
3. **Edit** - Make changes before approving
4. **Skip** - Move to next draft
5. **Reject** - Remove from queue

### 5. Update Queue

Based on decision:

**Approve & Schedule:**
```json
{
  "status": "approved",
  "approved_at": "{ISO8601}",
  "image": "{path/to/selected.png or null}"
}
```

**Approve & Post Now:**
- Set status to "posting"
- Trigger `/post-now {draft-id}`

**Edit:**
- Open draft file for editing
- Return to preview after edit

**Reject:**
- Set status to "rejected"
- Add `rejected_at` and `rejected_reason`

### 6. Report

After each draft:
```
✓ {draft-id}: Approved for scheduling
  Image: {selected.png or "none"}
  Next posting window: {9am|2pm|7pm MT}
```

## Quick Preview Mode

For rapid review, show compact format:

```
[1] personal-agi-oneliner (52 chars)
    "The best AGI will be the one you build yourself."

[2] personal-agi-short (267 chars)
    "Everyone's waiting for OpenAI to ship AGI..."

[3] personal-agi-article (2000 words)
    "Your AGI Will Beat OpenAI's" - Full article
```

Ask: "Which to preview in detail? (1-3, or 'all')"

## Browser Preview (Optional)

If user wants to see how it looks on X:
1. Open Chrome tab to X compose
2. Paste content for visual preview
3. Don't actually post

```javascript
// Using Claude-in-Chrome MCP
// Navigate to compose tweet, paste content
```

## File Locations

- Drafts: `workspace/social-drafts/x/` and `workspace/social-drafts/linkedin/`
- Images: `workspace/social-drafts/images/{date}-{slug}/`
- Queue: `workers/x-{your-name}/queue.json`
- Posted log: `workers/x-{your-name}/posted.json`
