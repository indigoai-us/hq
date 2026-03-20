---
title: "Gas Town Federation and Remote Worker Architecture"
category: gas-town-architecture
tags: ["gas-town", "distributed-systems", "federation", "runtime-isolation", "coordination"]
source: "https://steve-yegge.medium.com/welcome-to-gas-town-4f25ee16dd04, https://github.com/steveyegge/gastown/issues/1382, https://steve-yegge.medium.com/welcome-to-the-wasteland-a-thousand-gas-towns-a5eb9bc8dc1f, https://gastownhall.ai/"
confidence: 0.72
created_at: "2026-03-20T08:00:00Z"
updated_at: "2026-03-20T08:00:00Z"
---

Gas Town has two distinct federation layers: within-instance remote polecats (cloud workers) and cross-instance federation via The Wasteland.

## Current State: Local-Only

As of early 2026, Gas Town is entirely tmux-centric. All agents — polecats, Refinery, Witness, Deacon, Dogs — run in named tmux sessions on a single machine. The infrastructure (`~/.gt/`, Dolt server, bare git repos, Beads DB) is centralized on the local filesystem. Remote workers on hyperscalers were explicitly called out by Yegge as "coming soon" but unimplemented at launch.

## Layer 1: Remote Polecats on Hyperscalers (Intra-Town)

The core architectural blocker is the tmux lifecycle dependency. Polecat sessions must:
- Stay alive in an interactive tmux pane
- Run `gt hook` on startup
- Operate within gastown's session lifecycle

One-shot CLI invocations (`claude -p`) fail because gastown expects persistent pane presence. GitHub issue [#1382](https://github.com/steveyegge/gastown/issues/1382) proposes a `--headless` / `"mode": "headless"` flag as the prerequisite for cloud deployment.

**Proposed headless polecat model:**
- Agent runs as a one-shot process, not a tmux session
- Bead content injected as prompt args or stdin
- stdout/stderr becomes polecat output
- Auto-completion on process exit — no `gt hook` ceremony
- Labeled **priority/p3** (backlog) as of early 2026

Once headless mode lands, cloud polecats could be spawned by the Deacon/Witness on EC2, GCE, or similar, check out a remote worktree over git, and return their MR via Beads — all without a local tmux session.

**Security motivation:** Headless mode also enables hard enforcement of sandboxing (e.g., `--allowedTools`, `--sandbox read-only`) for review-role polecats, replacing soft prompt-level instructions.

## Layer 2: Cross-Town Federation — The Wasteland

In March 2026, Yegge published [The Wasteland](https://steve-yegge.medium.com/welcome-to-the-wasteland-a-thousand-gas-towns-a5eb9bc8dc1f), which describes inter-town federation:

- **Shared Wanted Board**: A distributed board of work items where any Gas Town instance can claim tasks posted by others.
- **Sovereign Dolt databases**: Each Wasteland is an independent SQL/git database with a shared schema — not a centralized server. Wastelands federate, not consolidate.
- **Portable rig identities**: A rig (Gas Town instance) has a persistent identity usable across any Wasteland it joins.
- **Trust tiers**: New rigs start as *registered participants* (level 1), earning stamps that promote them to *contributor* (level 2) then *maintainer* (level 3). Maintainers validate others' work.
- **Dolt as backbone**: Dolt's git semantics (branch, merge, PR on structured data) enable distributed collaboration without a central coordinator.

Anyone can create a Wasteland — a team, company, university, or open source project each gets a sovereign instance with the same schema.

## Summary: Two Federation Planes

| Plane | Scope | Mechanism | Status |
|-------|-------|-----------|--------|
| Remote polecats | Single Gas Town, cloud workers | Headless mode (planned p3) | Backlog |
| Wasteland federation | Multiple Gas Town instances | Dolt-backed trust network | Live (Mar 2026) |

The intra-town remote worker design is a prerequisite for true hyperscaler scale-out; the inter-town Wasteland model is already operational for cross-organization collaboration.
