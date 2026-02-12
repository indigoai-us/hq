---
description: Search across HQ and indexed repos (qmd-powered semantic + full-text)
allowed-tools: Bash, Read
argument-hint: <query> [--mode search|vsearch|query] [-n count] [-c collection] [--full]
visibility: public
---

# /search - Search (qmd)

Semantic + full-text search across HQ and indexed codebases using qmd.

**Query:** $ARGUMENTS

## Parse Arguments

Extract from $ARGUMENTS:
- `query` — search text (everything except flags)
- `--mode` — `search` (BM25), `vsearch` (semantic), `query` (hybrid). Default: `search`
- `-n` — result count (default: 10)
- `-c` — collection name (e.g. `hq`, `{repo}`). Default: all collections
- `--full` — show full content of top result

## Company Auto-Detection

If `-c` was NOT explicitly provided, infer the active company from context:

1. **cwd**: If inside `companies/{name}/` or `repos/private/` matching a company repo per `companies/manifest.yaml` → use that company's collection
2. **Active worker**: If `/run {worker}` is active and worker has `company:` field → use that company's collection
3. **Recent files**: If recent file access is scoped to a single company → use that company's collection
4. **Fallback**: No collection flag (search all)

Available company collections: `acme`, `widgets`, `designco`, `personal`
Also: `hq` (all HQ), `{repo}` ({repo} codebase)

When auto-detected, display: `(auto: {company})` in results header.

## Execute Search

Run the matching qmd command. If `-c` specified or auto-detected, add `-c $COLLECTION` to scope search:

**Default (BM25 full-text):**
```bash
qmd search "$QUERY" -n 10 --json [-c $COLLECTION]
```

**Semantic (conceptual match):**
```bash
qmd vsearch "$QUERY" -n 10 --json [-c $COLLECTION]
```

**Hybrid (BM25 + vector + re-rank):**
```bash
qmd query "$QUERY" -n 10 --json [-c $COLLECTION]
```

## Display Results

Parse JSON output. Display:

```
Search: "{query}" (mode: {mode}, collection: {collection or "all"})

Results:
  1. [0.92] hq: knowledge/public/Ralph/02-core-concepts.md
     "Ralph methodology emphasizes small loops with human checkpoints..."

  2. [0.84] {repo}: libs/core/src/auth/middleware.ts
     "export function authMiddleware..."

  3. [0.71] hq: workers/public/dev-team/architect/skills/design-review.md
     "Architecture review following Ralph back-pressure patterns..."

{n} results. Use --full to show top result content.
```

- Score in brackets
- Collection prefix + relative path (strip `qmd://{collection}/` prefix)
- Snippet truncated to ~100 chars

## Full Content

If `--full` flag, after listing results, read top result file with Read tool.

## Fallback

If qmd errors or isn't installed:

```bash
grep -rl "$QUERY" ~/Documents/HQ/knowledge/ \
  ~/Documents/HQ/companies/ \
  ~/Documents/HQ/workers/ \
  ~/Documents/HQ/.claude/commands/ \
  ~/Documents/HQ/workspace/ 2>/dev/null | head -20
```

Display: "qmd unavailable, falling back to grep"

## Examples

```bash
/search ralph                                    # BM25 keyword search (default, all collections)
/search "how do workers execute" --mode vsearch  # Semantic across all
/search auth middleware -c {repo}                    # Search {repo} codebase only
/search "webhook handler" -c {repo} --mode vsearch  # Semantic search in {repo}
/search widgets brand --mode query                # Hybrid with re-ranking
/search stripe -n 20                             # More results
/search authentication --full                    # Show top match content
/search "brand guidelines" -c widgets             # Search Widgets Inc knowledge only
/search "recovery metrics" -c acme        # Search Acme Corp knowledge only
# If cwd is companies/widgets/:
/search "case study"                             # Auto-detects → -c widgets
```

## Notes

- Default `search` mode is fastest — use for exact keywords
- Use `--mode vsearch` for conceptual/semantic queries
- Use `--mode query` for highest quality (slower, uses LLM re-ranking)
- Use `-c` to scope to a collection: `hq`, `{repo}`, `acme`, `widgets`, `designco`, `personal`
- Without `-c`, auto-detects company from context; falls back to all collections
- Scores 0.0-1.0; above 0.5 is a good match
- Run `/search-reindex` after adding new content
- For exact pattern matching in code (imports, function names), use Grep tool
