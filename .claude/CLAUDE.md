# GHQ v0.2

Knowledge-first personal OS. No pre-loaded content — intelligence accumulates through use.

## Company Context

Knowledge is scoped per company under `companies/{slug}/knowledge/`. At the start of a conversation, determine which company the user is working with:

1. If the user's request mentions a specific company or project, use that company's slug.
2. If working within a `companies/{slug}/` directory, use that slug.
3. If unclear, ask the user which company they're working with before proceeding.
4. Cross-cutting concerns (GHQ tooling, agent patterns, meta-knowledge) go under `ghq`.

All knowledge commands accept `-c <company-slug>` (default: `ghq`).

## Rules

- **Knowledge before action**: Run `qmd query "<topic>"` before starting any task. Use retrieved context to inform decisions.
- **Capture learnings**: After sessions, distill insights with `/learn [-c <company>]`. New knowledge goes to `companies/{company}/knowledge/{category}/{slug}.md`.
- **Knowledge format**: Markdown with YAML frontmatter (title, tags, created, source) in `companies/{company}/knowledge/{category}/{slug}.md`.
- **Curiosity queue**: Log questions to `companies/{company}/knowledge/.queue.jsonl` for later research. Completed items move to `.queue-done.jsonl`.
- **Research log**: Append research session summaries to `companies/{company}/knowledge/.research-log.jsonl`.
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
.claude/                          hooks/, commands/, CLAUDE.md
companies/
  manifest.yaml                   company registry
  {slug}/                         per-company workspace (symlink for external companies)
    knowledge/                    {category}/{slug}.md — searchable knowledge base
      .queue.jsonl                curiosity queue (pending research items)
      .queue-done.jsonl           completed/duplicate items
      .research-log.jsonl         research session summaries
    data/                         company-specific data files
    tools/                        company-specific scripts
    projects/                     project directories
      {project}/repos/{repo}/     project repos (symlinks)
  ghq/                            GHQ itself — cross-cutting knowledge + shared tools
    tools/                        shared utility scripts (reindex, queue, ask-claude, etc.)
    knowledge/                    meta-knowledge (agent patterns, GHQ architecture, etc.)
```
