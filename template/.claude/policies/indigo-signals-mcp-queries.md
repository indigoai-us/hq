---
id: {company}-signals-mcp-queries
title: Indigo Signals MCP Query Gotchas
scope: cross-cutting
trigger: querying {company}-signals MCP collections (meetings, meetingdata)
enforcement: soft
---

## Rule

When querying the Indigo Signals MCP (`{company}-signals-{company}`, `{company}-signals-{product}`, `{company}-signals-{company}`):

1. **`$oid` syntax not supported** — `query_collection` filter does NOT support `{"_id": {"$oid": "..."}}`. Use `aggregate_collection` with `$match` instead for ID-based lookups.

2. **`meeting_ids` in meetingdata are ObjectIds** — string-based `$in` queries won't match. Cross-reference by reading meetingdata sorted by date and matching `meeting_ids` arrays manually.

3. **Transcripts are structured JSON arrays** — The `meetings.transcript` field is NOT a flat string. It's an array of speaker segments: `{speaker, words: [{text, start_timestamp, end_timestamp}], speaker_id, extra_data}`. The "length" of transcript = number of segments, not character count.

4. **LLM response data has control characters** — `meetingdata.llm_response` fields (especially `diarized_transcript`, `full_response`) contain raw control characters that break `jq -c` streaming. Use Python's `json` module instead of piping through `jq -c`.

5. **Large results overflow to temp files** — Queries returning >100KB auto-save to `.claude/projects/.../tool-results/`. Process with `jq` or Python from the saved file path.

6. **Projection still returns large payloads** — Even with projection, transcript fields are huge. Query metadata first (without transcript), then fetch transcripts individually or via aggregate.

## Rationale

Discovered during {product} bootcamp transcript extraction (Mar 2026). Multiple failed queries before finding working patterns. These gotchas cost ~10 minutes of debugging per issue.
