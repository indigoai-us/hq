---
title: "Gas Town Roles and Structure"
category: gas-town-architecture
tags: ["agent-orchestration", "multi-agent", "gas-town", "agent-architecture", "coordination"]
source: "https://steve-yegge.medium.com/welcome-to-gas-town-4f25ee16dd04"
confidence: 0.5
created_at: "2026-03-20T00:00:00Z"
updated_at: "2026-03-20T00:00:00Z"
---

Gas Town is Steve Yegge's multi-agent orchestrator (Go, v4) built on top of Beads. It coordinates 20-30 Claude Code instances simultaneously through seven well-defined worker roles plus a human Overseer.

## Structure

- **Town**: The top-level HQ directory (e.g. `~/gt`). The `gt` binary manages all workers across all rigs. Configuration lives in a separate repo.
- **Rigs**: Each project/git repo under Gas Town management. Some roles are per-rig (Witness, Polecats, Refinery, Crew), others are town-level (Mayor, Deacon, Dogs).

## Seven Worker Roles

1. **Mayor**: Main concierge and chief-of-staff. The primary agent the Overseer talks to. Kicks off most convoys.
2. **Polecats**: Ephemeral per-rig workers that spin up on demand for swarming. Produce Merge Requests, then get decommissioned (names recycled).
3. **Refinery**: Per-rig engineer agent responsible for intelligently merging all changes one at a time to main via the Merge Queue. No work can be lost; allowed to escalate.
4. **Witness**: Per-rig patrol agent that watches over polecats and helps them get unstuck. Also peeks in on Deacon and runs rig-level plugins.
5. **Deacon**: Town-level daemon beacon (patrol agent). Runs a patrol loop, propagates "Do Your Job" signals downward. Runs town-level plugins. Named after Dennis Hopper's Waterworld character.
6. **Dogs**: Town-level helpers for the Deacon. Handle maintenance (stale branches), handyman work, and plugin execution so the Deacon stays focused on its patrol.
7. **Boot the Dog**: Special Dog awakened every 5 minutes to check on the Deacon — decides if it needs a heartbeat, nudge, restart, or to be left alone.
8. **Crew**: Per-rig coding agents that work directly for the Overseer. Long-lived identities, not managed by Witness. Best for design work and back-and-forth.

## Overseer (Human)

The eighth role. Has an identity in the system, an inbox, and can send/receive town mail. The boss.

## Graceful Degradation

Every worker can function independently or in small groups. Gas Town works even in no-tmux mode, limping along with naked Claude Code sessions. Parts can be selectively enabled/disabled.
