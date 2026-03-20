---
title: "MEOW Stack: Formulas and Cooking"
category: meow-stack
tags: ["gas-town", "agent-orchestration", "task-management", "planning", "beads-workflows"]
source: "https://steve-yegge.medium.com/welcome-to-gas-town-4f25ee16dd04"
confidence: 0.5
created_at: "2026-03-20T00:00:00Z"
updated_at: "2026-03-20T00:00:00Z"
---

MEOW (Molecular Expression of Work) is Gas Town's full work-representation stack, built on top of Beads. It extends the Beads molecule concept with higher-level composition.

## The Stack (bottom to top)

1. **Beads**: Atomic work units — issues with ID, description, status, assignee. Stored in JSONL, tracked in Git.
2. **Epics**: Beads with children. Children are parallel by default; explicit dependencies force sequencing. Support "upside-down" plans (root = last step, leaves = first).
3. **Molecules**: Epics with workflow semantics. Arbitrary shapes, loops, gates. Turing-complete. Each step executed by a superintelligent AI.
4. **Protomolecules**: Templates (classes) made of actual Beads with instructions and dependencies pre-wired. Instantiation copies all beads with variable substitution. (The Expanse reference.)
5. **Formulas**: TOML source form for workflows. Support macro-expansion, loops, gates, and composition. "Cooked" into protomolecules, then instantiated into wisps or mols.
6. **Guzzoline**: The aggregate sea of molecularized work — all composable, dependency-linked, ready for Gas Town to swarm.

## Cooking Process

Formula (TOML) → cook → Protomolecule (template beads) → instantiate → Molecule/Wisp (live workflow)

## Composition

Molecules bond with other molecules. You can wrap any workflow with an orchestration template (e.g., Jeffrey Emanuel's "Rule of Five" — 5 review passes with different focus areas per step).

## Mol Mall

Planned marketplace for shareable formulas. Not yet implemented as of the article's publication (Jan 2026).
