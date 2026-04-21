---
type: reference
domain: [design-system, moonflow]
status: canonical
tags: [style-guide, moonflow-editorial-v2, brand-pack]
---

# Moonflow Editorial V2 — Style Guide

Visual reference for the Moonflow iOS app redesign. Derived from Figma file `fpkOz8VuhR80oc8mp0Tov3`.

---

## Aesthetic Direction

Warm, embodied, editorial. Like a beautifully printed wellness journal — earthy terracotta and cream, soft serif headlines, intimate photography. The app feels like it holds space rather than demands attention.

**Keywords:** grounded, luminous, seasonal, cyclical, editorial, warm, intimate

---

## Color Palette

### Primary
| Token | Hex | Use |
|-------|-----|-----|
| terra (primary) | `#b95b34` | CTAs, active states, brand mark |
| cream | `#fbf6f2` | Background, surfaces |
| gold | `#ffc375` | Warm accent, highlights |

### Cycle Phase Colors (accent)
Each phase has a background tint and a vivid accent. Accents are used for pills, progress indicators, and ring highlights.

| Phase | Background tint | Accent |
|-------|----------------|--------|
| Menstrual | `#a84232` | `#80d4ff` (soft blue) |
| Follicular | `#b35c2a` | `#ffea80` (warm yellow) |
| Ovulation | `#b07040` | `#bc99ff` (soft lavender) |
| Luteal | `#3a1833` | `#ff80aa` (dusty rose) |

### Supporting
- **Plum** `#4a2040` — premium depth (paywall, premium content headers)
- **Midnight** `#0a0e1a` — deep contrast (modals, overlays)
- **Dusty Rose** `#d9afa7` — soft warmth (logo gradient, decorative)
- **Sage** `#adc193` — muted green (logo gradient, nature accents)

### Glass / Surface
- Glass bg: `rgba(255, 255, 255, 0.09)`
- Glass border: `rgba(255, 255, 255, 0.3)`
- Surface: `#c0744a`

---

## Typography

### Font Pairing
| Role | Family | Weight range |
|------|--------|-------------|
| Display / headings | **Fraunces** | Light 300 → Bold 700, with italic variants |
| Body / UI | **Inter** | Light 300 → Bold 700 |

Cormorant Garamond has been removed. Never reintroduce it.

### Type Scale (px, React Native)
| Token | Size | Use |
|-------|------|-----|
| display | 42 | Hero headings, splash text |
| h1 | 32 | Screen titles |
| h2 | 26 | Section headers |
| 3xl | 30 | Large callouts |
| 2xl | 24 | Card titles |
| xl | 20 | Affirmations, prominent labels |
| lg | 18 | Sub-section labels |
| base | 16 | Body text |
| sm | 14 | Captions, secondary labels |
| xs | 12 | Fine print, metadata |

### Editorial Rules
- Phase names and moon phase names: **Fraunces Light** or **Fraunces Light Italic**
- Daily affirmation copy: **Fraunces Light 20px** (per CLAUDE.md)
- Body copy, settings rows, data labels: **Inter Regular/Medium**
- CTA buttons: **Inter SemiBold** (sm/md/lg)
- Letter spacing: tight `-0.5` for display; `0` for body; wide for eyebrows/labels

---

## Spacing (8pt Grid)

| Token | Value |
|-------|-------|
| xs | 4 |
| sm | 8 |
| md | 12 |
| base | 16 |
| lg | 20 |
| xl | 24 |
| 2xl | 32 |
| 3xl | 40 |
| 4xl | 48 |
| 5xl | 56 |
| 6xl | 72 |

---

## Shape + Radius

| Token | Value | Use |
|-------|-------|-----|
| sm | 8 | Chips, small badges |
| md | 12 | Input fields, list rows |
| lg | 16 | Cards |
| xl | 24 | Modals, large cards |
| full | 9999 | Pills, FAB |

---

## Imagery

**Moon phases:** Soft-focus, warm-luminous photographic stills of the moon at 8 phases. ~200KB each max (WebP + PNG fallback). Stored under `assets/moon-phases/`.

**Photography style:** warm color grading, slight soft focus, earthen tones. Avoid cold blues or artificial-looking edits.

---

## Component Vocabulary

| Component | Notes |
|-----------|-------|
| Button | `primary` (terra filled) / `secondary` (outline) / `ghost` / `destructive` |
| Card | Soft shadow, cream tint, corner radius `lg` |
| GlassCard | Frosted glass surface, border `rgba(255,255,255,0.3)` |
| FAB | Circular, terra, bottom-center, haptic on press |
| SentimentSelector | Horizontal scroll chips, emoji+label |
| PracticeGuideCard | Eyebrow + title + body, expandable, phase-color tint |
| InsightCallout | Fraunces Italic quote block + attribution |
| MoonPhaseRing | 280px wheel with photographic moon assets |

---

## IA (V2 Structure)

- **Tab bar:** Cycle | Oracle | Community | Profile (4 tabs + central FAB)
- **Cycle tab:** scrollable home (Today folded in) — greeting → phase summary → moon ring → calendar → practices → insight
- **Oracle tab:** 2×4 category card grid → category detail letter
- **Today tab:** removed (folded into Cycle)

---

## Voice

Warm, intuitive, relational, embodied. Concise, non-prescriptive, editorial.

Avoid: overly long paragraphs, abstract mystical language, identity-heavy labeling, app-admin dry copy, cluttered hierarchy.
