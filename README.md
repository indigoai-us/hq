# GHQ v0.2 — Knowledge-First OS

A personal operating system for orchestrating work across companies and AI,
rebuilt around a knowledge-first architecture.

## Philosophy

GHQ v0.2 replaces the pre-loaded skills/companies scaffolding of v1 with a
learn-apply loop:

1. **Learn** — Every session captures insights, patterns, and corrections into
   a searchable knowledge base (`knowledge/`).
2. **Query** — Before acting, consult existing knowledge via `qmd` search.
3. **Apply** — Use retrieved context to inform decisions and actions.
4. **Reflect** — After sessions, distill new learnings back into knowledge.

No content is pre-loaded. The system starts empty and accumulates intelligence
through use.

## Structure

```
.claude/          hooks/, commands/, CLAUDE.md (system rules)
knowledge/        markdown files with YAML frontmatter, indexed by qmd
scripts/          utility scripts
patches/          persistent patches for global npm packages
```

## Knowledge Format

Each knowledge entry lives at `knowledge/{category}/{slug}.md` with YAML
frontmatter (title, tags, created, source). The curiosity queue
(`knowledge/.queue.jsonl`) tracks questions to research later.

## Search

```
qmd search "<query>" -n 10        # BM25 keyword search
qmd vsearch "<query>" -n 10       # semantic/vector search
qmd query "<query>" -n 10         # hybrid (best quality, slower)
```
