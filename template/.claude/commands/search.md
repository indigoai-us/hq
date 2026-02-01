---
description: Search across HQ (qmd-powered semantic + full-text)
allowed-tools: Bash, Read
argument-hint: <query> [--mode search|vsearch|query] [-n count] [--full]
visibility: public
---

# /search - HQ Search (qmd)

Semantic + full-text search across all HQ content using qmd.

**Query:** $ARGUMENTS

## Parse Arguments

Extract from $ARGUMENTS:
- `query` — search text (everything except flags)
- `--mode` — `search` (BM25), `vsearch` (semantic), `query` (hybrid). Default: `search`
- `-n` — result count (default: 10)
- `--full` — show full content of top result

## Execute Search

Run the matching qmd command:

**Default (BM25 full-text):**
```bash
qmd search "$QUERY" -n 10 --json
```

**Semantic (conceptual match):**
```bash
qmd vsearch "$QUERY" -n 10 --json
```

**Hybrid (BM25 + vector + re-rank):**
```bash
qmd query "$QUERY" -n 10 --json
```

## Display Results

Parse JSON output. Display:

```
Search: "{query}" (mode: {mode})

Results:
  1. [0.92] knowledge/public/Ralph/02-core-concepts.md
     "Ralph methodology emphasizes small loops with human checkpoints..."

  2. [0.84] .claude/commands/run-project.md
     "Run a project through the Ralph loop..."

  3. [0.71] workers/public/dev-team/architect/skills/design-review.md
     "Architecture review following Ralph back-pressure patterns..."

{n} results. Use --full to show top result content.
```

- Score in brackets
- Relative path (strip `qmd://hq/` prefix)
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
/search ralph                           # BM25 keyword search (default)
/search "how do workers execute" --mode vsearch  # Semantic
/search acme brand --mode query         # Hybrid with re-ranking
/search stripe -n 20                    # More results
/search authentication --full           # Show top match content
```

## Notes

- Default `search` mode is fastest — use for exact keywords
- Use `--mode vsearch` for conceptual/semantic queries
- Use `--mode query` for highest quality (slower, uses LLM re-ranking)
- Scores 0.0-1.0; above 0.5 is a good match
- Run `/search-reindex` after adding new content
- For code search in repos, use Grep tool directly
