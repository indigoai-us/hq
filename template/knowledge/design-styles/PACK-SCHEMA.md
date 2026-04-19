---
type: reference
domain: [design-system]
status: canonical
tags: [pack-schema, style-packs, pack-yaml, registry]
relates_to: []
---

# Pack Schema Reference

This document specifies the schema for `pack.yaml` — the manifest file that every style pack and brand pack must include. It is the source of truth for pack authors, workers, and tooling.

---

## Overview

A **style pack** codifies a visual aesthetic as a portable system of files that workers and repos can adopt. A **brand pack** extends a style pack with company-specific overrides (colors, fonts, voice). Both are described by a `pack.yaml` at the root of the pack directory.

Pack directory layout (minimum):

```
packs/<pack-id>/
  pack.yaml              ← this file (required)
  style-guide.md         ← visual reference (required)
  implementation.md      ← code-level system (required)
  design-tokens.css      ← CSS custom properties (required)
  design-tokens.json     ← DTCG format tokens (required)
  design-template.md     ← drop-in design.md for repos (optional)
```

---

## Fields

### Pack Metadata

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `id` | string | yes | kebab-case, unique across registry |
| `name` | string | yes | Human-readable display name |
| `version` | string | yes | Semver string (`"1.0.0"`) |
| `type` | enum | yes | `style` or `brand` |
| `aesthetic` | string | yes | One-line description of the visual language |
| `origin` | string | optional | Designer / studio / brand owner attribution (both pack types) |
| `extends` | string | brand only | `id` of the style pack this brand pack extends |

**`type` semantics:**
- `style` — a pure aesthetic system, not tied to any company. Can be used by many brands.
- `brand` — a company-specific adaptation that `extends` a style pack. Overrides colors, fonts, voice.

---

### `contents`

A map of role keys to relative file paths within the pack directory. Used by workers to locate pack files without hardcoding paths.

| Key | Description | Required |
|-----|-------------|----------|
| `style_guide` | Visual reference (style-guide.md) | yes |
| `implementation` | Code-level system (implementation.md) | yes |
| `tokens_css` | CSS custom properties | yes |
| `tokens_json` | DTCG JSON tokens | yes |
| `design_template` | Drop-in design.md for repos | optional |
| `swipes` | Directory of reference images | optional |

---

### `compatibility`

Declares which formulas and industries this pack is designed for.

| Field | Type | Description |
|-------|------|-------------|
| `formulas` | string[] | Slugs of formula directories this pack works with (e.g., `web`, `app`, `slides`, `social`, `print`) |
| `industries` | string[] | Industry/context tags (e.g., `saas`, `fintech`, `consumer`, `editorial`) |

---

### `context_paths`

Paths that workers load when this pack is active. Used by the `run` command and `execute-task` to inject pack context into the worker's knowledge window.

| Field | Type | Description |
|-------|------|-------------|
| `required` | string[] | Workers MUST load these paths when the pack is active |
| `optional` | string[] | Workers SHOULD load these if relevant to the task |

Paths are relative to the pack directory (e.g., `implementation.md`) or absolute HQ paths (e.g., `knowledge/public/design-styles/foundations/typography.md`).

---

### `tools` (optional)

Declares CLI or worker commands the pack exposes. Used by tooling to surface pack-specific commands.

| Field | Type | Description |
|-------|------|-------------|
| `audit` | string | Worker skill command for design audits (e.g., `run {company}-designer audit`) |
| `polish` | string | Worker skill command for polish passes |
| `review` | string | Worker skill command for design review |

---

## Annotated YAML Examples

### Type: style

```yaml
# pack.yaml — Style Pack Manifest
# See PACK-SCHEMA.md for full documentation.

id: american-industrial        # kebab-case, unique across registry
name: American Industrial      # human-readable display name
version: "1.0.0"               # semver — bump minor for additions, major for breaking changes
type: style                    # style | brand

# One-line description of the visual language. Used in registry listings.
aesthetic: "High-contrast industrial design language — condensed display type, structural rules, utilitarian grid systems"

# Attribution: original designer / studio. Omit for original packs.
origin: "Kyle Anthony Miller / Brass Hands (brasshands.com)"

# Map of role keys to relative file paths in this pack directory.
# Workers use these keys — never hardcode filenames in worker YAML.
contents:
  style_guide: style-guide.md
  implementation: implementation.md
  tokens_css: design-tokens.css
  tokens_json: design-tokens.json
  design_template: design-template.md
  swipes: swipes/          # directory — workers list images here for reference

# Which formula directories and industry contexts this pack is designed for.
compatibility:
  formulas:
    - web                  # packs/formulas/web/
    - app                  # packs/formulas/app/
    - slides               # packs/formulas/slides/
    - social               # packs/formulas/social/
  industries:
    - saas
    - fintech
    - defense
    - industrial
    - enterprise

# Files workers load when this pack is active.
# required = always loaded; optional = loaded when task-relevant.
context_paths:
  required:
    - implementation.md          # code-level system — typography, color, layout, motion
    - design-tokens.css          # CSS custom properties
  optional:
    - style-guide.md             # visual reference — load for design review tasks
    - design-tokens.json         # DTCG tokens — load for token tooling tasks
    - knowledge/public/design-styles/foundations/typography.md   # shared foundations

# Optional: worker commands this pack exposes.
tools:
  audit: "run frontend-dev audit"
  polish: "run frontend-dev polish"
  review: "run frontend-dev review"
```

---

### Type: brand

Brand packs extend a style pack and add company-specific overrides. The `extends` field is required; all other fields are additive or override the style pack.

```yaml
# pack.yaml — Brand Pack Manifest
# Brand packs extend a style pack with company-specific overrides.
# See PACK-SCHEMA.md for full documentation.

id: {company}-editorial              # kebab-case, globally unique
name: {company} Editorial Pastel     # human-readable display name
version: "1.0.0"               # semver
type: brand                    # brand packs must specify type: brand

# The style pack this brand pack extends. All style pack rules apply
# unless explicitly overridden in this pack's files.
extends: editorial-magazine    # id of parent style pack

# One-line description of this brand's specific adaptation.
aesthetic: "Quiet editorial confidence — six-pastel palette, serif display, flat design. Kinfolk-adjacent. Never supplement-bro."

# Brand owner. Omit for public/open packs.
origin: "{company} internal brand system"

# Brand packs typically have the same file structure as style packs,
# plus company-specific additions (brand-guidelines, forbidden colors, etc.)
contents:
  style_guide: style-guide.md
  implementation: implementation.md
  tokens_css: design-tokens.css
  tokens_json: design-tokens.json
  design_template: design-template.md

# Brand packs inherit parent compatibility but may restrict it.
# List only the formulas/industries relevant to this brand.
compatibility:
  formulas:
    - web
    - slides
    - social
  industries:
    - consumer
    - lifestyle
    - editorial
    - wellness

# Brand packs typically load more context (brand voice, forbidden patterns).
context_paths:
  required:
    - implementation.md
    - design-tokens.css
    - design-tokens.json
  optional:
    - style-guide.md
    - design-template.md

# Brand packs often have brand-scoped worker commands.
tools:
  audit: "run {company}-designer audit"
  polish: "run {company}-designer polish"
  review: "run {company}-designer review"
```

---

## Validation Rules

1. `id` must be kebab-case and unique across the pack registry (`packs/registry.yaml`).
2. `version` must be valid semver.
3. `type: brand` requires `extends` field; `type: style` must NOT have `extends`.
4. All paths in `contents` must exist relative to the pack directory.
5. All paths in `context_paths` must exist (relative to pack dir or as absolute HQ paths).
6. `compatibility.formulas` entries must match directory names under `formulas/`.

---

## Registry Entry

After creating a pack, add a registry entry in `packs/registry.yaml`:

```yaml
- id: american-industrial
  name: American Industrial
  version: "1.0.0"
  type: style
  path: packs/american-industrial/
  aesthetic: "High-contrast industrial design language"
```
