---
description: Search GHQ knowledge, skills, and projects using qmd (semantic + full-text)
allowed-tools: Bash, Read
argument-hint: <query> [--mode search|vsearch|query] [-n count] [-c collection] [--full] [--no-beads] [--beads-only]
visibility: public
---

# /search - Search (qmd + beads)

Semantic + full-text search across GHQ knowledge and beads issues.

**Query:** $ARGUMENTS

## Parse Arguments

Extract from $ARGUMENTS:
- `query` — search text (everything except flags)
- `--mode` — `search` (BM25 keyword), `vsearch` (semantic), `query` (hybrid). Default: `search`
- `-n` — result count (default: 10)
- `-c` — collection name (e.g. `ghq`, `personal`). Default: all collections
- `--full` — after listing results, read top result with Read tool
- `--no-beads` — skip beads search, only search qmd
- `--beads-only` — skip qmd search, only search beads

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

## Execute Beads Search

Unless `--no-beads` is set, also search beads for matching issues:

```bash
bd search "$QUERY" --json -n 5
```

Beads search runs **in parallel** with the qmd search (both in the same response). If `--beads-only` is set, skip the qmd search entirely.

## Display Results

### Knowledge Results (qmd)

Skip this section if `--beads-only` is set. Parse JSON output. Display:

```
Search: "{query}" (mode: {mode}, collection: {collection or "all"})

Knowledge:
  1. [0.92] ghq: knowledge/ralph/02-core-concepts.md
     "Ralph methodology emphasizes small loops with human checkpoints..."

  2. [0.84] ghq: .claude/skills/architect/SKILL.md
     "System design, API design, and architecture decisions..."

  3. [0.71] ghq: knowledge/ghq-core/task-schema.md
     "Tasks in GHQ are managed through beads..."

{n} knowledge results.
```

Format:
- Score in brackets (0.0–1.0; above 0.5 is a good match)
- Collection prefix + relative path (strip `qmd://{collection}/` prefix)
- Snippet truncated to ~100 chars

### Beads Results

Skip this section if `--no-beads` is set. Parse JSON output from `bd search`. Display:

```
Beads:
  1. [ghq-abc] (task, open, P2) Implement webhook handler
     "Handle incoming webhooks from Stripe for payment events..."

  2. [ghq-def] (epic, open, P1) Authentication system
     "End-to-end auth with OAuth2 and JWT refresh tokens..."

{n} beads results.
```

Format:
- Issue ID in brackets
- Type, status, and priority in parentheses
- Title on same line
- Description snippet truncated to ~80 chars (from `description` field)

If either search returns zero results, display `No {knowledge|beads} results.` for that section.

### Footer

```
Use --full to show top knowledge result content.
Use --no-beads or --beads-only to narrow scope.
```

## Full Content

If `--full` flag provided: after displaying the results list, read the top knowledge result file with the Read tool and display its full content. For beads, run `bd show <id>` on the top beads result and display it.

## Fallback

If qmd is unavailable or errors:

```bash
grep -rl "$QUERY" knowledge/ companies/ .claude/commands/ .claude/skills/ projects/ workspace/ 2>/dev/null | head -20
```

Display: `qmd unavailable — falling back to grep`

If bd is unavailable or errors, silently skip beads results (do not fail the whole search).

## Examples

```
/search ralph                                     # BM25 keyword + beads (default)
/search "how do skills execute" --mode vsearch    # Semantic across all collections + beads
/search auth -c personal                          # Search personal knowledge + beads
/search "webhook handler" --mode vsearch -c ghq   # Semantic in GHQ + beads
/search "skill chain" --mode query                # Hybrid with re-ranking + beads
/search stripe -n 20                              # More results from both sources
/search authentication --full                     # Show top match content from both
/search "brand guidelines" -c personal            # Scope knowledge to personal + beads
/search "deploy pipeline" --no-beads              # Knowledge only, skip beads
/search "authentication bug" --beads-only         # Beads issues only, skip knowledge
```

## Notes

- Default `search` mode is fastest — use for exact keywords
- Use `--mode vsearch` for conceptual or natural-language queries
- Use `--mode query` for highest quality (slower — uses LLM re-ranking)
- Use `-c` to scope to a collection; without it, searches all indexed collections
- Scores above 0.5 are generally relevant matches
- Beads search always searches all issues (no collection scoping) — use `--no-beads` to exclude
- Run `/cleanup --reindex` after adding new content to rebuild CLAUDE.md index files and reindex qmd
- For exact pattern matching in code (imports, function names), use the Grep tool directly

## Rules

- **Never mix company collections**: If `-c personal` is specified, only show personal results — never blend in other company collections
- **Auto-detect is best-effort**: When auto-detection is ambiguous (files from multiple companies accessed recently), fall back to searching all collections
- **Respect .claudeignore**: Never search inside `companies/*/settings/` paths — they are shielded
- **Beads failures are non-fatal**: If `bd search` fails, show knowledge results and note beads were skipped
