---
company: cortex
created_at: "2026-03-10T22:30:00Z"
status: exploring
promoted_to: companies/cortex/projects/cortex-app/prd.json
source_idea_id: null
---

# Cortex — Autonomous Goal-Directed Agent

> A desktop agent that pursues a single goal (grow revenue/MRR) with full autonomy, KPI tracking, and an unrestricted action space — powered by Claude.

## Context

Cortex is the first product under the cortex company. The idea: give an AI agent one goal and let it figure out how to achieve it. The user sets a measurable target (e.g., "Grow MRR to $10K/mo by June"), defines KPIs, and the agent autonomously plans and executes actions — content, code, API calls, video creation, anything. Human reviews async via an activity feed.

A PRD already exists (`cortex-app/prd.json`) with 9 stories targeting a Tauri + Rust + React stack. This brainstorm evaluates whether that's the right approach vs alternatives, before committing engineering time.

## What We Know

- Company "cortex" is scaffolded — knowledge repo, qmd collection, manifest entry exist
- No repo exists yet (`repos/private/cortex-app` not created) — we're pre-execution
- HQ already has desktop-Claude integration knowledge and worker system mapping docs
- HQ workers framework provides autonomous task execution with skills, knowledge, and learned rules
- Claude Agent SDK exists — provides agent loop, tool_use, multi-turn reasoning out of the box
- Tauri v2 is known tech in this HQ (prior experience with deep links, builds, credential storage)
- The "unrestricted action space" requirement means the agent needs system-level access (shell, files, HTTP, potentially browser)

## What We Don't Know

- How will the agent measure the impact of its own actions on revenue? Manual KPI input creates a feedback gap — the agent acts, but doesn't see results until the human enters data
- What's the right cycle interval? Too frequent = wasted API spend, too infrequent = missed opportunities
- How do you sandbox an agent with "unrestricted" action space without it doing something harmful?
- Is a desktop app the right form factor, or would a headless agent with web dashboard be more practical?
- How much of this overlaps with what Claude Code / HQ workers already do?
- What's the cost ceiling? Opus API calls in an autonomous loop add up fast

## Approaches

### Option A: Custom Tauri App (Full Stack from Scratch)

**How it works:** Build a complete Tauri v2 desktop app. Rust backend handles the agent loop, Claude API calls, action execution, and local SQLite storage. React frontend provides goal setup, KPI dashboard, and activity feed. Every component is custom — the agent brain, action framework, sandboxing, scheduler.

**Tradeoffs:**
- Pro: Total control over UX, agent behavior, and data flow — desktop-native feel
- Pro: Offline-capable, fast, no server dependency beyond Claude API
- Con: Massive scope (9 stories, XL effort) — building an agent framework from scratch in Rust is uncharted territory
- Con: Rust + Claude API has no official SDK — raw HTTP with reqwest, manual tool_use parsing
- Con: Every agent capability (shell exec, file write, HTTP, content gen) must be hand-built as Rust actions

**Effort:** XL (month+)
**When to choose this:** You want cortex to be a polished, shippable product from day one and you're willing to invest significant time in the foundation.

---

### Option B: Claude Agent SDK + Tauri Shell

**How it works:** Use the Claude Agent SDK (TypeScript/Python) as the agent brain. The SDK handles tool_use orchestration, multi-turn reasoning, context management, and the core agent loop. Define cortex's tools (shell, file, HTTP, KPI read) as SDK tool definitions. Wrap the agent process in a lightweight Tauri app that provides the UI (goal config, KPI dashboard, activity feed) and communicates with the agent via IPC or local API. The agent runs as a sidecar process.

**Tradeoffs:**
- Pro: Agent loop, tool execution, and context management are solved problems — SDK handles them
- Pro: TypeScript/Python tools are faster to write than Rust action traits
- Pro: Can leverage existing Claude patterns (tool_use, extended thinking) without reinventing
- Con: Sidecar architecture adds complexity (Tauri ↔ agent process communication)
- Con: Dependent on SDK capabilities and update cycle
- Con: Two runtimes (Rust + Node/Python) increases bundle size and build complexity

**Effort:** L (week-month)
**When to choose this:** You want the autonomous agent working quickly and are comfortable with the agent brain being a TypeScript/Python process managed by Tauri.

---

### Option C: HQ Worker + Scheduled Tasks (No New App)

**How it works:** Build cortex as an HQ worker (`/newworker cortex-agent`) with skills: `plan-cycle`, `execute-actions`, `report-kpis`. Use HQ scheduled tasks for the autonomous loop. KPI data stored in `companies/cortex/data/kpis.json`. Dashboard is a generated HTML report (like `/dashboard`). The agent uses Claude Code itself as the execution engine — it can already write code, run commands, browse the web, create content. Goal and KPI config live in `companies/cortex/settings/goal.json`.

**Tradeoffs:**
- Pro: Zero new infrastructure — reuses HQ workers, knowledge, search, scheduled tasks
- Pro: Fastest path to a working autonomous agent (days, not weeks)
- Pro: The agent gets HQ's full capability set for free (file ops, git, qmd search, browser via agent-browser)
- Con: No desktop app — interaction is through Claude Code sessions and HTML reports
- Con: Less "product" feel, more "personal automation" feel
- Con: Scheduled tasks run in Claude Code sessions which have context limits and cost per session

**Effort:** M (days-week)
**When to choose this:** You want to validate the core concept (goal-directed autonomous agent) before investing in a desktop app. Ship the brain first, wrap it in a UI later.

---

## Recommendation

**Preferred approach:** Option C (HQ Worker) → then Option B (Agent SDK + Tauri)

**Reasoning:** The interesting part of cortex isn't the desktop app — it's the autonomous goal-directed loop. Option C lets you build and validate that loop in days using HQ infrastructure you already have. Once the agent is autonomously pursuing goals and you can see what works, graduate to Option B for a real desktop experience. Skipping straight to Option A means spending a month building Rust plumbing before the agent ever takes its first autonomous action.

**Two-phase path:**
1. **Phase 1 (Option C):** Build cortex-agent as an HQ worker. Prove the loop works — agent plans, acts, measures, adapts. Ship in days
2. **Phase 2 (Option B):** Once the agent logic is proven, wrap it in a Tauri app using Claude Agent SDK. The worker's skills become the SDK's tools. KPI dashboard becomes a real UI

**Key condition:** If the primary goal is a shippable product (not validation), go directly to Option B. If you're exploring whether goal-directed autonomy even works at all, start with Option C.

**Biggest risk:** The feedback loop. With manual KPI input, the agent can't measure its own impact in real-time. It takes actions blindly until the human enters new numbers. Phase 1 (Option C) will surface this problem cheaply before you've built a whole app around it.

## Next Steps

- [ ] Decide: validate with HQ worker first (Option C) or build product directly (Option B)?
- [ ] If Option C: run `/newworker cortex-agent` to scaffold the worker
- [ ] If Option B: research Claude Agent SDK capabilities and sidecar architecture for Tauri
- [ ] Define the initial tool set — what actions can the agent take on day one?
- [ ] Design the KPI feedback mechanism — how does the agent learn what worked?
- [ ] Set a cost budget for Claude API usage per day/month

**Promotion path:**
- Ready to build → `/prd cortex {slug}` (brainstorm.md pre-populates the interview)
- Needs more research → edit this file, revisit later
- Not worth pursuing → park as idea on the board
