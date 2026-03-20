---
title: "Gas Town Plugin System"
category: gas-town-architecture
tags: ["gas-town", "production-patterns", "agent-orchestration", "agent-workflows", "coordination"]
source: "https://steve-yegge.medium.com/welcome-to-gas-town-4f25ee16dd04, https://github.com/steveyegge/gastown, https://github.com/steveyegge/gastown/blob/main/docs/glossary.md"
confidence: 0.6
created_at: "2026-03-20T04:00:00Z"
updated_at: "2026-03-20T04:00:00Z"
---

Plugins are patrol steps injected into Witness (rig-level) or Deacon (town-level) patrol molecules; definition details are under-documented.

## Plugin Scopes

Gas Town has two plugin scopes, aligned to the worker hierarchy:

| Scope | Runner | Typical Use |
|-------|--------|-------------|
| **Rig-level** | Witness | Per-project checks, custom health probes |
| **Town-level** | Deacon + Dogs | Cross-rig orchestration, new UIs, backend integrations |

The Refinery's patrol also supports plugins that can reorder the Merge Queue and wire Gas Town's backend to external systems — this scope sits between rig and town.

## How Plugins Relate to Patrols

Patrols are ephemeral wisp workflows (TOML formulas instantiated each cycle). A patrol formula is a sequence of `[[steps]]`. Plugins are injected as discrete steps within the patrol formula:

- **Witness patrol**: `check polecat wellbeing → check refineries → peek at Deacon → **run rig-level plugins**`
- **Deacon patrol**: `**run town-level plugins** → manage handoff protocol → delegate to Dogs`

Each step has an `id`, `title`, `description`, and `needs` (dependency list) — so plugins are just named steps that the patrol formula depends on completing.

## Formula → Molecule → Wisp Pipeline

```
formulas/*.formula.toml   (source definition, embedded in gt binary)
         ↓ "cooked"
     Protomolecule         (template class — structure without specific work items)
         ↓ instantiated
   Molecule (persistent)   OR   Wisp (ephemeral, patrol cycles)
```

- **Formulas**: TOML files in `internal/formula/formulas/`, embedded in the `gt` binary at build time.
- **Protomolecule**: Template class for a formula; defines step structure before attaching to live beads.
- **Molecule**: Durable chained Bead workflow; each step is a tracked Bead that survives agent restarts.
- **Wisp**: Ephemeral Bead with a hash ID, used for patrol cycles. Discarded after the patrol completes.

## Definition: TOML Formula Structure

```toml
description = "Short description of the workflow"
formula     = "formula-name"
version     = "1"

[vars]
  my_var = { description = "Input variable", required = true }

[[steps]]
  id          = "step-one"
  title       = "Step One Title"
  description = "What the agent does in this step"
  needs       = []

[[steps]]
  id          = "step-two"
  title       = "Step Two Title"
  description = "Depends on step one"
  needs       = ["step-one"]
```

## Discovery

- Built-in formulas are embedded in the `gt` binary from `internal/formula/formulas/`.
- The `plugins/` directory at the repo root is the designated location for plugin implementations.
- A `patrols/` directory holds patrol formula definitions separately from general formulas.
- Users enumerate available formulas via `bd formula list`.

## Status (as of early 2026)

The plugin infrastructure is present but under-specified in public documentation. Key gaps:

- No published standard for what a plugin must implement (interface contract).
- No documented auto-discovery mechanism (file naming convention vs explicit registration).
- Rig-level vs town-level plugin authoring guides are not yet available publicly.
- Refinery MQ-reordering plugins are described as "coming" — not yet shipped.
