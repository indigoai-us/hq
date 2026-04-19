# goclaw-admin

Style pack for dark industrial admin consoles. Monochrome zinc, Barlow Condensed display, Inter body, IBM Plex Mono numerals, fixed-rail sidebar shell, status-only color.

- **Id:** `goclaw-admin`
- **Version:** 1.0.0
- **Type:** style
- **Status:** active
- **Stack assumption:** Next.js 15 App Router + Tailwind v4 + React 19
- **Registry entry:** `knowledge/public/design-styles/registry.yaml`

## What's in this pack

| File | Purpose |
|---|---|
| `pack.yaml` | Manifest (id, version, contents map, context paths, provenance) |
| `style-guide.md` | Visual reference — palette, typography, shell, component catalogue |
| `implementation.md` | Code-level system — Next 15 / Tailwind v4 wiring, component sketches with exact `className` strings |
| `design-tokens.css` | CSS custom properties for tokens (`--ga-*`) plus base rules (scrollbar, body tracking) |
| `design-tokens.json` | DTCG-format token mirror for tooling |
| `README.md` | This file |

## Provenance

Extracted 2026-04-17 from an internal admin console reference at commit `3bb35c5`. The source is an internal dark-theme Next.js 15 + Tailwind v4 shell with Barlow Condensed / Inter / IBM Plex Mono and a fixed vertical nav rail.

Only the visual system was extracted — palette, typography, shell structure, component patterns, and dense-layout spacing rules. No third-party brand content, auth vendor code, icons-with-wordmarks, product names, domain strings, or environment variable names are included in the pack.

## Licensing

Internal-use across HQ. The pack is authored inside `knowledge/public/` so it is shareable across all HQ-scoped consumers, but it ships no third-party assets and makes no external licensing claims. Consumers self-host fonts via `@fontsource` if they need offline builds (the shipped `implementation.md` pulls from Google Fonts by default).

## How consumers use this pack

1. Add to a repo's `design.md`:
   ```yaml
   style-pack: goclaw-admin
   ```
2. Copy `design-tokens.css` into the consuming repo (do not symlink across repo boundaries) and `@import` it from `globals.css` after `@import 'tailwindcss';`.
3. Follow `implementation.md` for the `layout.tsx` + `Sidebar` + component sketches.
4. Run the quality-gate checklist at the bottom of `implementation.md` before landing any page.

## Declared consumers (forward-declared, see registry.yaml)

- `hq-console` — {company}'s customer-facing cloud console at `hq.{your-domain}.ai` (scaffolded in US-001).

## Screenshot reference

A single reference still of the extracted shell can be captured and dropped into `swipes/shell.png` by a subsequent task. This pack ships without one — the `implementation.md` className strings are the authoritative visual spec, not a PNG.

## Changelog

- **1.0.0 (2026-04-17)** — Initial extraction at source commit `3bb35c5`. Tokens, style guide, implementation, JSON mirror, README.
