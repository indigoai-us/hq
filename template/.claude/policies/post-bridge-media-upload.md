---
id: post-bridge-media-upload
title: Post-Bridge media must use 2-step upload then PATCH
scope: command
trigger: social-publisher, post, schedule-batch
enforcement: hard
created: 2026-03-31
---

## Rule

When scheduling posts in Post-Bridge with images:
1. Create posts first (text + schedule), then upload media separately via `POST /v1/media/create-upload-url` + `PUT` binary
2. Attach media via `PATCH /v1/posts/{id}` with `{"media":["<media_id>"]}`
3. De-duplicate uploads — many posts share the same graphic. Map graphicRef → media_id and reuse.
4. PATCH is the only way to update a scheduled post (no PUT endpoint). It works for caption, media, and scheduled_at.

## Rationale

Discovered during {product} batch scheduling. POST /v1/posts accepts media IDs but you can't upload and create in one call. PATCH support was undocumented but works.
