---
description: Generate or update knowledge markdown files from chat context
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, AskUserQuestion
argument-hint: [company] <topic description>
visibility: public
---

# /knowledge-capture - Extract Knowledge from Conversation

Synthesize knowledge from the current chat conversation into a structured markdown document in the appropriate knowledge base. Unlike `/learn` (short rules injected into files), this creates or updates rich knowledge documents with full ontology frontmatter.

**Pipeline context:** Conversation → **`/knowledge-capture`** → knowledge .md file → searchable via `qmd`

**Input:** $ARGUMENTS

## Step 0: Parse Input & Company Anchor

Check if the **first word** of `$ARGUMENTS` matches a company slug in `companies/manifest.yaml`.

**How to check:** Read `companies/manifest.yaml`. Extract top-level keys (company slugs). If the first word of `$ARGUMENTS` exactly matches one:

1. **Set `{co}`** = matched slug. Strip from `$ARGUMENTS` — remaining text is the topic description
2. **Announce:** "Anchored on **{co}**"
3. **Load policies** — Read all files in `companies/{co}/policies/` (skip `example-policy.md`)
4. **Scope qmd searches** — If company has `qmd_collections` in manifest, use `-c {collection}`

**If no match** → full `$ARGUMENTS` is the topic description. Company resolved later from conversation context or cwd.

**If `$ARGUMENTS` is empty:** Infer the topic from conversation context. Scan the last several exchanges for the primary subject matter. If unclear, ask the user in Step 2.

## Step 1: Search Existing Knowledge

Search for existing knowledge on this topic before creating anything:

```bash
qmd vsearch "{topic keywords}" --json -n 10
```

If company-anchored with `qmd_collections`:
```bash
qmd vsearch "{topic keywords}" -c {collection} --json -n 10
```

**Evaluate results:**

| Similarity | Action |
|-----------|--------|
| > 0.8 | Propose **updating** the existing file. Show path and current title |
| 0.5–0.8 | Show related docs. Include in AskUserQuestion: create new vs update existing |
| < 0.5 | Create new file |

## Step 2: Determine Target & Gather Missing Info

Resolve the target knowledge base. Use **one** `AskUserQuestion` call max to batch all missing info.

**Questions to include (only if not already clear from context):**

1. **Target location** — if multiple valid options exist:
   - Company knowledge: `companies/{co}/knowledge/`
   - Existing shared base: `knowledge/public/{name}/`
   - New shared base (rare — only if topic doesn't fit existing bases)

2. **Create vs update** — if moderate-similarity matches were found in Step 1

3. **Company** — only if not anchored in Step 0 and not inferrable from cwd or conversation

4. **Topic clarification** — only if `$ARGUMENTS` was empty AND conversation topic is ambiguous

**If all info is clear** from args, conversation context, and qmd results: skip the question entirely.

**Target resolution priority:**
1. If topic is company-specific → `companies/{co}/knowledge/{slug}.md`
2. If topic fits an existing shared base → `knowledge/public/{base}/{slug}.md`
3. If topic is general engineering/ops → `knowledge/public/hq-core/{slug}.md`
4. If none fit → ask user

## Step 3: Extract & Structure Content

Synthesize knowledge from the conversation into a structured markdown document.

### For NEW files:

**Derive slug** from topic (lowercase, hyphens, no special chars).

**Classify using knowledge-tagger guidelines:**

- **type** (single):
  - Has "how to", steps, instructions → `guide`
  - Has pricing, features, what-it-does → `overview`
  - Has competitive analysis, positioning, roadmap → `strategy`
  - Has API, schema, config, constants → `reference`
  - Has voice, tone, visual, brand → `brand`
  - Has metrics, benchmarks, case study, ROI → `analysis`

- **domain** (1-3 from: product, engineering, data, brand, market, growth, operations)

- **status**: Always `draft` for new files

- **tags**: 3-7 lowercase, kebab-case keywords. Prefer specific over generic (e.g., `supabase-auth` over `database`)

- **relates_to**: Top 3 related docs from Step 1 qmd results (relative paths)

**Structure the content:**

```markdown
---
type: {classified type}
domain: [{domains}]
status: draft
tags: [{tags}]
relates_to:
  - {relative/path/to/related-1.md}
  - {relative/path/to/related-2.md}
---

# {Title}

{1-2 sentence summary of the knowledge}

## {Sections — adapt to content type}

{For guides: ## Prerequisites, ## Steps, ## Gotchas}
{For reference: ## Schema, ## API, ## Configuration}
{For analysis: ## Findings, ## Data, ## Implications}
{For overview: ## What It Is, ## How It Works, ## Key Concepts}
{For strategy: ## Context, ## Approach, ## Tradeoffs}

{Structured content extracted and synthesized from conversation.
Do NOT copy-paste raw conversation — synthesize into clean, reusable knowledge.
Include code examples, commands, and configurations where relevant.
Use mermaid blocks for diagrams, never ASCII art.}
```

### For UPDATING existing files:

1. Read the existing file completely
2. Identify which sections the new knowledge belongs in
3. Merge new content into relevant sections — append, don't overwrite
4. If new knowledge doesn't fit existing sections, add a new section
5. Update `tags` in frontmatter if new topics are covered
6. Preserve existing `status` — do NOT change it
7. Add/update `relates_to` if new related docs were found

## Step 4: Write File

**New file:** Use Write tool to create the file at the resolved path.

**Update existing:** Use Edit tool to merge content. Prefer targeted edits over full file rewrites.

## Step 5: Commit to Knowledge Repo

Knowledge files live in separate git repos (symlinked or embedded). Commit to the knowledge repo, NOT to HQ git.

```bash
# Resolve the real repo path through symlinks
target_file="{path to knowledge file}"
repo_dir=$(cd "$(dirname "$(readlink -f "$target_file")")" && git rev-parse --show-toplevel 2>/dev/null)

if [ -n "$repo_dir" ]; then
  cd "$repo_dir"
  git add -A
  git commit -m "knowledge: {short topic summary}"
fi
```

If the file is in a company knowledge dir with embedded git:
```bash
cd companies/{co}/knowledge/
git add -A
git commit -m "knowledge: {short topic summary}"
```

If git operations fail (no repo, nothing to commit), continue — the file is still written.

## Step 6: Log Event

```bash
mkdir -p workspace/learnings
```

Write `workspace/learnings/knowledge-capture-{YYYYMMDD-HHMMSS}.json`:

```json
{
  "event_id": "knowledge-capture-{timestamp}",
  "action": "created|updated",
  "target_file": "{relative path to knowledge file}",
  "topic": "{topic description}",
  "type": "{ontology type}",
  "domain": ["{domains}"],
  "tags": ["{tags}"],
  "related_docs": ["{paths from relates_to}"],
  "company": "{co or null}",
  "source": "conversation",
  "created_at": "{ISO8601}"
}
```

## Step 7: Reindex

```bash
qmd update 2>/dev/null || true
```

## Step 8: Report

```
Knowledge captured:
  Topic: {title}
  Action: {created|updated}
  File: {relative path}
  Type: {ontology type}
  Tags: {comma-separated tags}
  Related: {related doc paths or "none"}
  Event: workspace/learnings/knowledge-capture-{timestamp}.json

Search with: qmd vsearch "{topic keywords}"
```

## Rules

- **Synthesize, don't copy-paste** — extract clean, reusable knowledge from conversation. Raw chat exchanges are not knowledge documents
- **1 AskUserQuestion max** — batch all missing info (location, create vs update, company) into one call. If everything is clear, zero questions
- **Dedup mandatory** — always `qmd vsearch` before creating. Never create a doc that substantially overlaps an existing one
- **Draft by default** — new docs start as `draft`. User promotes to `canonical` when reviewed
- **Ontology compliance** — all frontmatter must match `knowledge-ontology.yaml` (type, domain, status, tags, relates_to)
- **Knowledge repo commits** — never commit knowledge content to HQ git. Always commit to the knowledge repo (symlinked or embedded)
- **Preserve existing content** — when updating, merge into existing structure. Never overwrite or remove existing knowledge
- **Reindex always** — `qmd update` after every write
- **No TodoWrite or EnterPlanMode** — this command executes directly
- **Company isolation** — when anchored, scope all qmd searches to company collection. Never mix company knowledge
- **Mermaid for diagrams** — use ` ```mermaid ` blocks, never ASCII art
- **Scan before asking** — research (Step 1) happens before any user questions. Never ask for info findable in qmd
- **One topic per file** — each knowledge file covers one coherent topic. If conversation covered multiple unrelated topics, run the command once per topic

## Examples

### Creating new knowledge from a debugging session

User discussed Supabase RLS policies and learned patterns for row-level security.

```
/knowledge-capture supabase-rls-patterns
```

Creates: `knowledge/public/hq-core/supabase-rls-patterns.md`
Type: `guide`
Domain: `[engineering]`
Tags: `[supabase, rls, row-level-security, postgres, auth]`

### Updating existing company knowledge

User discussed new API integration patterns for a company's product.

```
/knowledge-capture acme api-integration-patterns
```

Finds existing: `companies/acme/knowledge/api-patterns.md`
Action: Update — merges new patterns into existing sections.

### Capturing architecture decisions

After a conversation about choosing between WebSockets and SSE:

```
/knowledge-capture real-time-architecture-decisions
```

Creates: `knowledge/public/hq-core/real-time-architecture-decisions.md`
Type: `reference`
Domain: `[engineering, product]`
Tags: `[websockets, sse, real-time, architecture, decision-record]`
