---
description: Explore approaches and tradeoffs before committing to a PRD
allowed-tools: Task, Read, Glob, Grep, Write, Bash, AskUserQuestion, WebSearch
argument-hint: [company] <idea description or board idea ID>
visibility: public
---

# /brainstorm - Structured Exploration

Think through a problem before committing to a PRD. Research HQ context, compare approaches, surface unknowns.

**Input:** $ARGUMENTS

**Pipeline:** `/idea` → **`/brainstorm`** → `/prd` → `/run-project`

## Step 0: Parse Input & Company Anchor

Check if the **first word** of `$ARGUMENTS` matches a company slug in `companies/manifest.yaml`.

**How to check:** Read `companies/manifest.yaml`. Extract top-level keys (company slugs). If the first word of `$ARGUMENTS` exactly matches one:

1. **Set `{co}`** = matched slug. Strip from `$ARGUMENTS` — remaining text is the description
2. **Announce:** "Anchored on **{co}**"
3. **Load policies** — Read all files in `companies/{co}/policies/` (skip `example-policy.md`)
4. **Scope qmd searches** — If company has `qmd_collections` in manifest, use `-c {collection}`

**If no match** → full `$ARGUMENTS` is the description text. Company resolved later.

**Board ID detection:** After company check, see if remaining args match a board.json project ID pattern (`{prefix}-proj-{NNN}`). If so, this brainstorm is expanding an existing idea — proceed to Step 1 with that ID.

## Step 1: Resolve Company + Board Idea

**If board ID matched in Step 0:**
1. If `{co}` already set: read `companies/{co}/board.json`, find entry by ID
2. If `{co}` not set: scan all `companies/*/board.json` for the ID (use manifest `board_path` list)
3. Extract the entry's `title` and `description` as starting context
4. Set `source_idea_id` = matched ID

**If no board ID and no company:** infer from cwd (`companies/{slug}/` → use that slug, `repos/{pub|priv}/{name}` → manifest lookup). If still ambiguous, ask in Step 3.

**If `$ARGUMENTS` is empty:** go straight to Step 3 (full interview).

## Step 2: HQ Research (before any questions)

Do not ask questions yet. Build context from HQ first.

**Semantic search:**
- If anchored + company has `qmd_collections`: `qmd vsearch "<description keywords>" -c {collection} --json -n 10`
- If not anchored: `qmd vsearch "<description keywords>" --json -n 10`

**Existing projects:**
- If anchored: search `companies/{co}/projects/` directly or `qmd search "prd.json" -c {co} --json -n 10`
- Read top 2-3 match metadata (name, description, status) to check for overlap

**Workers:**
- Read `workers/registry.yaml` — identify workers with skills matching the description

**Policies (anchored only):**
- Already loaded in Step 0. Note any constraints that affect approach selection

**Target repo (if inferable):**
- Note existence, don't deep-read. If repo has qmd collection, run scoped search

Present compact summary:
```
Research complete:
- Related projects: {list or "none found"}
- Relevant workers: {list}
- Policies: {count loaded}
- Prior art: {relevant knowledge hits or "none"}
```

## Step 3: Light Interview (1 AskUserQuestion max)

Batch all missing directional info into **one** `AskUserQuestion` call. Skip any field already clear from args, board entry, or research.

**Questions (include only what's missing):**

1. **What's the core problem or opportunity?** (skip if description is >15 words with clear intent)

2. **Which direction matters most?**
   - A. Speed to ship (MVP fast, iterate later)
   - B. Quality/durability (build it right once)
   - C. Exploration (prove or disprove a hypothesis first)
   - D. Cost minimization (cheapest viable path)

3. **Hard constraints?** (timeline, must-use-tech, budget ceiling, avoid-tech) — optional, free text

4. **Which company?** (only if not anchored and not inferrable from context)

**If all info is already clear** (description + company + direction obvious from context), skip the interview entirely.

## Step 4: Optional Web Research

**Only run if:**
- Idea involves external services, APIs, or tools the AI isn't confident about
- User is exploring an unfamiliar domain (new-to-them technology, market)
- A specific "research X first" constraint was stated

**If warranted:** 1-2 `WebSearch` calls. Extract relevant tools/APIs, known tradeoffs, pricing. Summarize in 3-5 bullets max.

**If HQ context is sufficient** (internal tooling, known platforms — the common case): skip entirely.

## Step 5: Generate brainstorm.md

**Derive slug** from title (lowercase, hyphens, no special chars).

**Create** `companies/{co}/projects/{slug}/brainstorm.md` (or `projects/{slug}/brainstorm.md` for personal/HQ):

```markdown
---
company: {slug}
created_at: {ISO8601}
status: exploring
promoted_to: null
source_idea_id: {board ID or null}
---

# {Title}

> {1-sentence problem/opportunity framing}

## Context

{2-4 sentences: why this matters now, what triggered the exploration, rough size of the thing}

## What We Know

- {Confirmed fact from HQ research — existing projects, prior work, tech constraints}
- {Relevant worker or knowledge base that exists}
- ...

## What We Don't Know

- {Open question that would change the approach}
- {Assumption that needs validating}
- {Missing info that blocks confident decision-making}
- ...

## Approaches

### Option A: {Name}

**How it works:** {2-3 sentences describing the approach}

**Tradeoffs:**
- Pro: {specific advantage}
- Pro: {specific advantage}
- Con: {specific cost or risk}

**Effort:** {S / M / L / XL}
**When to choose this:** {specific signal or condition that makes this the right pick}

---

### Option B: {Name}

**How it works:** {2-3 sentences}

**Tradeoffs:**
- Pro: {specific advantage}
- Con: {specific cost or risk}

**Effort:** {S / M / L / XL}
**When to choose this:** {condition}

---

### Option C: {Name} *(only if genuinely distinct from A and B)*

...

---

## Recommendation

**Preferred approach:** Option {X} — {one sentence on why}

**Key condition:** {What would make you choose a different option instead}

**Biggest risk:** {The one thing most likely to blow up the preferred approach}

## Next Steps

- [ ] {Specific validation task or question to resolve before starting PRD}
- [ ] {Other prerequisite}

**Promotion path:**
- Ready to build → `/prd {co} {slug}` (brainstorm.md pre-populates the interview)
- Needs more research → edit this file, revisit later
- Not worth pursuing → park as idea on the board
```

**Approach rules:**
- Generate exactly 2 approaches if the problem is well-defined
- Generate 3 only if there's a genuine third dimension (build vs buy, now vs later, etc.)
- Never more than 3 — collapse similar options or pick the most distinct
- Each option must differ on at least one of: effort, reversibility, dependency, or user experience
- Must state a recommendation — no "it depends" without a stated override condition
- T-shirt effort: S (hours-days), M (days-week), L (week-month), XL (month+). Be honest

## Step 6: Board Integration

Read `companies/{co}/board.json`.

**If started from existing board idea** (`source_idea_id` set):
- Find that entry by ID
- Update `status` → `"exploring"`
- Add `brainstorm_path: "companies/{co}/projects/{slug}/brainstorm.md"`
- Update `updated_at`

**If fresh brainstorm** (no existing board idea):
- Generate next ID: collect all `id` values from `projects` array, extract numeric suffixes from `{prefix}-proj-{NNN}` pattern, next = `{prefix}-proj-{max_N + 1}` zero-padded to 3 digits
- Append new entry:
  ```json
  {
    "id": "{prefix}-proj-{NNN}",
    "title": "{concise title}",
    "description": "{user's description}",
    "status": "exploring",
    "scope": "company",
    "app": null,
    "initiative_id": null,
    "objective_id": null,
    "prd_path": null,
    "brainstorm_path": "companies/{co}/projects/{slug}/brainstorm.md",
    "created_at": "{ISO8601}",
    "updated_at": "{ISO8601}"
  }
  ```

Write updated `board.json`.

## Step 7: Confirm & Reindex

Print:
```
Brainstorm: **{title}** ({id})
File: companies/{co}/projects/{slug}/brainstorm.md

Approaches:
  A. {Option A name} — {effort}
  B. {Option B name} — {effort}
  {C. Option C name — effort, if present}

Recommendation: Option {X}

Next:
  /prd {co} {slug}     → promote to PRD (pre-populates interview from brainstorm)
  Edit brainstorm.md    → refine approaches before promoting
```

Reindex: `qmd update 2>/dev/null || true`

## Rules

- **Scan HQ before asking anything** — research phase (Step 2) happens before the first question. Never ask for info findable in qmd, board.json, or policies
- **1 AskUserQuestion max** — direction + constraints in one call. If everything is clear from args/context, zero questions is fine
- **2-3 approaches, no more** — present distinct options, not variations. If only one reasonable path exists, say so and explain why
- **State a recommendation** — "it depends" without a stated override condition is not a recommendation
- **No execution** — brainstorm.md is the output. Do NOT write code, scaffold repos, or modify any implementation files
- **No prd.json** — this command does NOT produce prd.json. That is `/prd`'s job
- **No Linear sync** — brainstorms are pre-planning. Linear happens at `/prd` time
- **No orchestrator registration** — brainstorms are not executable
- **Web research is conditional** — only if idea requires external context. Don't search for thoroughness
- **board.json + brainstorm.md are the only files written** — no other files modified
- **T-shirt effort, not story points** — S (hours-days), M (days-week), L (week-month), XL (month+)
- **Do NOT use TodoWrite or EnterPlanMode** — this command IS the thinking artifact
- **Company isolation enforced** — if anchored, scope all searches to that company. Never mix company knowledge in approaches
- **brainstorm.md is human-editable** — the user may refine it after generation. `/prd` reads whatever is in the file, not just what was machine-generated
- **Do not create README.md** — brainstorm.md is self-contained. README comes with `/prd`
