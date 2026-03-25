---
title: "Formula Sharing Ecosystem & Mol Mall Status"
tags: [bd, formulas, molecules, mol-mall, community, ecosystem]
created: 2026-03-25
source: web-research
---

## Summary

As of March 2026, there is **no public formula-sharing marketplace or community formula repository** for bd/beads. The planned "Mol Mall" has been mentioned by Steve Yegge but is not yet implemented.

## Mol Mall

- Yegge has referenced a planned marketplace called **Mol Mall** for sharing formulas
- It would allow users to publish and discover reusable workflow formulas (TOML-based)
- As of v0.62.0 (latest release), no Mol Mall feature exists in bd CLI or documentation
- The CHANGELOG and release notes contain no references to marketplace functionality

## Current State of Formula Sharing

- **No centralized repository**: Formulas live in `.beads/formulas/` within individual projects — there's no `bd formula publish` or registry mechanism
- **No community formula collections**: No public GitHub repos or curated formula libraries found beyond the beads repo's own examples
- **Manual sharing only**: Users can share formula TOML files via copy-paste, gists, or git — no tooling supports this

## Community Contributions (Adjacent)

While formula sharing doesn't exist, the beads community has produced:

- **Multiple TUI/UI projects**: At least 4-5 community-built UIs (e.g., [beads_viewer](https://github.com/Dicklesworthstone/beads_viewer) — graph-aware TUI with PageRank, critical path, kanban)
- **Gas Town web UI**: Community-contributed dashboard for the multi-agent workspace manager ([Issue #228](https://github.com/steveyegge/gastown/issues/228))
- **Third-party Claude Code marketplace listings**: Aggregator sites list beads as a plugin, but these aren't Yegge-operated

## Implications for GHQ

- Our formula definitions in `companies/ghq/knowledge/beads-workflows/formula-specification.md` are self-contained — no upstream formula library to pull from
- If Mol Mall launches, it could provide reusable workflow templates (code review, refactoring, migration formulas)
- For now, any formula reuse must be manual: copy TOML files between projects
