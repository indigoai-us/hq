---
id: hq-no-glob-discovery
title: Never Glob for PRD or Worker Discovery
scope: global
trigger: when searching for prd.json, worker.yaml, or project directories
enforcement: hard
---

## Rule

Never use Glob to find `prd.json`, `worker.yaml`, or discover project/company/worker directories. This is hook-enforced — Glob calls with these patterns are blocked.

**Use instead:**
- **Project PRDs:** `qmd search "{name} prd.json" --json -n 5` → parse results → `Read` the file
- **Workers:** `Read workers/registry.yaml` → find path → `Read {path}/worker.yaml`
- **Companies:** `Read companies/manifest.yaml` — all companies listed there
- **Known exact path:** `Read companies/{co}/projects/{name}/prd.json` directly

Glob is only for listing files within a known, scoped directory (e.g. `Glob pattern="*.ts" path="repos/private/{your-repo}/apps/"`).

## Rationale

HQ root contains 1.38M+ files via symlinked repos. Glob-based discovery causes timeouts, kills sibling tool calls, and teaches the wrong pattern. Index files (`manifest.yaml`, `registry.yaml`) and `qmd search` are faster and more reliable.
