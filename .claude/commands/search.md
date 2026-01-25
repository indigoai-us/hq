---
description: Search across HQ
allowed-tools: Bash, Grep, Read
argument-hint: <query>
---

# /search - Full-Text Search

Search across threads, checkpoints, PRDs, reports, and workers.

**Query:** $ARGUMENTS

## Searchable Locations

| Location | Content |
|----------|---------|
| `workspace/threads/` | Thread history (rich context) |
| `workspace/checkpoints/` | Legacy checkpoints |
| `projects/*/prd.json` | Project PRDs |
| `workspace/reports/` | Generated reports |
| `workers/*/worker.yaml` | Worker definitions |
| `knowledge/` | Knowledge bases |

## Process

1. **Parse query**
   - Extract search terms from $ARGUMENTS
   - Support quoted phrases: `"exact match"`

2. **Search each location**
   ```bash
   # Threads (most recent first)
   grep -rl "$QUERY" workspace/threads/ 2>/dev/null | head -20

   # Checkpoints
   grep -rl "$QUERY" workspace/checkpoints/ 2>/dev/null | head -10

   # PRDs
   grep -rl "$QUERY" projects/*/prd.json 2>/dev/null | head -10

   # Reports
   grep -rl "$QUERY" workspace/reports/ 2>/dev/null | head -10

   # Workers
   grep -rl "$QUERY" workers/ 2>/dev/null | head -10

   # Knowledge
   grep -rl "$QUERY" knowledge/ 2>/dev/null | head -10
   ```

3. **Rank results**
   - Threads: by recency (newest first)
   - Others: by match count

4. **Display results**
   ```
   Search: "{query}"

   Threads (3 matches):
     T-20260123-143052-mrr-report    2 hours ago   "MRR Report Jan 2026"
     T-20260122-091500-email-fix     1 day ago     "Fixed email worker"
     T-20260120-160000-dashboard     3 days ago    "Dashboard updates"

   Workers (1 match):
     workers/cfo-liverecover/        "CFO Worker - LiveRecover"

   PRDs (1 match):
     projects/customer-cube/prd.json "Customer Cube Analytics"

   Use: /search "{more specific query}" to narrow results
   ```

5. **Show context for top result**
   - If only 1 match, show snippet
   - If thread match, show summary + files_touched

## Examples

```bash
/search mrr                    # Find anything mentioning MRR
/search "customer cube"        # Exact phrase
/search liverecover finance    # Multiple terms (AND)
/search T-2026                 # Find threads by ID prefix
```

## Notes

- Search is case-insensitive
- Results limited to top 10 per category
- For code search in repos, use Grep tool directly
