---
description: Generate a visual HTML goals dashboard for a company
allowed-tools: Read, Write, Bash, AskUserQuestion
argument-hint: [company-slug | --all]
visibility: public
---

# /dashboard - Company Goals Dashboard

Generate a self-contained HTML dashboard showing OKR tree, project health, and goal alignment. Opens in browser.

**Input:** $ARGUMENTS

## Step 1: Resolve Target

Parse `$ARGUMENTS`:
- `--all` → generate dashboard for every company with a board.json
- `{slug}` → specific company
- Empty → infer company from cwd (same logic as `/idea` Step 2)

Read `companies/manifest.yaml` to resolve company slug(s).

## Step 2: Generate Dashboard

For each target company:

1. Read `companies/{co}/board.json`
2. If `schema_version` < 2 or missing, warn and skip
3. Read linked prd.json files (where `prd_path` exists on projects) to get story-level completion data. Limit to 20 prd.json reads max per company to avoid timeout.
4. Compute metrics (see Step 3)
5. Generate HTML (see Step 4)
6. Write to `workspace/reports/{co}-goals.html` (overwrites existing)
7. Run `open workspace/reports/{co}-goals.html`

## Step 3: Compute Metrics

**Per Key Result:**
- If `source == "derived"` and `project_ids` is non-empty:
  - `current` = count of linked projects with status in `["done", "completed"]`
  - `target` = `project_ids.length`
- If `source == "manual"`: use `current` and `target` as stored
- `pct` = `Math.round((current / target) * 100)` (clamp 0-100)
- Auto-status: pct >= 100 → completed, >= 70 → on_track, >= 40 → at_risk, < 40 → off_track

**Per Objective:**
- `kr_progress` = average of all KR pct values (0 if no KRs)
- `linked_projects` = unique set of all project_ids across KRs
- `project_completion` = count of linked projects done / total linked

**Per Story (from prd.json reads):**
- For each project with `prd_path`, count stories where `passes === true` vs total
- Store as `{proj_id: {done: N, total: M}}`

**Board-level:**
- `total_objectives` = objectives.length
- `active_projects` = projects where status NOT in ["archived", "done", "completed"]
- `avg_kr_completion` = average pct across all KRs
- `unlinked_projects` = projects where `objective_id` is null/missing
- `status_distribution` = count projects by status bucket

## Step 4: Generate HTML

Write a self-contained HTML file. All CSS inline, Chart.js from CDN.

**Use this exact CSS variable system (matches existing HQ reports):**

```css
:root {
  --bg: #000;
  --card: #0a0a0d;
  --surface: #111115;
  --elevated: #19191f;
  --border: #1c1c22;
  --border-strong: #28282f;
  --t1: #F4F4F5;
  --t2: #A1A1AA;
  --t3: #71717A;
  --t4: #52525B;
  --t5: #3F3F46;
  --purple: #7C3AED;
  --purple-l: #A78BFA;
  --green: #34D399;
  --green-dim: rgba(52,211,153,0.12);
  --blue: #60A5FA;
  --rose: #FB7185;
  --rose-dim: rgba(251,113,133,0.12);
  --amber: #FBBF24;
  --amber-dim: rgba(251,191,36,0.12);
  --mono: 'SF Mono','Fira Code','JetBrains Mono',monospace;
}
```

**Font:** Inter from Google Fonts CDN.
**Chart:** Chart.js 4.4.7 from jsdelivr CDN.

### Section 1: Header

```html
<header>
  <h1>{Company Name} — Goals Dashboard</h1>
  <p class="date">Generated {YYYY-MM-DD} • board.json v{schema_version}</p>
  <div class="kpi-row">
    <div class="kpi-card">
      <div class="kpi-value">{total_objectives}</div>
      <div class="kpi-label">Objectives</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-value">{active_projects}</div>
      <div class="kpi-label">Active Projects</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-value">{avg_kr_completion}%</div>
      <div class="kpi-label">Avg KR Progress</div>
    </div>
  </div>
</header>
```

### Section 2: OKR Tree

For each objective, render a card:

```html
<div class="obj-card">
  <div class="obj-header">
    <span class="status-dot {status-class}"></span>
    <h2>{title}</h2>
    <span class="timeframe">{timeframe}</span>
  </div>
  <div class="obj-meta">
    <span>Owner: {owner || "unassigned"}</span>
    {if linear_initiative_id: <span class="linear-badge">Linear ↗</span>}
  </div>

  {for each key_result:}
  <div class="kr-row">
    <div class="kr-title">{kr.title}</div>
    <div class="progress-bar">
      <div class="progress-fill {status-class}" style="width:{pct}%"></div>
    </div>
    <span class="kr-stat">{current}/{target} {unit}</span>
  </div>
  <div class="kr-projects">
    {for each project_id: <span class="proj-chip {status}">{proj_id}: {short-title}</span>}
    {if prd data: <span class="story-count">{done}/{total} stories</span>}
  </div>
  {end for}

  {if no key_results:}
  <div class="empty-kr">No key results defined. Run <code>/goals add-kr {obj-id}</code></div>
  {end if}
</div>
```

**Status colors for dots and progress bars:**
- `on_track` / `completed`: `var(--green)`
- `at_risk`: `var(--amber)`
- `off_track`: `var(--rose)`
- `paused`: `var(--t4)`

**Project chip colors by status:**
- `done` / `completed`: green border
- `in_progress`: blue border
- `prd_created` / `idea`: gray border
- `stale` / `paused`: amber border

### Section 3: Project Health (Chart.js doughnut)

```html
<div class="chart-section">
  <h2>Project Health</h2>
  <canvas id="statusChart"></canvas>
</div>
```

Chart data from `status_distribution`. Use colors:
- idea: `var(--t4)`
- prd_created: `var(--blue)`
- in_progress: `var(--purple-l)`
- done/completed: `var(--green)`
- paused/stale: `var(--amber)`
- archived: `var(--t5)`

Configure: dark background, white text labels, no border, legend below chart.

### Section 4: Unaligned Work

If any projects have no `objective_id`:

```html
<div class="unaligned-section">
  <h2>Unaligned Projects ({count})</h2>
  <p class="hint">These projects aren't linked to any objective. Run <code>/goals link-project</code> to align them.</p>
  <div class="proj-list">
    {for each unlinked project:}
    <div class="proj-row">
      <span class="proj-id">{id}</span>
      <span class="proj-title">{title}</span>
      <span class="proj-status {status}">{status}</span>
    </div>
    {end for}
  </div>
</div>
```

### Section 5: Footer

```html
<footer>
  <p>Source: companies/{co}/board.json • Schema v{version}</p>
  <p>Refresh: <code>/dashboard {co}</code></p>
</footer>
```

### Empty State

If company has 0 objectives:

```html
<div class="empty-state">
  <h2>No Objectives Yet</h2>
  <p>Run <code>/goals add-objective --company {co}</code> to create your first objective.</p>
  <p>{projects.length} projects exist on this board but have no goal alignment.</p>
</div>
```

## Step 5: Confirm

Print:
```
Dashboard generated: workspace/reports/{co}-goals.html
{total_objectives} objectives, {kr_count} key results, {project_count} projects
{unlinked_count} unaligned projects

Open: open workspace/reports/{co}-goals.html
```

## Rules

- **Self-contained HTML only** — all CSS inline, JS inline, CDN for fonts/Chart.js
- **No server** — static file opened with `open` command
- **Overwrite on re-run** — same filename each time (no timestamp clutter)
- **Max 20 prd.json reads per company** — prevent timeout on large boards
- **Graceful degradation** — missing prd.json = skip story counts, missing objectives = show empty state
- **Dark terminal aesthetic** — must match existing HQ report style (CSS vars above)
- **No TodoWrite** — single-step generation
