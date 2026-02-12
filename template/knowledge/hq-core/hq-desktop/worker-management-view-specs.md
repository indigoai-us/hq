# Worker Management View Specs

**Story:** US-008 - Design worker management view specs
**Date:** 2026-02-11
**Depends on:** US-007 (Worker System to Desktop UX Mapping)
**Scope:** Detailed view specifications for worker browser, skill runner, execution monitor, and learning viewer in HQ Desktop.

---

## 1. Worker List View (Enhanced `workers-drill.tsx`)

### 1.1 Information Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│ Workers                                          36 active · 2 exec │
│                                                                     │
│ ┌─ Filters ───────────────────────────────────────────────────────┐ │
│ │ [All Types ▾] [All Companies ▾] [Active ▾] [Search...        ] │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│ ┌─ Group: dev-team (16) ──────────────────────────────────────────┐ │
│ │ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌────────┐ │ │
│ │ │ architect    │ │ frontend-dev │ │ backend-dev  │ │ ...    │ │ │
│ │ │ CodeWorker   │ │ CodeWorker   │ │ CodeWorker   │ │        │ │ │
│ │ │ ● idle       │ │ ◉ executing  │ │ ● idle       │ │        │ │ │
│ │ │ 4 skills     │ │ 3 skills     │ │ 5 skills     │ │        │ │ │
│ │ └──────────────┘ └──────────────┘ └──────────────┘ └────────┘ │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│ ┌─ Group: acme (6) ────────────────────────────────────────┐ │
│ │ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌────────┐ │ │
│ │ │ cfo-lr       │ │ lr-analyst   │ │ infobip-adm  │ │ ...    │ │ │
│ │ │ OpsWorker    │ │ Research     │ │ OpsWorker    │ │        │ │ │
│ │ │ ● idle       │ │ ● idle       │ │ ● idle       │ │        │ │ │
│ │ │ 🔒 private   │ │ 🔒 private   │ │ 🔒 private   │ │        │ │ │
│ │ └──────────────┘ └──────────────┘ └──────────────┘ └────────┘ │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│ ┌─ Group: content-team (5) ───────────────────────────────────────┐ │
│ │ ...                                                              │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│ ┌─ Group: standalone (8) ─────────────────────────────────────────┐ │
│ │ ...                                                              │ │
│ └─────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.2 Filter Bar Spec

| Filter | Type | Options | Default |
|--------|------|---------|---------|
| Type | Dropdown (multi-select) | CodeWorker, OpsWorker, ContentWorker, ResearchWorker, SocialWorker, Library | All |
| Company | Dropdown (multi-select) | acme, widgets, designco, personal, (public) | All |
| Status | Dropdown | Active, Inactive, All | Active |
| Search | Text input | Free-text filter on id, name, description | Empty |

**Filter behavior:**
- Filters are AND-combined (type=CodeWorker AND company=acme)
- Group headers show filtered count (e.g., "dev-team (3 of 16)")
- Empty groups are hidden when filters are active
- Filter state persists across navigation (stored in URL params or Zustand)

### 1.3 Grouping Options

| Group By | Default | Sections |
|----------|---------|----------|
| Team | Yes | dev-team, content-team, standalone + company-private groups |
| Company | No | acme, widgets, designco, personal, public |
| Type | No | CodeWorker, OpsWorker, etc. |
| Status | No | Active, Inactive |

Switch via a `GlassChip` toggle row below filters (existing pattern from `EmpireView`).

### 1.4 Worker Card Enhancements

**Current card shows:** id, type badge, state dot, state label.

**Enhanced card should show:**

| Element | Position | Source | Notes |
|---------|----------|--------|-------|
| Worker ID | Title | registry.yaml `id` | Bold, white/80 |
| Worker type | Subtitle badge | registry.yaml `type` | Colored per type |
| State dot + label | Below title | Latest thread state | Animated per state (see US-007 state table) |
| Skill count | Bottom-right | worker.yaml `skills` length | "N skills" in white/40 |
| Visibility icon | Top-right corner | registry.yaml `visibility` | Lock icon for private, blank for public |
| Company badge | Below type badge | registry.yaml `company` or "public" | Only when grouped by non-company dimension |
| Last active | Bottom-left | Latest thread `completed_at` | Relative time ("2h ago") or "Never" |

**Card interactions:**
- Click card body: navigate to Worker Detail view
- No inline Run button on list cards (reduces clutter; Run is on detail view)

### 1.5 Data Requirements (Rust Backend)

| Requirement | Current Status | Change Needed |
|-------------|---------------|---------------|
| `list_workers` returns `visibility` | Missing | Add field to WorkerEntry struct |
| `list_workers` returns `company` | Missing | Add field to WorkerEntry struct |
| Skill count without loading detail | Not available | Option A: add `skill_count` to list response. Option B: lazy-load on hover |
| Last active timestamp per worker | Derivable from threads | Option A: compute in Rust. Option B: compute in frontend from threads |

---

## 2. Worker Detail View (Enhanced `worker-detail.tsx`)

### 2.1 Information Architecture

Tabbed layout replacing current single-scroll view.

```
┌─────────────────────────────────────────────────────────────────────┐
│ ← Workers    frontend-dev                                           │
│              CodeWorker · dev-team · active                          │
│                                                                     │
│ ┌─ Status Card ───────────────────────────────────────────────────┐ │
│ │  ◉ executing generate-code       "Building auth component..."   │ │
│ │  Started 3m ago                   Est. 7m remaining             │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│ ┌─ Tabs ──────────────────────────────────────────────────────────┐ │
│ │ [Overview] [Skills (4)] [Activity (12)] [Learnings (7)] [Metrics]│ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│ ┌─ Tab Content Area ──────────────────────────────────────────────┐ │
│ │                                                                  │ │
│ │  (Scrollable, content varies per tab — see sections below)       │ │
│ │                                                                  │ │
│ └─────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 Status Card (Always Visible Header)

Present at top of detail view regardless of active tab.

| State | Display | Color | Animation |
|-------|---------|-------|-----------|
| idle | "Idle — ready for tasks" | `--status-idle` (white/30) | None |
| loading | "Loading context..." with file count | Blue/40 | Pulsing dot |
| planning | "Planning approach..." | Blue/40 | Pulsing dot |
| executing | "Executing {skill}..." with elapsed time | Green/60 | Animated dot + ping |
| verifying | "Running checks..." with checklist | Yellow/50 | Pulsing dot |
| post_hook | "Saving state..." | White/30 | Brief flash |
| completed | "Completed {skill}" with timestamp | Green check | Fade to idle after 10s |
| error | Error message with retry count | Red/50 | Pulse |

**Active execution details** (shown only during executing/verifying):
- Elapsed time counter (live-updating)
- Estimated remaining time (based on `execution.max_runtime`)
- Current skill name
- Link to terminal session (if PTY is active)

### 2.3 Overview Tab

The default tab showing worker configuration and description.

```
┌─────────────────────────────────────────────────────────────────────┐
│ Overview                                                            │
│                                                                     │
│ ┌─ Configuration ─────────────────────────────────────────────────┐ │
│ │  ID            frontend-dev                                      │ │
│ │  Type          CodeWorker                                        │ │
│ │  Team          dev-team                                          │ │
│ │  Visibility    Public                                            │ │
│ │  Exec Mode     on_demand                                         │ │
│ │  Max Runtime   10m                                               │ │
│ │  Retry         1 attempt                                         │ │
│ │  Approval      Not required                                      │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│ ┌─ Context Files ─────────────────────────────────────────────────┐ │
│ │  Base:                                                           │ │
│ │    workers/public/dev-team/frontend-dev/                          │ │
│ │    knowledge/public/design-styles/                                │ │
│ │  Dynamic:                                                        │ │
│ │    {target_repo}/src/ (always)                                   │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│ ┌─ Verification Checks ──────────────────────────────────────────┐ │
│ │  ☑ typescript   npm run typecheck                               │ │
│ │  ☑ lint         npm run lint                                    │ │
│ │  ☑ test         npm test                                        │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│ ┌─ MCP Server ────────────────────────────────────────────────────┐ │
│ │  Status:  ○ Not running                                          │ │
│ │  Command: node dist/mcp-server.js                                │ │
│ │  Tools:   create_component, create_page, fix_ui_bug, add_form   │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│ ┌─ Instructions (collapsed by default) ───────────────────────────┐ │
│ │  ▸ Click to expand full worker instructions                      │ │
│ └─────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

**Configuration card**: Key-value pairs rendered in a two-column glass-inset table. Source: parsed from `worker.yaml` via enhanced `get_worker_detail` Rust command.

**Context Files card**: List of base and dynamic context paths. Clicking a path navigates to the file navigator (if implemented) or copies path.

**Verification Checks card**: Lists all `post_execute` checks with their commands. During active execution, these update live (check/x/spinner).

**MCP Server card**: Only shown if worker has `mcp` block. Shows tool list as badges. Phase 1: informational only. Phase 2: each tool could be expandable to show input schema.

**Instructions section**: Collapsible markdown renderer. Shows the full `instructions` field content. Uses existing markdown rendering patterns (or the markdown renderer from knowledge browser spec US-014).

### 2.4 Skills Tab

```
┌─────────────────────────────────────────────────────────────────────┐
│ Skills (4)                                                          │
│                                                                     │
│ ┌─ generate-code ─────────────────────────────────────────────────┐ │
│ │                                                                  │ │
│ │  Generate production-ready code from requirements                 │ │
│ │                                                                  │ │
│ │  Inputs:                                                         │ │
│ │    requirement (string, required) — What to build                │ │
│ │    target_file (path, optional) — Output file path               │ │
│ │                                                                  │ │
│ │  Output: code files                                              │ │
│ │  Mutating: yes ⚠                                                 │ │
│ │  Verification: typescript, lint, test                            │ │
│ │                                                                  │ │
│ │  ┌──────────────────────────────────────────────┐                │ │
│ │  │ requirement: [                              ] │  [▶ Run]      │ │
│ │  │ target_file: [                              ] │                │ │
│ │  └──────────────────────────────────────────────┘                │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│ ┌─ implement-feature ─────────────────────────────────────────────┐ │
│ │  ...                                                             │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│ ┌─ fix-bug ───────────────────────────────────────────────────────┐ │
│ │  ...                                                             │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│ ┌─ review-code ───────────────────────────────────────────────────┐ │
│ │  ...                                                             │ │
│ └─────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

Each skill card contains:

| Element | Source | Display |
|---------|--------|---------|
| Skill name | `skills[].id` or `skills[].name` | Card title, bold |
| Description | `skills[].description` or skill file header | Subtitle text |
| Input parameters | Skill file `interface.inputs` | Typed form fields |
| Output type | Skill file `interface.outputs` | Badge or label |
| Mutating flag | Skill file `mutating` | Warning icon if true |
| Verification | Skill file `verification` or worker-level | Check list |
| Run button | N/A | Primary action, triggers skill runner |
| Last run info | Latest thread for this worker+skill | "Last run: 2h ago, completed" |

**Skill card states:**
- Default: expandable, shows name + description + Run button
- Expanded: shows full interface (inputs, outputs, mutating, verification)
- Running: Run button disabled, replaced with "Running..." indicator linking to execution monitor
- Completed: brief green flash, then reverts to default

### 2.5 Activity Tab

```
┌─────────────────────────────────────────────────────────────────────┐
│ Activity (12)                                  [All ▾] [Last 7d ▾]  │
│                                                                     │
│ ┌─ Today ─────────────────────────────────────────────────────────┐ │
│ │  14:35  ✓ generate-code       "Built auth component"    3m 22s  │ │
│ │  11:20  ✓ implement-feature   "Added user profile page" 7m 45s  │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│ ┌─ Yesterday ─────────────────────────────────────────────────────┐ │
│ │  16:05  ✗ fix-bug             "TS error in api route"   2m 10s  │ │
│ │  15:30  ✓ review-code         "Reviewed PR #234"        4m 00s  │ │
│ │  09:15  ✓ generate-code       "Created dashboard..."    8m 33s  │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│ ┌─ Feb 9 ─────────────────────────────────────────────────────────┐ │
│ │  ...                                                             │ │
│ └─────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

**Activity entry columns:**

| Column | Source | Display |
|--------|--------|---------|
| Time | thread `started_at` | HH:mm format |
| Status icon | thread `worker.state` | Checkmark (completed), X (error), spinner (running) |
| Skill name | thread `worker.skill` | Monospace text |
| Summary | thread `conversation_summary` | Truncated to 40 chars, full on hover |
| Duration | `completed_at - started_at` | "Xm Ys" format |

**Filters:**
- Skill dropdown: filter to specific skill
- Time range: Last 24h, Last 7d, Last 30d, All

**Click behavior:** Opens `ThreadInspector` slide-in panel (existing component) with full thread details.

**Data source:** `workspace/threads/*.json` filtered by `worker.id === workerId`, sorted by `started_at` descending.

### 2.6 Learnings Tab

```
┌─────────────────────────────────────────────────────────────────────┐
│ Learnings (7)                                                       │
│                                                                     │
│ ┌─ Active Rules (from instructions) ──────────────────────────────┐ │
│ │                                                                  │ │
│ │  1. Always check worker.yaml nesting before parsing              │ │
│ │     Source: back-pressure-failure · Feb 10 · high                │ │
│ │                                                                  │ │
│ │  2. Use registry.yaml path field for worker location             │ │
│ │     Source: task-completion · Feb 9 · medium                     │ │
│ │                                                                  │ │
│ │  3. Prefer structured skills (Format A) for new dev-team workers │ │
│ │     Source: user-correction · Feb 8 · high                       │ │
│ │                                                                  │ │
│ │  4. Run typecheck before lint to catch import errors first       │ │
│ │     Source: back-pressure-failure · Feb 7 · medium               │ │
│ │                                                                  │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│ ┌─ Learning Event Timeline ───────────────────────────────────────┐ │
│ │                                                                  │ │
│ │  Feb 10 14:30  HIGH  back-pressure-failure                       │ │
│ │    Rule: "Always check worker.yaml nesting..."                   │ │
│ │    Task: US-007 (hq-desktop-epics)                               │ │
│ │    Injected to: workers/public/dev-team/architect/worker.yaml    │ │
│ │                                                                  │ │
│ │  Feb 9 11:00   MED   task-completion                             │ │
│ │    Rule: "Use registry.yaml path field..."                       │ │
│ │    Task: US-003 (hq-desktop-epics)                               │ │
│ │    Injected to: workers/public/dev-team/architect/worker.yaml    │ │
│ │                                                                  │ │
│ │  ...                                                             │ │
│ └─────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

**Two sections:**

1. **Active Rules**: Extracted from `worker.yaml` `instructions:` block, specifically the `## Learnings` subsection. These are the rules currently influencing the worker's behavior.

2. **Learning Event Timeline**: Chronological list from `workspace/learnings/*.json` filtered to events where `scope` matches this worker or `injected_to` contains this worker's path.

**Learning entry fields:**

| Field | Source | Display |
|-------|--------|---------|
| Timestamp | event `timestamp` | Date + time |
| Severity | event `severity` | HIGH (red), MED (yellow), LOW (white/40) badge |
| Source | event `source` | task-completion, back-pressure-failure, user-correction |
| Rule text | event `rule` | Full text, multi-line if needed |
| Task reference | event `task_id` + `project` | Clickable link to project/story |
| Injection target | event `injected_to` | File path, monospace |

### 2.7 Metrics Tab

```
┌─────────────────────────────────────────────────────────────────────┐
│ Metrics                                         [Last 30d ▾]       │
│                                                                     │
│ ┌─ Summary Cards ─────────────────────────────────────────────────┐ │
│ │  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐   │ │
│ │  │  Total     │ │  Success   │ │  Avg Time  │ │  BP Pass   │   │ │
│ │  │  Runs      │ │  Rate      │ │            │ │  Rate      │   │ │
│ │  │            │ │            │ │            │ │            │   │ │
│ │  │   47       │ │   91%      │ │   5m 23s   │ │   96%      │   │ │
│ │  └────────────┘ └────────────┘ └────────────┘ └────────────┘   │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│ ┌─ Skill Usage ───────────────────────────────────────────────────┐ │
│ │  generate-code      ████████████████████  22 runs               │ │
│ │  implement-feature  ████████████          12 runs               │ │
│ │  fix-bug            ████████              8 runs                │ │
│ │  review-code        █████                 5 runs                │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│ ┌─ Recent Errors ─────────────────────────────────────────────────┐ │
│ │  Feb 10  fix-bug        "TypeScript error in route handler"      │ │
│ │  Feb 7   generate-code  "Lint failure: unused import"            │ │
│ │  Feb 3   fix-bug        "Test timeout on integration test"       │ │
│ └─────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

**Summary cards:**

| Metric | Computation | Source |
|--------|------------|--------|
| Total Runs | Count of threads for this worker in period | `workspace/threads/*.json` |
| Success Rate | (completed / total) * 100 | Thread `worker.state` field |
| Avg Time | Mean of (completed_at - started_at) | Thread timestamps |
| BP Pass Rate | Back-pressure successes / total checks | Execution JSON `back_pressure` field |

**Skill Usage**: Horizontal bar chart showing run counts per skill. Data from thread `worker.skill` field.

**Recent Errors**: Last 5 threads where `worker.state === 'error'`. Shows date, skill, and error summary. Clickable to open thread inspector.

**Time range filter**: Last 7d, 30d, 90d, All. Affects all metrics on this tab.

**Data requirements**: All metrics are derivable from thread JSON files. No new Rust commands needed for Phase 1 — compute in frontend. Phase 2 could add a `get_worker_metrics` Rust command for performance.

---

## 3. Skill Runner

### 3.1 Interaction Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│  Step 1: PARAMETER COLLECTION                                       │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ Run: frontend-dev → generate-code                            │   │
│  │                                                               │   │
│  │ requirement*  [Build a responsive nav bar with glass...   ]  │   │
│  │ target_file   [src/components/nav-bar.tsx                 ]  │   │
│  │                                                               │   │
│  │                 ⚠ This skill modifies files                  │   │
│  │                                                               │   │
│  │               [Cancel]  [▶ Run Skill]                        │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  Step 2: CONFIRMATION (for mutating skills)                         │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ Confirm execution?                                            │   │
│  │                                                               │   │
│  │ Worker:  frontend-dev                                         │   │
│  │ Skill:   generate-code (mutating)                             │   │
│  │ Args:    requirement="Build a responsive nav bar..."          │   │
│  │ Est:     ~10 minutes                                          │   │
│  │                                                               │   │
│  │ This will:                                                    │   │
│  │  · Create/modify files in target repo                         │   │
│  │  · Run typecheck, lint, test after execution                  │   │
│  │  · Auto-checkpoint on completion                              │   │
│  │                                                               │   │
│  │               [Cancel]  [Confirm & Run]                       │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  Step 3: EXECUTION (see Execution Monitor, section 4)               │
│                                                                     │
│  Step 4: COMPLETION                                                 │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ ✓ generate-code completed                          3m 22s    │   │
│  │                                                               │   │
│  │ Summary: Built responsive nav bar with glass morphism,        │   │
│  │ mobile hamburger menu, and route highlighting.                │   │
│  │                                                               │   │
│  │ Files created:                                                │   │
│  │   + src/components/nav-bar.tsx                                │   │
│  │   + src/components/nav-bar.test.tsx                           │   │
│  │                                                               │   │
│  │ Back pressure: ☑ TS  ☑ Lint  ☑ Test                          │   │
│  │                                                               │   │
│  │  [View Thread]  [View Files]  [Run Again]                    │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.2 Parameter Input Types

Map skill `interface.inputs` types to form controls:

| Input Type | Control | Validation |
|-----------|---------|------------|
| `string` | Text input | Required/optional per schema |
| `number` | Number input with stepper | Min/max from schema |
| `boolean` | Toggle switch | Default from schema |
| `path` | Text input with file picker button | File exists check (via Rust) |
| `date` | Date picker | ISO format |
| `enum` | Dropdown select | Options from schema |
| `text` | Multi-line textarea | For longer inputs (descriptions, requirements) |

**Untyped skills** (no `interface.inputs` defined): Show single freeform text input labeled "Arguments" (current behavior, backward compatible).

### 3.3 Trigger Points

Skills can be triggered from multiple places in Desktop:

| Location | Trigger | Behavior |
|----------|---------|----------|
| Worker Detail > Skills tab | Run button on skill card | Opens parameter collection in-place |
| Command Palette | `/run {worker}:{skill}` | Opens parameter collection as modal |
| Project execution | Orchestrator auto-triggers | No parameter collection (args from orchestrator) |
| Worker card context menu | "Run skill..." submenu | Quick picker then parameter modal |

### 3.4 Skill Runner State Machine

```
    Idle
      │
      │ user clicks Run
      ▼
  Collecting  ──── user cancels ──► Idle
      │
      │ user submits (+ confirms if mutating)
      ▼
  Spawning  ──── spawn fails ──► Error
      │
      │ PTY created, command typed
      ▼
  Running  ──── see Execution Monitor
      │
      │ thread completion detected
      ▼
  Completed  ──── auto-dismiss (30s) or user action ──► Idle
```

### 3.5 Implementation Notes

- Enhance existing `useSkillRunner` hook to support typed parameters
- `runSkill(workerId, skillId, params: Record<string, unknown>)` — serialize params to CLI args
- The PTY command format remains `claude "/run {worker}:{skill} {serialized_args}"\n`
- Skill interface parsing requires new Rust command `get_skill_detail(workerPath, skillId)` that reads and parses the skill `.md` file's YAML frontmatter

---

## 4. Execution Monitor

### 4.1 Information Architecture

The execution monitor appears in two contexts:
1. **Inline** in the Worker Detail view's Status Card (summary)
2. **Expanded** as a slide-out panel or dedicated view (full detail)

### 4.2 Inline Execution Monitor (Status Card)

```
┌─────────────────────────────────────────────────────────────────────┐
│  ◉ Executing generate-code                                          │
│                                                                     │
│  ┌─ Progress ─────────────────────────────────────────────────┐    │
│  │  loading    ✓                                               │    │
│  │  planning   ✓                                               │    │
│  │  executing  ◉ ──── 3m 22s elapsed (max 10m) ────           │    │
│  │  verifying  ○                                               │    │
│  │  post_hook  ○                                               │    │
│  └────────────────────────────────────────────────────────────┘    │
│                                                                     │
│  [View Terminal]  [Expand]                                          │
└─────────────────────────────────────────────────────────────────────┘
```

### 4.3 Expanded Execution Monitor

```
┌─────────────────────────────────────────────────────────────────────┐
│ Execution Monitor: frontend-dev → generate-code                     │
│                                                                     │
│ ┌─ State Machine ─────────────────────────────────────────────────┐ │
│ │                                                                  │ │
│ │  idle ──► loading ──► planning ──► [executing] ──► verifying    │ │
│ │   ✓         ✓           ✓          ◉ (3:22)         ○          │ │
│ │                                                                  │ │
│ │  ──► post_hook ──► completed                                    │ │
│ │         ○              ○                                         │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│ ┌─ Terminal Output ───────────────────────────────────────────────┐ │
│ │  (embedded xterm.js showing PTY output, same as terminal panel) │ │
│ │  $ claude "/run frontend-dev:generate-code requirement='...'"   │ │
│ │  Loading worker config...                                        │ │
│ │  Reading context files (3 files)...                              │ │
│ │  Planning approach...                                            │ │
│ │  Generating code for responsive nav bar...                       │ │
│ │  ▌                                                               │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│ ┌─ Back Pressure Checks ─────────────────────────────────────────┐ │
│ │  (appears during verifying state)                                │ │
│ │                                                                  │ │
│ │  ☑ typescript   pass   (0.8s)                                   │ │
│ │  ☑ lint         pass   (1.2s)                                   │ │
│ │  ◉ test         running...                                      │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│ ┌─ Context Loaded ────────────────────────────────────────────────┐ │
│ │  workers/public/dev-team/frontend-dev/worker.yaml                │ │
│ │  workers/public/dev-team/frontend-dev/skills/generate-code.md    │ │
│ │  knowledge/public/design-styles/glass-morphism.md                │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│  [Cancel Execution]  [Open in Terminal]                              │
└─────────────────────────────────────────────────────────────────────┘
```

### 4.4 State Machine Visualization

A horizontal pipeline showing all states as nodes connected by arrows.

| Node State | Icon | Color | Animation |
|-----------|------|-------|-----------|
| Completed | Checkmark | Green/60 | None |
| Active | Filled dot | Blue glow | Pulse |
| Pending | Empty circle | White/20 | None |
| Error | X mark | Red/50 | Shake |
| Retry | Circular arrow | Yellow/50 | Spin |

**Transitions are animated** using CSS transitions: when a node changes state, it slides its color/icon with a 300ms ease-in-out.

### 4.5 Back Pressure Checks Display

During the `verifying` state, show each check as a line item:

| Check State | Display |
|------------|---------|
| Pending | `○ {check_name}  waiting...` (white/20) |
| Running | `◉ {check_name}  running...` (blue, pulse) |
| Pass | `☑ {check_name}  pass  ({duration})` (green) |
| Fail | `☒ {check_name}  FAIL` (red, with expandable error output) |

Failed checks expand to show stderr output in a monospace code block.

### 4.6 Error State with Recovery

```
┌─────────────────────────────────────────────────────────────────────┐
│  ✗ Error in verifying phase                                         │
│                                                                     │
│  Check failed: test                                                 │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ FAIL src/components/nav-bar.test.tsx                         │   │
│  │   ✗ renders mobile menu (12ms)                               │   │
│  │     Expected: <nav> to contain <button.hamburger>            │   │
│  │     Received: <nav> with no children                         │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  Retry attempt: 1 of 1                                              │
│                                                                     │
│  [Auto-Fix (codex-debugger)]  [Retry Manually]  [Abort]            │
└─────────────────────────────────────────────────────────────────────┘
```

### 4.7 Orchestrated Multi-Worker Execution

When triggered via `/execute-task` (multi-worker pipeline), the monitor shows all phases:

```
┌─────────────────────────────────────────────────────────────────────┐
│ Pipeline: US-042 — Build auth component                             │
│                                                                     │
│  Phase 1  product-planner    ✓ completed   (2m 10s)                │
│  Phase 2  frontend-dev       ◉ executing   (3m 22s / 10m)         │
│  Phase 3  code-reviewer      ○ pending                              │
│  Phase 4  dev-qa-tester      ○ pending                              │
│                                                                     │
│  Handoff 1→2: "Spec clarified: use glass-morphism tokens,          │
│  mobile-first, aria labels required. Focus on nav-bar.tsx."         │
│                                                                     │
│  [View Phase 1 Output]  [View Terminal]                             │
└─────────────────────────────────────────────────────────────────────┘
```

**Phase list**: vertical pipeline, each phase shows worker name, state icon, timing.

**Handoff context**: shown between completed and active phases. Collapsed by default, expandable. Shows `context_for_next` from previous worker's output.

### 4.8 Real-Time State Detection

**Current mechanism**: File watcher on `workspace/threads/` detects new thread JSON files. Desktop re-fetches empire data on `threads-changed` event.

**Enhanced mechanism for execution monitor**:

| Signal | Source | Detection Method |
|--------|--------|------------------|
| Execution started | PTY spawn + command write | `useSkillRunner` sets session to "running" |
| State transitions | Worker writes state to thread | Enhanced thread watcher with debounce |
| Back pressure results | Verification output in thread | Parse thread JSON `back_pressure` field |
| Completion | Thread JSON with `state: completed` | Thread watcher event |
| Error | Thread JSON with `state: error` | Thread watcher event |

**Polling fallback**: If file watcher misses events, poll execution state file every 5 seconds during active execution. Configurable interval.

**Phase 2 enhancement**: Watch PTY output for state keywords ("Loading context", "Executing", "Running typecheck") to provide more granular state updates before thread is written.

---

## 5. Learning Viewer (Global View)

In addition to the per-worker Learnings tab (section 2.6), there should be a global learning viewer accessible from the top-level navigation.

### 5.1 Information Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│ Learnings                                          147 total rules  │
│                                                                     │
│ ┌─ Filters ───────────────────────────────────────────────────────┐ │
│ │ [All Scopes ▾] [All Severity ▾] [All Sources ▾] [Search...   ] │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│ ┌─ Summary ───────────────────────────────────────────────────────┐ │
│ │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐          │ │
│ │  │  Worker   │ │  Command │ │  Global  │ │Knowledge │          │ │
│ │  │  Rules    │ │  Rules   │ │  Rules   │ │  Rules   │          │ │
│ │  │    82     │ │    31    │ │    18    │ │    16    │          │ │
│ │  └──────────┘ └──────────┘ └──────────┘ └──────────┘          │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│ ┌─ Timeline ──────────────────────────────────────────────────────┐ │
│ │                                                                  │ │
│ │  Feb 11                                                          │ │
│ │  ┌──────────────────────────────────────────────────────────┐   │ │
│ │  │ 14:30  HIGH  worker:architect                             │   │ │
│ │  │ "Always check worker.yaml nesting before parsing"         │   │ │
│ │  │ → workers/public/dev-team/architect/worker.yaml           │   │ │
│ │  │ Task: US-007 (hq-desktop-epics)                           │   │ │
│ │  └──────────────────────────────────────────────────────────┘   │ │
│ │                                                                  │ │
│ │  ┌──────────────────────────────────────────────────────────┐   │ │
│ │  │ 11:00  MED   global                                       │   │ │
│ │  │ "{repo}-deploy-audit: 7 stories at projects/..."             │   │ │
│ │  │ → CLAUDE.md ## Learned Rules                              │   │ │
│ │  │ Task: auto-learn                                          │   │ │
│ │  └──────────────────────────────────────────────────────────┘   │ │
│ │                                                                  │ │
│ │  Feb 10                                                          │ │
│ │  ...                                                             │ │
│ └─────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

### 5.2 Filters

| Filter | Options |
|--------|---------|
| Scope | All, worker:{id} (per worker), command:{name}, global, knowledge:{topic} |
| Severity | All, High, Medium, Low |
| Source | All, task-completion, back-pressure-failure, user-correction, auto-learn |
| Search | Free text across rule text |

### 5.3 Learning Entry Card

Each learning event renders as a card with:

| Element | Position | Style |
|---------|----------|-------|
| Timestamp | Top-left | white/40, small |
| Severity badge | Top-left, after timestamp | HIGH=red, MED=yellow, LOW=white/30 |
| Scope badge | Top-right | Glass chip style |
| Rule text | Body | white/70, mono font |
| Injection target | Below rule | white/30, mono, with file icon |
| Task reference | Below target | Clickable link, white/40 |

### 5.4 Data Requirements

| Requirement | Source | Status |
|-------------|--------|--------|
| List all learning events | `workspace/learnings/*.json` | Need new `list_learnings` Rust command |
| Filter by scope/severity | Parse event JSON fields | Frontend filtering (or Rust-side for performance) |
| Extract active rules per worker | Parse `instructions:` `## Learnings` section | Need `get_worker_learnings` Rust command |
| Extract global rules | Parse `CLAUDE.md` `## Learned Rules` | Need `get_global_learnings` Rust command |

---

## 6. Interaction Patterns

### 6.1 Navigation Flow

```
Empire View (grid/graph)
    │
    ├── Click worker node ──► Workers Drill (list)
    │                              │
    │                              └── Click worker card ──► Worker Detail
    │                                       │
    │                                       ├── Skills tab > Run ──► Skill Runner
    │                                       │                             │
    │                                       │                             └── Execution Monitor
    │                                       │
    │                                       ├── Activity tab > Click ──► Thread Inspector
    │                                       │
    │                                       ├── Learnings tab
    │                                       │
    │                                       └── Metrics tab
    │
    └── Command Palette
            │
            ├── /run {worker}:{skill} ──► Skill Runner (modal)
            │
            └── /workers ──► Workers Drill
```

### 6.2 Keyboard Shortcuts

| Shortcut | Action | Context |
|----------|--------|---------|
| `Cmd+K` | Open command palette | Global |
| `Escape` | Back / Close panel | Worker detail, modals |
| `Tab` | Cycle through skill input fields | Skill runner |
| `Cmd+Enter` | Submit / Run skill | Skill runner when focused |
| `1-5` | Switch tabs | Worker detail view |

### 6.3 Toast Notifications

| Event | Toast Content | Duration | Type |
|-------|--------------|----------|------|
| Skill started | "{worker}: {skill} started" | 3s | info |
| Skill completed | "{worker}: {skill} completed" | 5s, clickable | success |
| Skill failed | "{worker}: {skill} failed — {error}" | persistent | error |
| Back pressure pass | "All checks passed" | 3s | success |
| Back pressure fail | "{check} failed" | persistent, clickable | warning |
| Learning captured | "New rule learned for {scope}" | 5s | info |

### 6.4 Empty States

| View | Empty State Message | Action |
|------|--------------------|--------|
| Workers Drill (no workers) | "No workers found. Workers are defined in workers/registry.yaml." | Link to docs |
| Workers Drill (filtered, no results) | "No workers match your filters." | "Clear filters" button |
| Worker Detail > Skills (no skills) | "This worker has no defined skills." | None |
| Worker Detail > Activity (no threads) | "No execution history yet. Run a skill to get started." | "Run a skill" link → Skills tab |
| Worker Detail > Learnings (no learnings) | "No learnings captured yet. Learnings accumulate as this worker runs tasks." | None |
| Worker Detail > Metrics (no data) | "Not enough data for metrics. Run at least 3 skills." | None |

---

## 7. Component Mapping

### 7.1 New Components to Create

| Component | File | Purpose |
|-----------|------|---------|
| `WorkerFilterBar` | `components/empire/worker-filter-bar.tsx` | Filter/search bar for worker list |
| `WorkerDetailTabs` | `components/empire/worker-detail-tabs.tsx` | Tab container for detail view |
| `WorkerOverviewTab` | `components/empire/worker-overview-tab.tsx` | Configuration and context display |
| `WorkerSkillsTab` | `components/empire/worker-skills-tab.tsx` | Skill list with run capability |
| `WorkerActivityTab` | `components/empire/worker-activity-tab.tsx` | Thread history for this worker |
| `WorkerLearningsTab` | `components/empire/worker-learnings-tab.tsx` | Learning rules and event timeline |
| `WorkerMetricsTab` | `components/empire/worker-metrics-tab.tsx` | Performance metrics dashboard |
| `SkillCard` | `components/empire/skill-card.tsx` | Individual skill with params and run |
| `SkillRunner` | `components/empire/skill-runner.tsx` | Parameter collection + confirmation flow |
| `ExecutionMonitor` | `components/empire/execution-monitor.tsx` | Real-time state machine + checks |
| `ExecutionPipeline` | `components/empire/execution-pipeline.tsx` | Multi-worker orchestrated pipeline view |
| `BackPressureChecks` | `components/empire/back-pressure-checks.tsx` | Live verification check list |
| `LearningTimeline` | `components/empire/learning-timeline.tsx` | Chronological learning events |
| `LearningRuleList` | `components/empire/learning-rule-list.tsx` | Active rules from worker instructions |
| `MetricsSummary` | `components/empire/metrics-summary.tsx` | Summary stat cards |
| `SkillUsageChart` | `components/empire/skill-usage-chart.tsx` | Horizontal bar chart of skill runs |
| `GlobalLearningsView` | `components/empire/global-learnings-view.tsx` | Top-level learning browser |

### 7.2 Existing Components to Modify

| Component | File | Changes |
|-----------|------|---------|
| `WorkersDrill` | `workers-drill.tsx` | Add filter bar, grouping options, enhanced cards |
| `WorkerDetail` | `worker-detail.tsx` | Replace single-scroll with tabbed layout |
| `useWorkerDetail` | `use-empire-data.ts` | Parse new fields (execution, MCP, instructions, learnings) |
| `useSkillRunner` | `use-skill-runner.ts` | Support typed params, confirmation flow, state machine |
| `EmpireView` | `empire-view.tsx` | Add route for global learnings view |
| `StatsHeader` | `stats-header.tsx` | Add learnings count badge |

### 7.3 New Hooks to Create

| Hook | File | Purpose |
|------|------|---------|
| `useWorkerFilters` | `hooks/use-worker-filters.ts` | Filter state management (type, company, status, search) |
| `useWorkerMetrics` | `hooks/use-worker-metrics.ts` | Compute metrics from thread data for a worker |
| `useWorkerLearnings` | `hooks/use-worker-learnings.ts` | Fetch learning events + active rules |
| `useExecutionMonitor` | `hooks/use-execution-monitor.ts` | Track real-time execution state with polling fallback |
| `useSkillDetail` | `hooks/use-skill-detail.ts` | Load and parse skill file for parameter input |
| `useGlobalLearnings` | `hooks/use-global-learnings.ts` | Fetch all learning events across workers |

### 7.4 New Rust Commands Needed

| Command | Signature | Returns |
|---------|-----------|---------|
| `get_skill_detail` | `(hq_path, worker_path, skill_id)` | Parsed skill file: interface, inputs, outputs, mutating, verification |
| `list_learnings` | `(hq_path, filter?)` | Array of learning event objects from `workspace/learnings/` |
| `get_worker_learnings` | `(hq_path, worker_path)` | Active rules extracted from instructions `## Learnings` section |
| `get_execution_state` | `(hq_path, project, task_id)` | Execution tracking file from `workspace/orchestrator/` |

---

## 8. Design Alignment

### 8.1 Glass Morphism Tokens

All new components use the established design tokens from the UI audit (US-005):

| Component Type | Background | Border | Blur |
|---------------|-----------|--------|------|
| Filter bar | `.glass-inset` | `--glass-border` | 12px |
| Tab buttons | `.glass-button` | `--glass-border-light` | 16px |
| Active tab | `.glass-button` + `oklch(1 0 0 / 0.08)` | `--glass-border-strong` | 16px |
| Skill cards | `.glass-panel-light` | `--glass-border-light` | 24px |
| Metric cards | `.glass-panel` | `--glass-border` | 32px |
| Execution monitor | `.glass-panel` | `--glass-border-strong` | 32px |
| Learning entries | `bg-white/[0.02]` | `border-white/[0.04]` | None |

### 8.2 Color Usage

| Purpose | Color Source | Example |
|---------|-------------|---------|
| Worker type badge | `getWorkerColor(type)` (existing) | CodeWorker = cyan, OpsWorker = amber |
| State indicators | State table from US-007 section 2.2 | executing = green, verifying = yellow |
| Severity badges | Custom | HIGH = `bg-red-500/20 text-red-400`, MED = `bg-yellow-500/20 text-yellow-400`, LOW = `bg-white/10 text-white/40` |
| Back pressure pass | `bg-green-500/10 text-green-400` | Matches existing thread state colors |
| Back pressure fail | `bg-red-500/10 text-red-400` | Matches existing error colors |

### 8.3 Typography

| Element | Font | Size | Weight | Color |
|---------|------|------|--------|-------|
| Section headers | Geist Mono | xs (12px) | medium (500) | white/50 |
| Card titles | Geist Mono | sm (14px) | medium (500) | white/80 |
| Card subtitles | Geist Mono | xs (12px) | normal (400) | white/40 |
| Metric values | Geist Mono | 2xl (24px) | bold (700) | white/90 |
| Metric labels | Geist Mono | xs (12px) | normal (400) | white/40 |
| Code/paths | Geist Mono | xs (12px) | normal (400) | white/50 |
| Body text | Geist Mono | sm (14px) | normal (400) | white/60 |

### 8.4 Spacing

Follow existing patterns from empire components:
- Section gap: `space-y-6` (24px)
- Card internal padding: `p-4` (16px)
- Card gap in grid: `gap-3` (12px)
- Label-to-content: `mt-1` (4px)
- Icon-to-text: `gap-2` (8px)

### 8.5 Animations

| Animation | Trigger | CSS |
|-----------|---------|-----|
| State dot pulse | Worker executing | `animate-pulse-working` (existing, 1.5s) |
| State transition | Node state change | `transition-all duration-300 ease-in-out` |
| Tab switch | Click tab | Content fade: `opacity 0→1, 150ms` |
| Skill card expand | Click expand | `max-height transition, 200ms ease` |
| Metric counter | Tab becomes visible | Count-up animation over 500ms |
| Check appear | Verification starts | Slide in from right, 200ms |
| Toast enter | Event fires | Slide in from top-right, 300ms |
| Toast exit | Auto-dismiss | Fade out + slide up, 200ms |

---

## 9. Responsive Behavior

### 9.1 Worker List Grid

| Breakpoint | Columns | Card Size |
|-----------|---------|-----------|
| < 640px (sm) | 1 column | Full width |
| 640-767px (md) | 2 columns | `GlassCard size="sm"` |
| 768-1023px (lg) | 3 columns | `GlassCard size="sm"` |
| 1024px+ (xl) | 4 columns | `GlassCard size="sm"` |

### 9.2 Worker Detail Tabs

| Breakpoint | Tab Layout | Content Layout |
|-----------|-----------|----------------|
| < 640px | Horizontal scroll tabs | Single column, stacked |
| 640px+ | All tabs visible | Two-column where applicable (Overview config + context side by side) |

### 9.3 Execution Monitor

| Breakpoint | Layout |
|-----------|--------|
| < 768px | State pipeline wraps to 2 rows; terminal below |
| 768px+ | State pipeline single row; terminal beside or below based on panel width |

---

## 10. Accessibility

| Element | Requirement |
|---------|-------------|
| Filter dropdowns | `role="listbox"`, keyboard navigable, `aria-label` |
| Tab navigation | `role="tablist"` + `role="tab"` + `role="tabpanel"`, arrow key navigation |
| State indicators | Color + icon (never color alone), `aria-label` for screen readers |
| Skill Run button | `aria-label="Run {skill} on {worker}"`, disabled state announced |
| Back pressure checks | Live region (`aria-live="polite"`) for check results |
| Toast notifications | `role="alert"` for errors, `role="status"` for info |
| Time displays | `<time>` element with ISO `datetime` attribute |
| Empty states | Descriptive text, not just blank space |

---

## 11. Summary

This spec covers five major view areas for worker management in HQ Desktop:

| View | Current State | Target State |
|------|--------------|--------------|
| Worker List | Basic grid, team grouping only | Filterable, multi-group, enhanced cards with skill count and last active |
| Worker Detail | Single scroll with skills + threads | Tabbed view: Overview, Skills, Activity, Learnings, Metrics |
| Skill Runner | Basic text input + Run button | Typed parameters, confirmation for mutating, execution feedback |
| Execution Monitor | No dedicated view; PTY output only | Real-time state machine, back-pressure checklist, pipeline view |
| Learning Viewer | Does not exist | Per-worker rules tab + global learning timeline |

**New components:** 17. **Modified components:** 6. **New hooks:** 6. **New Rust commands:** 4.

All components follow the established glass-morphism design language, Geist Mono typography, and existing animation patterns documented in the UI Component Audit (US-005).
