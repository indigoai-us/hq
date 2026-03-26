---
id: hq-mermaid-diagrams-only
title: Use Mermaid for Knowledge Diagrams
scope: global
trigger: when creating or editing knowledge files with diagrams
enforcement: soft
version: 1
created: 2026-02-22
updated: 2026-02-22
source: migration
learned_from: "CLAUDE.md learned rules migration 2026-02-22"
---

## Rule

When creating/editing knowledge files, ALWAYS use ` ```mermaid ` blocks for diagrams — never ASCII art. The {your-app} renders Mermaid as interactive SVG with {Product} theming and click-to-zoom.

## Rationale

Ensures diagrams are interactive and consistently styled in the HQ knowledge viewer.
