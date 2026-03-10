# cortex-app

**Goal:** Build an autonomous desktop agent that pursues a single goal (revenue/MRR growth) with KPI tracking, Claude-powered reasoning, and an unrestricted action space
**Success:** Agent can run autonomously for 24 hours — completing multiple plan/act/measure cycles, taking real actions, and showing KPI trend data on the dashboard
**Repo:** repos/private/cortex-app
**Branch:** feature/cortex-app

## Overview

Cortex is a Tauri desktop app that embodies a single idea: give an AI agent one goal and let it figure out how to achieve it. The user sets a goal (e.g., "Grow MRR to $10K/mo by June"), defines KPIs to track progress, and the agent autonomously plans and executes actions to move the numbers. The agent's action space is unrestricted — it can write content, make API calls, create files, run commands, or anything else it determines will impact the goal. The human reviews async via an activity feed.

## Quality Gates
- `cargo test`
- `pnpm test`
- `pnpm lint`

## User Stories

### US-001: Scaffold Tauri + React app with dev tooling
**Description:** As a developer, I want a working Tauri app shell with React frontend so that I have a foundation to build on
**Priority:** 1
**Depends on:** None

**Acceptance Criteria:**
- [ ] Tauri app launches a window with React frontend rendering
- [ ] Rust backend compiles with cargo check
- [ ] Frontend builds with pnpm build
- [ ] Hot reload works in dev mode (pnpm tauri dev)
- [ ] Project structure follows Tauri v2 conventions
- [ ] TypeScript configured with strict mode
- [ ] Tailwind CSS installed and working

**E2E Tests:**
- [ ] App window opens without crash
- [ ] React root renders a placeholder screen

---

### US-002: Goal configuration — set a single goal with target and deadline
**Description:** As a user, I want to define one goal so the agent knows exactly what to optimize for
**Priority:** 1
**Depends on:** US-001

**Acceptance Criteria:**
- [ ] Goal setup screen with fields: goal name, target metric value, current value, deadline
- [ ] Goal persists to local storage
- [ ] Only one active goal at a time
- [ ] Goal displays prominently on the main dashboard
- [ ] Validation: target must be numeric, deadline must be future date

**E2E Tests:**
- [ ] User can create a goal and see it on the dashboard
- [ ] Goal persists after app restart

---

### US-003: KPI definition and manual data input
**Description:** As a user, I want to define KPIs and manually enter data points so the agent can measure its impact
**Priority:** 1
**Depends on:** US-002

**Acceptance Criteria:**
- [ ] User can add multiple KPIs
- [ ] Each KPI has: name, unit, current value, target value, direction
- [ ] Manual data entry form with auto-timestamp
- [ ] Data points stored locally with full history
- [ ] KPI list shows current value, trend arrow, % to target

**E2E Tests:**
- [ ] User can add a KPI and enter a data point
- [ ] KPI list displays correct trend direction

---

### US-004: KPI dashboard with trend visualization
**Description:** As a user, I want a dashboard showing goal progress and KPI trends so I can see if the agent is working
**Priority:** 2
**Depends on:** US-003

**Acceptance Criteria:**
- [ ] Main dashboard with progress bar, time remaining, projected completion
- [ ] Sparkline charts for each KPI (last 30 data points)
- [ ] Color coding: green/yellow/red based on progress
- [ ] Overall goal health score
- [ ] Auto-refreshes on new data

**E2E Tests:**
- [ ] Dashboard renders with goal and KPI data
- [ ] Charts display data points correctly
- [ ] Color coding matches KPI status

---

### US-005: Claude API agent brain with goal-directed reasoning
**Description:** As the system, I want a Claude API integration that reasons about the goal and available actions
**Priority:** 1
**Depends on:** US-001

**Acceptance Criteria:**
- [ ] Rust backend makes Claude API calls
- [ ] System prompt includes goal, KPI snapshot, action history
- [ ] Agent reasons about highest-impact actions
- [ ] Conversation history maintained per session
- [ ] API key stored securely in Tauri credential store
- [ ] Error handling for rate limits, network failures

**E2E Tests:**
- [ ] Agent brain returns structured action plan given goal context
- [ ] API key validation works on setup

---

### US-006: Autonomous action loop — plan, act, measure cycle
**Description:** As the agent, I want to run an autonomous loop that continuously pursues the goal
**Priority:** 1
**Depends on:** US-005

**Acceptance Criteria:**
- [ ] Loop runs on configurable interval (default: 4 hours)
- [ ] Each cycle: read goal → review history → plan → execute → log
- [ ] Background execution via Rust async
- [ ] Pause/resume controls in UI
- [ ] Action log entry per cycle
- [ ] Daily action budget (configurable)

**E2E Tests:**
- [ ] Agent loop completes one full cycle
- [ ] Pause/resume controls work
- [ ] Action log captures cycle details

---

### US-007: Action framework — extensible system for agent execution
**Description:** As the agent, I want an extensible action framework to execute diverse actions
**Priority:** 2
**Depends on:** US-005

**Acceptance Criteria:**
- [ ] Action trait: name, description, execute(), validate_result()
- [ ] Built-in actions: shell_command, write_file, http_request, create_content
- [ ] Agent selects actions via Claude tool_use
- [ ] Results feed back into agent context
- [ ] Sandboxing with user-approved permissions
- [ ] Plugin-style action registry

**E2E Tests:**
- [ ] Agent can execute write_file and verify output
- [ ] Action registry lists all available actions
- [ ] Sandboxing prevents unauthorized access

---

### US-008: Activity feed and cycle reporting
**Description:** As a user, I want to see what the agent has been doing so I can review its work async
**Priority:** 2
**Depends on:** US-006

**Acceptance Criteria:**
- [ ] Chronological activity feed of agent cycles
- [ ] Each entry: timestamp, reasoning, actions, results, KPI impact
- [ ] Expandable detail view for full reasoning chain
- [ ] Filters: action type, time range, success/failure
- [ ] Notification badge for new cycles

**E2E Tests:**
- [ ] Activity feed displays completed cycles
- [ ] Filters narrow results correctly
- [ ] Detail view shows full reasoning chain

---

### US-009: E2E test infrastructure for Tauri app
**Description:** As a developer, I want E2E testing infrastructure to verify the full app works
**Priority:** 2
**Depends on:** US-004

**Acceptance Criteria:**
- [ ] Tauri E2E test harness configured
- [ ] Smoke test: launch → set goal → enter KPI → verify dashboard
- [ ] CI-compatible headless tests
- [ ] Test fixtures for goal and KPI data
- [ ] cargo test + pnpm test both pass

**E2E Tests:**
- [ ] E2E smoke test passes full flow

## Non-Goals
- Automatic data integrations (Stripe, analytics) — MVP is manual input only
- Multi-goal support — one goal at a time, by design
- Team/collaboration features — single-user desktop app
- Mobile app — desktop only for now
- HQ integration — standalone for MVP

## Technical Considerations
- Tauri v2 with Rust backend + React/TypeScript frontend
- Claude API via HTTP from Rust (reqwest + serde)
- Local storage via SQLite (rusqlite) for goals, KPIs, action logs
- Agent loop as Rust async task using tauri::async_runtime::spawn (NOT tokio::spawn directly)
- Action sandboxing via Tauri's permission system + user-approved scopes
- Lightweight charting (recharts or visx)

## Open Questions
- Should the agent have internet access by default, or require explicit permission per domain?
- How to handle long-running actions that span multiple cycles?
- Should there be a "cost budget" for Claude API calls per day?
- What's the right default cycle interval? (4 hours proposed)
