---
title: "Company Workspace Architecture"
category: ghq-core
tags: ["architecture", "companies", "symlinks", "manifest"]
source: system
confidence: 1.0
created_at: 2026-03-25T00:00:00Z
updated_at: 2026-03-25T00:00:00Z
---

GHQ organizes all work into company-scoped workspaces. Each company gets its own knowledge base, tools, data, and project repos — isolated but searchable from the central GHQ repo.

## Directory Structure

```
companies/
  manifest.yaml                     # registry of all companies
  ghq/                              # GHQ itself (not a symlink)
    knowledge/{category}/{slug}.md  # meta-knowledge, agent patterns
    tools/                          # shared utility scripts
  {slug}/                           # external company (symlink)
    knowledge/{category}/{slug}.md  # company-specific knowledge
      .queue.jsonl                  # curiosity queue (pending)
      .queue-done.jsonl             # completed/duplicate items
      .research-log.jsonl           # research session summaries
    data/                           # company-specific data files
    tools/                          # company-specific scripts
    repos/{repo}/                   # repo symlinks
```

## Symlinks

External companies (everything except `ghq`) are stored outside the GHQ repo and accessed via relative symlinks under `companies/`. The `/new-company` command creates the physical directory at the user's chosen location (default: `~/Documents/GHQ/companies/{slug}`) and sets up the symlink.

This pattern allows each company's data to live wherever makes sense (different disk, cloud-synced folder, etc.) while keeping a unified view from the GHQ repo root.

## Manifest

`companies/manifest.yaml` is the single source of truth for all companies:

```yaml
companies:
  ghq:
    name: "GHQ"
    goal: "Become the ultimate autonomous agent"
    path: "companies/ghq"
    created_at: "2026-03-20T00:00:00Z"
  content-co:
    name: "Content Co"
    goal: "Maximise revenue through content creation"
    path: "~/Documents/GHQ/companies/content-co"
    created_at: "2026-03-24T00:00:00Z"
```

The manifest is used by `/autopilot` to enumerate all companies and spawn bd-manager agents for each one.

## Company Onboarding

The `/new-company` command handles full scaffolding:

1. Prompts for company name, goal, and slug
2. Creates the physical directory with `knowledge/`, `data/`, `tools/` subdirs
3. Creates a symlink in `companies/{slug}`
4. Initializes `bd` (beads issue tracker) for task management
5. Registers a `qmd` collection so knowledge is searchable
6. Adds the company to `manifest.yaml`

## Knowledge Scoping

All knowledge commands (`/learn`, `/research`, `qmd`) accept `-c <company-slug>` to target a specific company. Default is `ghq`. The `consult-knowledge.sh` hook queries across all registered qmd collections, so knowledge from any company can surface when relevant.

## Repos

Under each company, repos are symlinked directly at `repos/{repo}/`. This avoids duplicating clones while keeping the structure flat and simple.
