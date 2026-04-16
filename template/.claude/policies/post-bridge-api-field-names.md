---
id: hq-post-bridge-api-field-names
title: Post-Bridge API Field Names for Create Post
scope: global
trigger: When making direct REST API calls to Post-Bridge POST /v1/posts
enforcement: hard
version: 1
created: 2026-02-26
updated: 2026-02-26
source: task-completion
---

## Rule

When calling `POST https://api.post-bridge.com/v1/posts` directly (not via SDK), use these exact field names:
- `caption` — the post text (NOT `content`)
- `social_accounts` — array of numeric account IDs, e.g. `[34528]` (NOT `account_id`)
- `scheduled_at` — ISO8601 datetime string

Also: always check for existing scheduled posts before submitting (`GET /v1/posts?status=scheduled`) — duplicate posts from previous sessions may already exist at the same time slots.

