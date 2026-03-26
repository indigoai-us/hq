---
description: Explore approaches and tradeoffs before decomposing into subtasks
allowed-tools: Task, Read, Glob, Grep, Write, Bash, AskUserQuestion, WebSearch
argument-hint: [company] <description or bd task ID>
visibility: public
---

# /brainstorm - Structured Exploration

Think through a problem before committing to tasks. Research HQ context, compare approaches, surface unknowns.

**Input:** $ARGUMENTS

**Pipeline:** `/idea` → **`/brainstorm`** → `/plan-project` → `/run-project`

## Step 0: Parse Input & Company Anchor

Check if the **first word** of `$ARGUMENTS` matches a company slug in `companies/manifest.yaml`.

**How to check:** Read `companies/manifest.yaml`. Extract top-level keys (company slugs). If the first word of `$ARGUMENTS` exactly matches one:

1. **Set `{co}`** = matched slug. Strip from `$ARGUMENTS` — remaining text is the description
2. **Announce:** "Anchored on **{co}**"
3. **Scope qmd searches** — If company has `qmd_collections` in manifest, use `-c {collection}`

**If no match** → full `$ARGUMENTS` is the description text. Company resolved later.

**Task ID detection:** After company check, see if remaining args match a bd task ID pattern (e.g. `hq-abc`). If so, this brainstorm is expanding an existing idea task.

## Step 1: Resolve Company + Existing Task

**If task ID matched:**
1. `cd companies/{co}` then `bd show {task-id} --json`
2. Extract the task's title and description as starting context
3. Set `source_task_id` = matched ID

**If no match and no company:** infer from cwd (`companies/{slug}/` → use that slug). If still ambiguous, ask in Step 3.

**If `$ARGUMENTS` is empty:** go straight to Step 3 (full interview).

## Step 2: HQ Research (before any questions)

Do not ask questions yet. Build context from HQ first.

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

## Step 2.1: Repo Exploration (if target repo identified)

**Skip if** no target repo was found in Step 2 (e.g. knowledge-only or HQ infrastructure tasks).

**Goal:** Understand the repo's structure, patterns, and relevant code before forming approaches. This prevents brainstorm options that conflict with existing architecture.

**Procedure:**

1. **Read repo overview** — check for README.md, CLAUDE.md, package.json, or equivalent at repo root
2. **Scan structure** — `ls` key directories (src/, app/, lib/, etc.) to understand project layout
3. **Find relevant code** — based on the task description, use Grep/Glob to locate:
   - Files directly related to the feature/problem area
   - Existing patterns (how similar features are implemented)
   - Shared utilities, types, or components that would be reused
4. **Read key files** — read 2-5 most relevant files to understand current implementation

**Append to research summary:**
```
Repo context ({repo name}):
- Stack: {framework, language, key deps}
- Relevant files: {list of files related to this task}
- Existing patterns: {how similar things are done in this codebase}
- Integration points: {where new code would connect}
```

**Keep it targeted** — only explore what's relevant to the task description. Do not map the entire repo.

## Step 2.5: Bug Reproduction (bugs only)

**Skip unless** the task description, title, or labels indicate a **bug** (e.g. label `bug`, words like "broken", "error", "crash", "regression", "doesn't work").

**Goal:** Reproduce the bug in the **running application** to confirm behavior, identify the exact code path, capture evidence, and gather debugging context before exploring approaches. **Do NOT start coding a fix until reproduction is complete.**

**Procedure:**

1. **Identify reproduction target** from the task description — URL, app screen, or user flow
2. **Load the browser-automation skill** (read `.claude/skills/browser-automation/SKILL.md`) for command reference
3. **Connect to the running app:**

   **For web apps:**
   ```bash
   agent-browser open <url>
   agent-browser wait --load networkidle
   agent-browser snapshot -ic
   ```

   **For Electron / desktop apps (CDP):**
   - Check if the app is already running: `lsof -i :9222` (CDP port) or `lsof -i :1212` (renderer port)
   - If not running, start it:
     ```bash
     cd <electron-app-dir> && pnpm run start &
     ```
   - Wait for CDP to be ready, then connect:
     ```bash
     # Verify CDP is listening
     curl -s http://localhost:9222/json
     # Connect via CDP
     agent-browser --cdp 9222 snapshot -ic
     ```

4. **Reproduce the exact user flow:**
   - Follow the bug report steps precisely — click the same buttons, navigate the same paths
   - After **each significant action**, take a snapshot and/or screenshot to observe state
   - **Identify which code path is triggered** — use `agent-browser eval` to inspect DOM elements, component props, or state:
     ```bash
     agent-browser --cdp 9222 eval "document.querySelector('[data-testid=...]')?.textContent"
     agent-browser --cdp 9222 eval "JSON.stringify(window.__STORE__?.getState()?.user)"
     ```
   - This step is critical: a bug in "company switching" could be in CompanySwitcher, SidebarFooter, or auth context — **observe which UI element the user clicks**

5. **Capture evidence:**
   ```bash
   agent-browser screenshot bug-evidence.png    # Visual proof
   agent-browser errors                         # JS errors
   agent-browser console                        # Console output
   ```

6. **Record findings** — append to the research summary from Step 2:
   ```
   Bug reproduction:
   - Reproduced: {yes / no / partial}
   - Observed behavior: {what actually happens}
   - Expected behavior: {from bug report}
   - Code path identified: {which component/handler is involved}
   - Error signals: {console errors, network failures, or "none"}
   - Environment notes: {anything relevant — viewport, auth state, etc.}
   ```

**Critical rule: Reproduce first, code second.** Never start writing a fix based on code reading alone. 5 minutes of in-app observation prevents hours of fixing the wrong code path.

**If reproduction fails:** Note what was tried and what differed from the report. This is still valuable context for Step 5 approaches (e.g. "may be environment-specific").

**If the app requires auth or is not web-accessible:** Check for CDP, deep-link auth, or saved sessions. Only skip reproduction as last resort — flag it as a major open question in "What We Don't Know".

## Step 3: Light Interview (4 AskUserQuestion max)

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

**If HQ context is sufficient** (the common case): skip entirely.

## Step 5: Populate bd Task Description

Write the brainstorm output directly into the bd task description. No files generated.

**Description format** (use as the bd task description):

```
{1-sentence problem/opportunity framing}

## Context

{2-4 sentences: why this matters now, what triggered the exploration, rough size}

## What We Know

- {Confirmed fact from HQ research — existing projects, prior work, tech constraints}
- {Relevant skill or knowledge base that exists}

## What We Don't Know

- {Open question that would change the approach}
- {Assumption that needs validating}

## Approaches

### Option A: {Name}
How: {2-3 sentences}
Pro: {specific advantage} | Pro: {specific advantage}
Con: {specific cost or risk}
Effort: {S / M / L / XL} | When: {condition}

### Option B: {Name}
How: {2-3 sentences}
Pro: {specific advantage}
Con: {specific cost or risk}
Effort: {S / M / L / XL} | When: {condition}

### Option C: {Name} (only if genuinely distinct)
...

## Recommendation

Preferred: Option {X} — {one sentence on why}
Override condition: {What would make you choose a different option}
Biggest risk: {The one thing most likely to blow up the preferred approach}

## Next Steps

- {Specific validation task or question to resolve before creating tasks}
- {Other prerequisite}
```

**Approach rules:**
- Generate exactly 2 approaches if the problem is well-defined
- Generate 3 only if there's a genuine third dimension (build vs buy, now vs later, etc.)
- Never more than 3 — collapse similar options
- Each option must differ on at least one of: effort, reversibility, dependency, or user experience
- Must state a recommendation — no "it depends" without a stated override condition
- T-shirt effort: S (hours-days), M (days-week), L (week-month), XL (month+)

## Step 6: Write to bd Task

If started from an existing bd task (`source_task_id` set):

```bash
cd companies/{co}
bd update {source_task_id} \
  --description "{full brainstorm description from Step 5}"
bd label add {source_task_id} exploring
bd label remove {source_task_id} idea
```

If fresh brainstorm (no existing task), create a new bd task:

```bash
cd companies/{co}
bd create "{title}" \
  --parent {project-epic-id} \
  --type task \
  --description "{full brainstorm description from Step 5}" \
  --labels "{company-label},exploring" \
  --silent
```

## Step 7: Confirm & Reindex

Print:
```
Brainstorm: **{title}** ({id})

Approaches:
  A. {Option A name} — {effort}
  B. {Option B name} — {effort}
  {C. Option C name — effort, if present}

Recommendation: Option {X}

Next:
  /plan-project {co} {task-id}  → create subtasks
  bd show {task-id}      → review brainstorm in task description
```

Reindex: `qmd update 2>/dev/null || true`

## Rules

- **Scan HQ before asking anything** — research phase (Step 2) happens before the first question
- **1 AskUserQuestion max** — direction + constraints in one call. Zero questions is fine if clear
- **2-3 approaches, no more** — present distinct options, not variations
- **State a recommendation** — "it depends" without a stated override condition is not a recommendation
- **No execution** — bd task description is the output. Do NOT write code or modify implementation files
- **No file generation** — brainstorm content goes into the bd task description, not a separate file
- **bd task is the only artifact** — no files written to disk
- **T-shirt effort, not story points** — S (hours-days), M (days-week), L (week-month), XL (month+)
- **Do NOT use TodoWrite or EnterPlanMode** — this command IS the thinking artifact
- **Company isolation enforced** — if anchored, scope all searches to that company
