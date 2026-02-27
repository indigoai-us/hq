---
description: Search GHQ knowledge, skills, and projects using qmd (semantic + full-text)
allowed-tools: Bash, Read
argument-hint: <query> [--mode search|vsearch|query] [-n count] [-c collection] [--full]
visibility: public
---

# /search - Search (qmd)

Semantic + full-text search across GHQ and indexed repos using qmd.

**Query:** $ARGUMENTS

## Parse Arguments

Extract from $ARGUMENTS:
- `query` — search text (everything except flags)
- `--mode` — `search` (BM25 keyword), `vsearch` (semantic), `query` (hybrid). Default: `search`
- `-n` — result count (default: 10)
- `-c` — collection name (e.g. `ghq`, `personal`). Default: all collections
- `--full` — after listing results, read top result with Read tool

## Company Auto-Detection

If `-c` was NOT explicitly provided, infer the active company collection from context:

1. **cwd**: If inside `companies/{name}/` or a repo associated with a company per `companies/manifest.yaml` → use that company's collection
2. **Recent files**: If recent file access is scoped to a single company → use that company's collection
3. **Fallback**: No `-c` flag (search all collections)

Available collections:
- `ghq` — all GHQ content (knowledge, skills, commands, projects)
- `personal` — personal company knowledge
- Add `-c <slug>` for any company registered in `companies/manifest.yaml`

When auto-detected, prepend `(auto: {company})` to the results header.

## Execute Search

Run the matching qmd command. Add `-c $COLLECTION` when specified or auto-detected:

**Default (BM25 full-text, fast):**
```bash
qmd search "$QUERY" -n 10 --json [-c $COLLECTION]
```

**Semantic (conceptual match):**
```bash
qmd vsearch "$QUERY" -n 10 --json [-c $COLLECTION]
```

**Hybrid (BM25 + vector + re-rank, best quality):**
```bash
qmd query "$QUERY" -n 10 --json [-c $COLLECTION]
```

## Display Results

Parse JSON output. Display:

```
Search: "{query}" (mode: {mode}, collection: {collection or "all"})

Results:
  1. [0.92] ghq: knowledge/ralph/02-core-concepts.md
     "Ralph methodology emphasizes small loops with human checkpoints..."

  2. [0.84] ghq: .claude/skills/architect/skill.yaml
     "System design, API design, and architecture decisions..."

  3. [0.71] ghq: projects/ghq/prd.json
     "GHQ Personal OS for orchestrating work across companies and AI..."

{n} results. Use --full to show top result content.
```

Format:
- Score in brackets (0.0–1.0; above 0.5 is a good match)
- Collection prefix + relative path (strip `qmd://{collection}/` prefix)
- Snippet truncated to ~100 chars

## Full Content

If `--full` flag provided: after displaying the results list, read the top result file with the Read tool and display its full content.

## Fallback

If qmd is unavailable or errors:

```bash
grep -rl "$QUERY" knowledge/ companies/ .claude/commands/ .claude/skills/ projects/ workspace/ 2>/dev/null | head -20
```

Display: `qmd unavailable — falling back to grep`

## Examples

```
/search ralph                                     # BM25 keyword search (default, all)
/search "how do skills execute" --mode vsearch    # Semantic across all collections
/search auth -c personal                          # Search personal company knowledge
/search "webhook handler" --mode vsearch -c ghq   # Semantic in GHQ only
/search "skill chain" --mode query                # Hybrid with re-ranking
/search stripe -n 20                              # More results
/search authentication --full                     # Show top match content
/search "brand guidelines" -c personal            # Scope to personal knowledge
```

## Notes

- Default `search` mode is fastest — use for exact keywords
- Use `--mode vsearch` for conceptual or natural-language queries
- Use `--mode query` for highest quality (slower — uses LLM re-ranking)
- Use `-c` to scope to a collection; without it, searches all indexed collections
- Scores above 0.5 are generally relevant matches
- Run `/cleanup --reindex` after adding new content to rebuild INDEX.md files and reindex qmd
- For exact pattern matching in code (imports, function names), use the Grep tool directly

## Rules

- **Never mix company collections**: If `-c personal` is specified, only show personal results — never blend in other company collections
- **Auto-detect is best-effort**: When auto-detection is ambiguous (files from multiple companies accessed recently), fall back to searching all collections
- **Respect .claudeignore**: Never search inside `companies/*/settings/` paths — they are shielded
