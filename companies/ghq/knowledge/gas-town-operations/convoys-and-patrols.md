---
title: "Convoys, Patrols, and Swarms"
category: gas-town-operations
tags: ["gas-town", "agent-orchestration", "task-management", "coordination", "production-patterns"]
source: "https://steve-yegge.medium.com/welcome-to-gas-town-4f25ee16dd04"
confidence: 0.5
created_at: "2026-03-20T00:00:00Z"
updated_at: "2026-03-20T00:00:00Z"
---

## Convoys

A Convoy is Gas Town's ticketing/work-order unit. It wraps a bunch of work into a trackable delivery unit. Every `gt sling` — from a single polecat task to a big swarm — gets wrapped in a Convoy.

- Convoys are special beads (not epics — tracked issues aren't children, they already have parents).
- Multiple swarms can attack a Convoy before it finishes.
- Convoys show in a Charmbracelet TUI dashboard with expanding trees.
- When a Convoy lands (completes), the Overseer gets notified.

## Patrols

Patrols are ephemeral wisp workflows that patrol workers (Refinery, Witness, Deacon) run in a loop.

- **Refinery patrol**: Preflight cleanup → process Merge Queue until empty → postflight handoff. Plugins coming for MQ reordering.
- **Witness patrol**: Check polecat wellbeing → check refineries → peek at Deacon → run rig-level plugins.
- **Deacon patrol**: Run town-level plugins → manage handoff protocol → delegate complex work to Dogs.

Patrols have exponential backoff — agents sleep longer between loops if no work is found. Any mutating `gt` or `bd` command wakes the town.

## Swarms

Polecats are spun up in swarms to attack work in parallel. The Witness manages polecat health. Swarms are ephemeral sessions taking on persistent work — whoever manages the Convoy keeps recycling polecats and pushing them on issues until done.
