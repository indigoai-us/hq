---
id: hq-company-scoped-archives
title: Archive Projects Under Company Directory
scope: global
trigger: when archiving a completed project
enforcement: hard
version: 1
created: 2026-02-22
updated: 2026-02-22
source: migration
---

## Rule

Archived projects go to `companies/{co}/projects/_archive/` (NOT central `projects/_archive/`). All company data lives under its company dir. Active projects still in `projects/` will migrate to company dirs over time. Each company's `board.json` is the canonical registry of all work (active + archived).

## Rationale

Keeps all company data self-contained under its company directory.
