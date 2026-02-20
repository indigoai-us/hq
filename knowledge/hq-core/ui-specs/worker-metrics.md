# Worker Metrics Dashboard UI Spec

Read-only dashboard showing HQ worker execution metrics, project status breakdown, and learning patterns. No mutations -- purely observational.

## Data Sources

| Source | Path | Purpose |
|--------|------|---------|
| Orchestrator state | `workspace/orchestrator/state.json` | Project list with status and story counts |
| Execution logs | `workspace/orchestrator/*/executions/*.json` | Per-task worker usage, phases, handoffs, timing |
| Learnings | `workspace/learnings/*.json` | Learning events with severity, scope, rules |

### Orchestrator state shape (`state.json`)

```json
{
  "projects": [
    {
      "name": "project-slug",
      "state": "IN_PROGRESS",
      "storiesComplete": 3,
      "storiesTotal": 8,
      "completedAt": "2026-02-10T04:00:00Z"
    }
  ]
}
```

### Execution log shape (`executions/*.json`)

```json
{
  "task_id": "US-001",
  "project": "project-slug",
  "started_at": "2026-02-09T22:30:00Z",
  "completed_at": "2026-02-09T22:35:00Z",
  "status": "completed",
  "phases": [
    { "worker": "backend-dev", "status": "completed", "completed_at": "..." }
  ],
  "handoffs": [
    {
      "from": "database-dev",
      "to": "code-reviewer",
      "context": {
        "summary": "...",
        "files_created": [],
        "key_decisions": [],
        "back_pressure": { "tests": "pass", "lint": "pass" }
      }
    }
  ]
}
```

### Learning event shape (`learnings/*.json`)

```json
{
  "event_id": "learn-20260213-070000",
  "rules": [
    {
      "rule": "Description of the learned rule",
      "scope": "global",
      "target_file": ".claude/CLAUDE.md",
      "severity": "medium"
    }
  ],
  "source": "build-activity",
  "project": "project-slug",
  "created_at": "2026-02-13T07:00:00Z"
}
```

## Server Routes

### `GET /` -- HTML page

Returns the full single-page dashboard (HTML + CSS + JS inlined). Content-Type: `text/html; charset=utf-8`.

### `GET /api/metrics` -- aggregated metrics data

Returns a JSON object with all dashboard data pre-computed server-side.

```json
{
  "summary": {
    "totalProjects": 40,
    "completed": 22,
    "inProgress": 8,
    "ready": 10,
    "totalStories": 280,
    "storiesComplete": 195,
    "totalExecutions": 68,
    "totalLearnings": 12
  },
  "workerUsage": [
    { "worker": "backend-dev", "count": 45 },
    { "worker": "code-reviewer", "count": 38 },
    { "worker": "dev-qa-tester", "count": 35 },
    { "worker": "database-dev", "count": 22 },
    { "worker": "frontend-dev", "count": 12 },
    { "worker": "architect", "count": 8 }
  ],
  "recentCompletions": [
    {
      "project": "project-slug",
      "task": "US-003",
      "completedAt": "2026-02-17T19:05:00Z",
      "workers": ["architect"],
      "durationMinutes": 5
    }
  ],
  "learnings": [
    {
      "eventId": "learn-20260217-000000",
      "source": "build-activity",
      "project": "protofit3-form-analysis",
      "ruleCount": 1,
      "severity": "medium",
      "createdAt": "2026-02-13T07:00:00Z"
    }
  ],
  "projectsByStatus": [
    { "name": "hq-cloud", "state": "IN_PROGRESS", "storiesComplete": 39, "storiesTotal": 64, "completedAt": null },
    { "name": "e2e-cloud-testing", "state": "COMPLETED", "storiesComplete": 13, "storiesTotal": 13, "completedAt": "2026-02-08T07:15:00Z" }
  ]
}
```

**Data assembly logic:**

1. Read `workspace/orchestrator/state.json`. Count projects by state (COMPLETED, IN_PROGRESS, READY). Sum story totals and completions.
2. Scan all `workspace/orchestrator/*/executions/*.json` files. For each execution, extract every worker name from the `phases` array. Aggregate into a frequency map. Sort descending by count for `workerUsage`.
3. From the same execution files, collect the 20 most recently completed (by `completed_at`) for `recentCompletions`. Compute duration in minutes from `started_at` to `completed_at`. List the workers used.
4. Read all `workspace/learnings/*.json` files. Extract rule count, highest severity among rules, source, and project for `learnings`. Sort by `created_at` descending.
5. Assemble `projectsByStatus` from state.json, sorted: IN_PROGRESS first, then READY, then COMPLETED.

## Visual Design

### Layout

- Full-viewport dark background (`--bg-primary`)
- Centered container, max-width 960px, 32px vertical padding, 16px horizontal padding
- Header at top, summary cards row, then three sections stacked vertically

### Header

- Left side: title "Worker Metrics" (18px, bold, `--text-primary`) with subtitle "Execution analytics across all HQ projects" (12px, `--text-tertiary`)
- Right side: timestamp of last data load as "Updated {relative time}" (12px, `--text-tertiary`)

### Summary Cards Row

Four equal-width cards in a horizontal row (CSS grid, 4 columns, 12px gap). Each card:

- Background: `--bg-card`, 1px `--border-subtle` border, 8px border-radius, 16px padding
- Large number: 24px, bold, tabular-nums, colored by type
- Label below: 11px, uppercase, letter-spacing 0.5px, `--text-tertiary`

| Card | Number Color | Label |
|------|-------------|-------|
| Total Projects | `--text-primary` | PROJECTS |
| Completed | `--accent-green` | COMPLETED |
| In Progress | `--accent-blue` | IN PROGRESS |
| Total Executions | `--accent-yellow` | TASK EXECUTIONS |

### Section 1: Worker Usage (Horizontal Bar Chart)

Section heading: "Most-Used Workers" (14px, semibold, `--text-primary`), with a count badge showing total unique workers.

A vertical list of horizontal bars, one per worker, sorted by usage count (highest first). Each row:

```
worker-name  [=============================] 45
  12px text    bar fill                       count
```

- **Row height:** 32px, with 4px gap between rows
- **Label:** Left-aligned, 12px, `--text-secondary`, fixed width 120px, truncated with ellipsis
- **Bar container:** Flexible width, 20px height, `--bg-tertiary` background, 4px border-radius
- **Bar fill:** Width proportional to count relative to the highest count (max bar = 100%). Height 20px, 4px border-radius
- **Bar colors rotate** through a palette for visual distinction:
  - 1st: `--accent-blue`
  - 2nd: `--accent-green`
  - 3rd: `--accent-yellow`
  - 4th: `rgba(168, 85, 247, 0.8)` (purple)
  - 5th: `--accent-red`
  - 6th+: `--text-tertiary`
- **Count:** Right-aligned, 12px, `--text-secondary`, tabular-nums, fixed width 40px
- **Hover:** Bar brightens to full opacity, row background becomes `--overlay-light`

### Section 2: Recent Completions Timeline

Section heading: "Recent Completions" (14px, semibold, `--text-primary`), with a count showing total executions.

A vertical timeline showing the 20 most recent task completions. Each entry:

```
 o  project-slug / US-003                    5m ago
 |    Workers: architect, code-reviewer
 |    Duration: 5 minutes
```

- **Timeline line:** 2px wide, `--border-subtle`, positioned 12px from left, running vertically through all entries
- **Timeline dot:** 8px circle, centered on the line. Color by recency:
  - Last 1 hour: `--accent-green` with a subtle glow (`box-shadow: 0 0 6px rgba(74, 222, 128, 0.4)`)
  - Last 24 hours: `--accent-blue`
  - Older: `--text-tertiary`
- **Entry container:** Left-padded 32px (past the timeline line), 12px vertical padding
- **Top line:** Project slug + task ID (13px, `--text-primary`), relative time right-aligned (12px, `--text-tertiary`)
- **Detail lines:** 11px, `--text-secondary`. "Workers: {comma-separated list}". "Duration: {N} minutes" (or "In progress" for incomplete).
- **Hover:** Entry background becomes `--overlay-light`, dot scales to 10px

### Section 3: Learnings Overview

Section heading: "Learnings" (14px, semibold, `--text-primary`), with total learning event count.

Two sub-sections side by side (CSS grid, 2 columns, 12px gap):

#### Left: Severity Breakdown

A compact list of severity levels with counts. Each row:

- Severity pill (badge style): background at 15% opacity, text in severity color, 10px font, full border-radius
  - `high`: red
  - `medium`: yellow
  - `low`: blue
- Count: 12px, `--text-primary`, tabular-nums, right of pill
- Bar (optional): Thin 4px horizontal bar showing proportion, matching severity color at 30% opacity

#### Right: Source Breakdown

Same layout as severity, but grouped by learning `source` field:

- `build-activity`: blue pill
- `task-completion`: green pill
- `back-pressure-failure`: red pill
- Other sources: grey pill (`--text-tertiary`)

Each pill shows the source label and count.

Below both sub-sections, a scrollable list (max-height 300px) of individual learnings:

```
[medium]  protofit3-form-analysis                   Feb 13
          "Project protofit3-form-analysis exists..."
```

- **Severity badge:** Pill matching severity color
- **Project name:** 12px, `--text-primary`
- **Date:** 11px, `--text-tertiary`, right-aligned
- **Rule preview:** First 80 characters of the first rule, 11px, `--text-secondary`, italic, truncated with ellipsis
- **Hover:** Full rule text expands (no truncation), background `--overlay-light`

### Empty States

- **No executions found:** Centered icon (terminal SVG, 32px, `--text-tertiary`) + "No task executions recorded yet." (14px, `--text-secondary`) + "Run /execute-task or /run-project to generate metrics." (12px, `--text-tertiary`)
- **No learnings found:** "No learnings captured yet." + "Learnings are generated automatically during task execution."
- **API error:** "Failed to load metrics" with a "Retry" button that re-fetches data.

### Responsive Behavior

- Below 768px: Summary cards stack to 2x2 grid. Learnings sub-sections stack vertically. Bar chart labels shrink to 80px.
- Below 480px: Summary cards stack to single column. Timeline reduces left padding.

## CSS Theme Block

Include the full HQ dark theme from the runtime protocol. Additionally, include these dashboard-specific styles:

```css
/* Summary cards grid */
.summary-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  margin-bottom: 32px;
}
.summary-card {
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  padding: 16px;
  text-align: center;
  transition: border-color 0.15s;
}
.summary-card:hover { border-color: var(--border-active); }
.summary-number {
  font-size: 24px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
}
.summary-label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-tertiary);
  margin-top: 4px;
}

/* Section containers */
.section {
  margin-bottom: 32px;
}
.section-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
}
.section-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}
.section-count {
  font-size: 11px;
  color: var(--text-tertiary);
  background: var(--bg-tertiary);
  padding: 2px 8px;
  border-radius: 9999px;
}

/* Bar chart */
.bar-row {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 32px;
  padding: 0 4px;
  border-radius: 4px;
  transition: background 0.15s;
}
.bar-row:hover { background: var(--overlay-light); }
.bar-label {
  width: 120px;
  flex-shrink: 0;
  font-size: 12px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bar-track {
  flex: 1;
  height: 20px;
  background: var(--bg-tertiary);
  border-radius: 4px;
  overflow: hidden;
}
.bar-fill {
  height: 100%;
  border-radius: 4px;
  transition: width 0.5s ease-out;
}
.bar-count {
  width: 40px;
  flex-shrink: 0;
  text-align: right;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: var(--text-secondary);
}

/* Timeline */
.timeline {
  position: relative;
  padding-left: 32px;
}
.timeline::before {
  content: '';
  position: absolute;
  left: 11px;
  top: 0;
  bottom: 0;
  width: 2px;
  background: var(--border-subtle);
}
.timeline-entry {
  position: relative;
  padding: 12px 0;
  transition: background 0.15s;
  border-radius: 4px;
}
.timeline-entry:hover { background: var(--overlay-light); }
.timeline-dot {
  position: absolute;
  left: -25px;
  top: 16px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  transition: transform 0.15s;
}
.timeline-entry:hover .timeline-dot { transform: scale(1.25); }
.timeline-dot.recent { box-shadow: 0 0 6px rgba(74, 222, 128, 0.4); }
.timeline-top {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}
.timeline-task {
  font-size: 13px;
  color: var(--text-primary);
}
.timeline-time {
  font-size: 12px;
  color: var(--text-tertiary);
}
.timeline-detail {
  font-size: 11px;
  color: var(--text-secondary);
  margin-top: 2px;
}

/* Learnings layout */
.learnings-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 16px;
}
.breakdown-card {
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  padding: 12px;
}
.breakdown-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 8px;
}
.breakdown-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
}
.breakdown-bar {
  flex: 1;
  height: 4px;
  border-radius: 2px;
}
.breakdown-count {
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: var(--text-primary);
  min-width: 20px;
  text-align: right;
}

/* Learning list */
.learning-list {
  max-height: 300px;
  overflow-y: auto;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
}
.learning-list::-webkit-scrollbar { width: 6px; }
.learning-list::-webkit-scrollbar-track { background: var(--bg-secondary); }
.learning-list::-webkit-scrollbar-thumb { background: var(--border-active); border-radius: 3px; }
.learning-item {
  padding: 10px 12px;
  border-bottom: 1px solid var(--border-subtle);
  transition: background 0.15s;
  cursor: default;
}
.learning-item:last-child { border-bottom: none; }
.learning-item:hover { background: var(--overlay-light); }
.learning-item:hover .learning-rule {
  white-space: normal;
  overflow: visible;
  text-overflow: unset;
}
.learning-top {
  display: flex;
  align-items: center;
  gap: 8px;
}
.learning-project {
  font-size: 12px;
  color: var(--text-primary);
  flex: 1;
}
.learning-date {
  font-size: 11px;
  color: var(--text-tertiary);
}
.learning-rule {
  font-size: 11px;
  color: var(--text-secondary);
  font-style: italic;
  margin-top: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

/* Responsive */
@media (max-width: 768px) {
  .summary-grid { grid-template-columns: repeat(2, 1fr); }
  .learnings-grid { grid-template-columns: 1fr; }
  .bar-label { width: 80px; }
}
@media (max-width: 480px) {
  .summary-grid { grid-template-columns: 1fr; }
  .timeline { padding-left: 24px; }
  .timeline-dot { left: -17px; }
}
```

## Data Shape Summary

The `/api/metrics` endpoint returns:

```typescript
interface WorkerMetrics {
  summary: {
    totalProjects: number;
    completed: number;
    inProgress: number;
    ready: number;
    totalStories: number;
    storiesComplete: number;
    totalExecutions: number;
    totalLearnings: number;
  };
  workerUsage: Array<{ worker: string; count: number }>;
  recentCompletions: Array<{
    project: string;
    task: string;
    completedAt: string;     // ISO8601
    workers: string[];
    durationMinutes: number;
  }>;
  learnings: Array<{
    eventId: string;
    source: string;
    project: string;
    ruleCount: number;
    severity: string;
    createdAt: string;        // ISO8601
    firstRule: string;        // First rule text for preview
  }>;
  projectsByStatus: Array<{
    name: string;
    state: string;
    storiesComplete: number;
    storiesTotal: number;
    completedAt: string | null;
  }>;
}
```

## Generation Notes

An agent reading this spec plus the runtime protocol should generate a single `.js` file that:

1. Uses Node `http`, `fs/promises`, `path`, `url` -- no other modules.
2. Implements two routes (`GET /`, `GET /api/metrics`). No POST routes -- this is a read-only dashboard.
3. For data assembly, recursively scans `workspace/orchestrator/*/executions/*.json` using `fs.readdir` with `withFileTypes: true` at both directory levels. Handles missing directories gracefully.
4. Embeds the full HTML page with CSS custom properties and all component styles as a template literal.
5. Embeds the client-side JavaScript as a template literal implementing: data fetch on load, summary cards, bar chart rendering (DOM-based, no canvas), timeline rendering, learnings breakdown, hover interactions, responsive layout.
6. Client-side relative time formatting (e.g., "5m ago", "2h ago", "3d ago") using `Date.now()` arithmetic -- no external libraries.
7. Handles `HQ_ROOT` env var (defaults to `C:\hq`), `PORT` env var (defaults to 3100).
8. Binds to localhost, handles SIGINT/SIGTERM for graceful shutdown.
9. Uses `path.join()` for all filesystem paths (Windows compatible).
10. The bar chart is rendered purely with styled `div` elements (no SVG, no canvas). Bar widths are computed as percentages relative to the maximum count.
