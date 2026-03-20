---
title: "Molecules and Wisps: Structured Workflow Execution in Beads"
category: beads-workflows
tags: ["ai-agents", "task-management", "agent-loop", "planning", "autonomous-coding"]
source: "https://github.com/steveyegge/beads"
confidence: 0.5
created_at: "2026-03-20T00:00:00Z"
updated_at: "2026-03-20T00:00:00Z"
---

Molecules are Beads' mechanism for structured, repeatable workflows. A molecule is an epic (parent + children) with workflow semantics — children execute in parallel by default unless explicit `blocks` dependencies enforce sequencing.

## Three Phases (Chemistry Metaphor)

- **Solid (Proto)**: Frozen reusable templates in `.beads/`, synced across repos. Blueprints for creating instances.
- **Liquid (Mol)**: Persistent active work instances created from protos. Maintain audit trails, survive across sessions. Used for significant feature work.
- **Vapor (Wisp)**: Ephemeral, local-only instances. Never exported, never synced. Ideal for routine tasks or exploration.

## Key Operations

| Command | Effect |
|---------|--------|
| `bd mol pour <proto>` | Template → persistent instance |
| `bd mol wisp <proto>` | Template → ephemeral instance |
| `bd mol squash <id>` | Compress completed work into digest |
| `bd mol burn <id>` | Discard wisp without record |
| `bd mol bond A B` | Connect two work graphs via dependency |

## Design Insight

Wisps are intentionally local-only — hard-deleted when squashed (no tombstones needed for non-distributed data). This enables fast iteration and clean history. The squash operation preserves essential context as a compact digest while discarding step-by-step noise.

"Work = issues with dependencies." No special molecule syntax required — any epic with children and proper dependencies functions as a molecule.
