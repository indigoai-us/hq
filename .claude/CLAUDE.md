# GHQ v0.2

Knowledge-first personal OS. No pre-loaded content — intelligence accumulates through use.

## Rules

- **Knowledge before action**: Run `qmd query "<topic>"` before starting any task. Use retrieved context to inform decisions.
- **Capture learnings**: After sessions, distill insights with `/learn`. New knowledge goes to `knowledge/{category}/{slug}.md`.
- **Knowledge format**: Markdown with YAML frontmatter (title, tags, created, source) in `knowledge/{category}/{slug}.md`.
- **Curiosity queue**: Log questions to `knowledge/.queue.jsonl` for later research. Completed items move to `.queue-done.jsonl`.
- **Research log**: Append research session summaries to `knowledge/.research-log.jsonl`.
- **No pre-loaded content**: No companies, skills, or scaffolded directories. Everything is earned through learning.
- **Context diet**: Read only what the current task requires. Never pre-load.
- **Capture before losing context**: Before ending a session or when context is filling, run `/learn` to capture learnings.

## Search (qmd)

```
qmd search "<query>" -n 10        # BM25 keyword (fast, default)
qmd vsearch "<query>" -n 10       # semantic/conceptual
qmd query "<query>" -n 10         # hybrid BM25 + vector (best, slower)
```

## Subprocess, Not Subagents

Never use the `Agent` tool for delegating work. Instead, use `companies/ghq/tools/ask-claude.sh` to spawn a Claude subprocess via `claude -p`. This gives full control over model, tools, and turn limits while keeping the main session's context clean.

```bash
./companies/ghq/tools/ask-claude.sh "Summarize this file"              # simple prompt
cat file.txt | ./companies/ghq/tools/ask-claude.sh "Explain this"       # stdin + prompt
./companies/ghq/tools/ask-claude.sh -j "List exports"                    # JSON output
```

## Structure

```
.claude/              hooks/, commands/, CLAUDE.md
knowledge/            {category}/{slug}.md — searchable knowledge base
companies/ghq/tools/  utility scripts
patches/              persistent patches for global npm packages
```
