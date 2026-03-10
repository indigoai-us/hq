---
description: Explore approaches and tradeoffs before committing to task creation
allowed-tools: Task, Read, Glob, Grep, Write, Bash, AskUserQuestion, WebSearch
argument-hint: [company] <idea description or board idea ID>
visibility: public
---

# /brainstorm - Structured Exploration

Think through a problem before committing to tasks. Research GHQ context, compare approaches, surface unknowns.

**Input:** $ARGUMENTS

**Pipeline:** `/idea` → **`/brainstorm`** → `/create-task` → `/execute-task`

## Step 0: Parse Input & Company Anchor

Check if the **first word** of `$ARGUMENTS` matches a company slug in `companies/manifest.yaml`.

**How to check:** Read `companies/manifest.yaml`. Extract top-level keys (company slugs). If the first word of `$ARGUMENTS` exactly matches one:

1. **Set `{co}`** = matched slug. Strip from `$ARGUMENTS` — remaining text is the description
2. **Announce:** "Anchored on **{co}**"
3. **Scope qmd searches** — If company has `qmd_collections` in manifest, use `-c {collection}`

**If no match** → full `$ARGUMENTS` is the description text. Company resolved later.

**Board ID detection:** After company check, see if remaining args match a board.json project ID pattern (`{prefix}-proj-{NNN}`). If so, this brainstorm is expanding an existing idea — read its title and description from `companies/{co}/board.json`.

## Step 1: Resolve Company + Board Idea

**If board ID matched in Step 0:**
1. If `{co}` already set: read `companies/{co}/board.json`, find entry by ID
2. If `{co}` not set: scan all `companies/*/board.json` for the ID
3. Extract the entry's `title` and `description` as starting context
4. Set `source_idea_id` = matched ID

**If no board ID and no company:** infer from cwd (`companies/{slug}/` → use that slug). If still ambiguous, ask in Step 3.

**If `$ARGUMENTS` is empty:** go straight to Step 3 (full interview).

## Step 2: GHQ Research (before any questions)

Do not ask questions yet. Build context from GHQ first.

**Semantic search:**
- If anchored + company has `qmd_collections`: `qmd vsearch "<description keywords>" -c {collection} --json -n 10`
- If not anchored: `qmd vsearch "<description keywords>" --json -n 10`

**Existing projects:**
- If anchored: `bd list --type epic --json` from company dir to find existing project epics

**Skills:**
- Scan `.claude/skills/*/SKILL.md` frontmatter for relevant skills

**Target repo (if inferable):**
- Check manifest for company repos. If repo has qmd collection, run scoped search

Present compact summary:
```
Research complete:
- Related projects: {list or "none found"}
- Relevant skills: {list}
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

**If all info is already clear**, skip the interview entirely.

## Step 4: Optional Web Research

**Only run if:**
- Idea involves external services, APIs, or tools the AI isn't confident about
- User is exploring an unfamiliar domain
- A specific "research X first" constraint was stated

**If warranted:** 1-2 `WebSearch` calls. Extract relevant tools/APIs, known tradeoffs. Summarize in 3-5 bullets max.

**If GHQ context is sufficient** (the common case): skip entirely.

## Step 5: Generate brainstorm.md

**Derive slug** from title (lowercase, hyphens, no special chars).

**Create** `companies/{co}/projects/{slug}/brainstorm.md`:

```markdown
---
company: {slug}
created_at: {ISO8601}
status: exploring
source_idea_id: {board ID or null}
---

# {Title}

> {1-sentence problem/opportunity framing}

## Context

{2-4 sentences: why this matters now, what triggered the exploration, rough size}

## What We Know

- {Confirmed fact from GHQ research — existing projects, prior work, tech constraints}
- {Relevant skill or knowledge base that exists}
- ...

## What We Don't Know

- {Open question that would change the approach}
- {Assumption that needs validating}
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

- [ ] {Specific validation task or question to resolve before creating tasks}
- [ ] {Other prerequisite}

**Promotion path:**
- Ready to build → `/create-task {co} {slug}` (brainstorm.md pre-populates the interview)
- Needs more research → edit this file, revisit later
- Not worth pursuing → park as idea on the board
```

**Approach rules:**
- Generate exactly 2 approaches if the problem is well-defined
- Generate 3 only if there's a genuine third dimension (build vs buy, now vs later, etc.)
- Never more than 3 — collapse similar options
- Each option must differ on at least one of: effort, reversibility, dependency, or user experience
- Must state a recommendation — no "it depends" without a stated override condition
- T-shirt effort: S (hours-days), M (days-week), L (week-month), XL (month+)

## Step 6: Board Integration

Read `companies/{co}/board.json` (if it exists).

**If started from existing board idea** (`source_idea_id` set):
- Find that entry by ID
- Update `status` → `"exploring"`
- Add `brainstorm_path: "companies/{co}/projects/{slug}/brainstorm.md"`
- Update `updated_at`

**If fresh brainstorm** (no existing board idea):
- Initialize board.json if needed (same as /idea Step 4)
- Generate next ID following existing conventions
- Append new entry with `status: "exploring"` and `brainstorm_path` set

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
  /create-task {co} {slug}  → create tasks (pre-populates from brainstorm)
  Edit brainstorm.md         → refine approaches before promoting
```

Reindex: `qmd update 2>/dev/null || true`

## Rules

- **Scan GHQ before asking anything** — research phase (Step 2) happens before the first question
- **1 AskUserQuestion max** — direction + constraints in one call. Zero questions is fine if clear
- **2-3 approaches, no more** — present distinct options, not variations
- **State a recommendation** — "it depends" without a stated override condition is not a recommendation
- **No execution** — brainstorm.md is the output. Do NOT write code or modify implementation files
- **No task creation** — this command does NOT create bd tasks. That is `/create-task`'s job
- **board.json + brainstorm.md are the only files written**
- **T-shirt effort, not story points** — S (hours-days), M (days-week), L (week-month), XL (month+)
- **Do NOT use TodoWrite or EnterPlanMode** — this command IS the thinking artifact
- **Company isolation enforced** — if anchored, scope all searches to that company
- **brainstorm.md is human-editable** — the user may refine it after generation. `/create-task` reads whatever is in the file
