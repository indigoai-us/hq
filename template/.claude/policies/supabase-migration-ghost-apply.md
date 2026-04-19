---
id: supabase-migration-ghost-apply
title: Supabase migrations can be tracked as applied without SQL executing
scope: cross-cutting
trigger: supabase migration debugging
enforcement: soft
---

## Rule

When debugging "table not found" errors on a Supabase-backed app, ALWAYS verify the table actually exists via REST API (`curl .../rest/v1/{table}?select=id&limit=1`) even if `supabase migration list` shows the migration as applied. Migrations with non-standard naming (e.g. `001_...` instead of timestamp prefix) can be recorded in the tracking table without the SQL executing.

**Fix:** `supabase migration repair --status reverted {version}` then `supabase db push --include-all`.

