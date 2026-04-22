---
type: style-guide
pack: goclaw-admin
version: "1.0.0"
status: canonical
---

# Goclaw Admin — Style Guide

Dark-first industrial admin console. Every surface is zinc. Every rule is a hairline. Color is reserved for status, never decoration. The aesthetic reads "NOC room", not "marketing page".

Use this pack when you need an operations console: fleet dashboards, deployment lists, usage tables, team management, observability views. It is deliberately not a consumer aesthetic.

---

## 1. Palette

### 1.1 Monochrome foundation

Zinc is the entire structural palette. Everything you build in this pack lives on a zinc surface, sits inside a zinc card, or rides a hairline-white rule.

| Token | Hex | Role |
|---|---|---|
| `zinc.950` | `#09090b` | Canonical page background. Every route renders on this. |
| `zinc.900` | `#18181b` | Modal backdrops, expanded panel surfaces. |
| `zinc.800` | `#27272a` | Input fills, pressed-button surfaces. |
| `zinc.700` | `#3f3f46` | Disabled text, deepest muted copy. |
| `zinc.600` | `#52525b` | Nav icon color at rest. |
| `zinc.500` | `#71717a` | Nav item label at rest; tertiary copy. |
| `zinc.400` | `#a1a1aa` | Muted body copy, sparkline stroke. |
| `zinc.300` | `#d4d4d8` | Default body copy. |
| `zinc.100` | `#f4f4f5` | Strong body copy, page titles. |
| `rail.bg` | `#0a0a0b` | Sidebar rail — a single tick warmer than the page. The only surface in the shell that is not pure `zinc.950`. |

### 1.2 Hairline rules

All structural borders are `rgba(255,255,255,0.06)` — Tailwind `white/[0.06]`. Two supporting tokens:

| Token | Alpha | Role |
|---|---|---|
| `rule.6` | `.06` | Card borders, rail edges, section dividers, table header rules. |
| `rule.3` | `.03` | Hover fills on rows and nav items. |
| `rule.row` | `.02` | Faint row striping when zebra is needed. |

There are no 1px solid borders in this pack. There are no drop shadows.

### 1.3 Status color — the only exception

Color appears only when it carries information. Never as a brand flourish, never on hero blocks, never on icons-at-rest.

| Semantic | Dot | Text | Background | When |
|---|---|---|---|---|
| Success | `emerald-400` | `emerald-400` | `emerald-950` | Running, healthy, active |
| Danger | `red-400` | `red-400` | `red-950` | Errors, unhealthy, deactivated past grace |
| Warning | `amber-400` | `amber-400` | `amber-950` | Degraded, rate-limited, near-quota |
| Info | `blue-400` | `blue-400` | `blue-950` | In-flight, provisioning, pending |
| Neutral | `zinc-400` | `zinc-400` | `white/[0.02]` | Stopped, unknown, archived |

Rule of thumb: if you reach for color and the content isn't a live status, you're off-pack.

### 1.4 Dark-first theme stance

The pack ships one theme: dark. A light theme can be derived by inverting the zinc scale and re-pairing status backgrounds against a `zinc-50` surface, but this is out of scope for the canonical pack. Consumers that need a printable light variant should fork the tokens; do not add a `prefers-color-scheme: light` media query to this pack.

---

## 2. Typography

Three fonts, strictly separated by role. They do not overlap.

### 2.1 Families

| Family | Role | Google Fonts slug |
|---|---|---|
| **Barlow Condensed** | Display — wordmarks, uppercase section headings, data headlines | `Barlow+Condensed:wght@400;500;600;700` |
| **Inter** | Body — nav items, paragraph copy, button text, form labels | `Inter:wght@300;400;500;600` |
| **IBM Plex Mono** | Mono — numerals, IDs, timestamps, code, version strings | `IBM+Plex+Mono:wght@400;500` |

Load them via a single `@import` at the top of `globals.css` (see `implementation.md` for the full import string).

### 2.2 Size ramp

Extracted from the reference shell. Sizes in pixels — this is an operational console, not a fluid marketing page.

| Size | Typical use |
|---|---|
| 9 px | Uppercase section headings in the sidebar (`Fleet`, `Operations`) and card captions. Always paired with `font-display`, `semibold`, `tracking-section`. |
| 10 px | Micro mono labels — version strings, units, UTC timestamps. |
| 12 px | Nav item labels, table cells. The dominant interior size. |
| 14 px (`sm`) | Default body. Card titles. |
| 16 px (`base`) | Paragraph copy in modals and settings. |
| 18–30 px | Dashboard headlines and big-number KPIs. Always display family. |

### 2.3 Tracking

- **Body (`0.01em`)** — applied to `<body>`. Softens Inter at 12–14px on dark surfaces. |
- **Label (`0.15em`)** — brand wordmark, bottom-rail mono metadata. |
- **Section (`0.2em`)** — 9px uppercase Barlow Condensed section headings. |

### 2.4 Weights

| Family | Available weights | Primary pairing |
|---|---|---|
| Barlow Condensed | 400 / 500 / 600 / 700 | 600–700 uppercase for display, 500 for quieter headings |
| Inter | 300 / 400 / 500 / 600 | 400 body, 500 active-nav, 600 card titles |
| IBM Plex Mono | 400 / 500 | 400 default, 500 for emphasized numerals |

### 2.5 Hierarchy rule

If the text names a thing (wordmark, heading, stat label, KPI figure), it's display. If the text is a value the user reads character-by-character (ID, count, timestamp, hash), it's mono. Everything else is body.

---

## 3. Shell pattern

The core layout is a fixed sidebar rail + a flexible main column. No top bar by default; shell actions live inside the content column.

### 3.1 Root layout

- `html.dark`, `body` on `zinc.950`, `font-sans`, `text-zinc.100`, `antialiased`.
- A single `<div class="flex min-h-screen">` wraps `<Sidebar />` and `<main class="flex-1 overflow-auto">`.

### 3.2 Sidebar rail

- Fixed width: **240 px** (`shell.sidebar-width`). The reference shell uses 192 px; the pack canon is 240 px to leave room for longer nav labels. Packs may switch to 192 px via `shell.sidebar-width-compact` for ultra-dense consoles.
- `flex-col`, `bg-rail.bg` (`#0a0a0b`), right border `border-rule.6`.
- Three stacked regions, separated by `rule.6` horizontal dividers:
  1. **Brand** — small logomark + Barlow Condensed uppercase wordmark at `tracking-label`, 14px, bold.
  2. **Nav groups** — each group has a 9 px uppercase display heading (`zinc-600`) followed by a list of nav items at 12 px (`zinc-500` at rest, `white` on active with a `rule.3` fill, `zinc-300` on hover with a `rule-3` hover fill).
  3. **Bottom rail** — auth/account affordance + a mono micro version string.

### 3.3 Main column

- `flex-1 overflow-auto`. Every route takes full responsibility for its own top-of-content header.
- Page headers use Barlow Condensed uppercase at 20–30 px, no background bar.
- Primary content sits in hairline-bordered cards (`rule.6`), grid-aligned, no rounded corners.

### 3.4 Spacing discipline

- Dense is the default: table rows are `py-1.5` (6 px), cells are `px-2.5` (10 px), status badges are `px-2.5 py-0.5`.
- Card padding ramps: `p-3` (12 px) for dense stat cards, `p-4` (16 px) for section cards, `p-6` (24 px) for modal bodies.
- Section-to-section vertical gap in the main column: 24 px default, 32 px between unrelated regions.

---

## 4. Components — at-a-glance catalogue

Sketches and exact className strings live in `implementation.md`. This is the visual inventory.

| Component | Surface | Corners | Key detail |
|---|---|---|---|
| **StatusBadge** | status bg | flat (`radius.0`) | 1.5 × 1.5 dot + label, uppercase not required |
| **MetricCard** | `zinc-950` card with `rule.6` border | flat | 9 px display caption + 24–30 px mono figure + optional sparkline |
| **Sparkline** | transparent | — | Inline SVG polyline, 80 × 24 default, `zinc-400` stroke 1.5 |
| **DataTable** | `zinc-950` with `rule.6` header rule | flat | `py-1.5` rows, mono IDs, right-aligned numerics |
| **Modal** | `zinc-900` on backdrop `black/70` | `radius.sm` | 480 px default width, header/body/footer separated by `rule.6` |
| **Button (primary)** | `zinc-100` fg on `zinc-800` bg | `radius.sm` | Uppercase on destructive actions only |
| **Button (ghost)** | `zinc-300` fg on transparent, `rule.3` hover | flat | Default for row actions |
| **Input** | `zinc-800` fill, `rule.6` border | `radius.sm` | Mono font for ID-ish inputs (subdomain, token) |

---

## 5. Motion

Minimal and utilitarian. Everything transitions at `100ms` or less; nothing animates on idle.

- Nav hover: `transition-colors 100ms` on fg and bg.
- Expand/collapse chevrons: `transition-transform 100ms` (rotate 90°).
- Skeleton loaders: steady `opacity` pulse, not a moving shimmer.
- No parallax. No scroll-triggered animation. No entrance animation on route change.

---

## 6. Accessibility floor

- Minimum contrast: 4.5:1 for body copy, 3:1 for 12 px+ UI text. The zinc scale above meets AA at `zinc-400 on zinc-950` for body and `zinc-300 on zinc-950` for dense UI.
- Status color must never be the only signal. Every badge pairs a dot with a text label.
- Focus rings: 2 px `white/60` outline at a 2 px offset on the `zinc-950` surface; never rely on color alone.
- Icon-only buttons require a `title` or `aria-label`.

---

## 7. When not to use this pack

- Marketing sites, landing pages, storefronts — the aesthetic reads as too severe.
- Light-first products — the pack's contrast model assumes a dark base.
- Anything that wants to celebrate a brand hue — this pack is monochrome on purpose.

If a consumer needs brand accent on top of this shell, author a brand pack that `extends: goclaw-admin` and adds a single accent token — do not edit the core pack.
