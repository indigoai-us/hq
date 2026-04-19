---
name: american-industrial
description: American Industrial design style pack — Brass Hands / Kyle Anthony Miller inspired. Heavy condensed typography, structural rules, industrial grid borders, accent bars, no decorative glows. Use this when applying an industrial/utilitarian aesthetic to any frontend project.
---

# American Industrial Design — Style Pack

A codified design language inspired by [brasshands.com](https://brasshands.com) (Kyle Anthony Miller). This skill provides a complete visual system — typography, color, layout, motion, and interaction patterns — that can be applied to any frontend project.

**When to use:** Any time the design direction calls for "industrial", "utilitarian", "editorial", "command center", "Bloomberg terminal", or "American craft" aesthetic. Works for both light (cream/warm) and dark (navy/charcoal) palettes.

**Prerequisite:** Load `frontend-design` SKILL.md first for general design principles. This skill layers on top as a specific aesthetic direction.

---

## Core Philosophy

American Industrial design is about **structural honesty**. Every element serves a purpose. Decoration is replaced by information density. Typography does the heavy lifting — not gradients, glows, or illustrations.

**Three pillars:**
1. **Weight** — condensed display type at massive scale creates visual gravity
2. **Structure** — rules, borders, and grids organize space with visible architecture
3. **Restraint** — accent color used sparingly, as a functional marker (not decoration)

**The feeling:** A factory floor, a newspaper front page, a military-spec data sheet, a Wall Street terminal. Authoritative, dense, precise.

---

## Typography System

### Font Stack

| Role | Primary | Fallback | Notes |
|------|---------|----------|-------|
| Display | **Oswald** or **Bebas Neue** | Impact, sans-serif | Condensed, all-caps, 0.02em tracking |
| Body | **Source Serif 4** or **Space Grotesk** | Georgia / system-ui | Readable at 16px, generous line-height (1.7–1.9) |
| Data | **JetBrains Mono** (optional) | monospace | For counters, timestamps, status labels only |

### Type Scale

```
Hero headline:     clamp(52px, 9vw, 120px)   — display, uppercase, line-height 0.85–0.95
Section title:     clamp(36px, 4vw, 52px)     — display, uppercase, line-height 1.05
Card heading:      20–24px                     — display, uppercase
Body text:         16px                        — body, line-height 1.7–1.9
Label:             10–13px                     — display, uppercase, letter-spacing 0.12–0.3em
Caption/data:      11–12px                     — display or mono, uppercase
```

### Type Rules

- **Headlines are ALWAYS uppercase** — this is non-negotiable for the industrial feel
- **Letter-spacing tiers:** headlines 0.02em, labels 0.12–0.3em, body 0 (natural)
- **Line-height:** display type tight (0.85–1.05), body loose (1.7–1.9). The contrast between compressed headlines and airy body text is the key rhythm
- **Weight contrast:** display headings bold (600–700), labels light (300–400), body regular (400)
- **NEVER use italic for headlines.** Italic is reserved for body text callouts, quotes, and subtitles (Source Serif italic)

### Typography Anti-Patterns

- ❌ System fonts (Inter, Roboto, SF Pro) — too generic, no personality
- ❌ Monospace for labels — use condensed display font instead
- ❌ Centered headline text — left-align everything (exception: rare dark-bg testimonial sections)
- ❌ Gradient text — destroys the industrial honesty
- ❌ Thin/ultralight display weights — industrial type needs mass

---

## Color Palettes

### Warm Palette (Light Mode — "Brass Hands Classic")

```css
:root {
  --bg: #F0EDE7;           /* warm cream paper */
  --surface: #E8E4DC;      /* elevated surfaces */
  --steel: #4A4A48;        /* structural gray */
  --rust: #B8542C;         /* primary accent — commands attention */
  --brass: #C9A84C;        /* secondary accent — data, numerals */
  --dark: #2C2A26;         /* nav, footer, dark sections */
  --text: #2C2A26;         /* body text */
  --muted: #7A766E;        /* secondary text */
  --cream: #F7F4EE;        /* text on dark backgrounds */
}
```

### Dark Palette (Dark Mode — "Command Center")

```css
:root {
  --bg: #0a0e27;           /* deep navy */
  --bg-elevated: #121733;  /* card/surface */
  --bg-card: #1a1f3d;      /* nested surfaces */
  --border: #1f2547;       /* structural lines */
  --text: #e8ebff;         /* primary text */
  --text-dim: #8b92c4;     /* secondary text */
  --accent: #6366f1;       /* {company} accent (replaces rust) */
  --accent-hover: #818cf8; /* accent interaction state */
  --success: #34d399;      /* status: good */
  --error: #f87171;        /* status: bad */
}
```

### Color Rules

- **Accent used structurally, not decoratively:** accent bars, rules, active states, data numerals. Never as background fills (except CTAs)
- **Two accent tiers:** primary accent (rust/{company}) for action items + secondary accent (brass/accent-hover) for data highlights
- **Dark sections break rhythm:** alternate dark/light sections to create editorial pacing. Dark sections get cream/light text
- **No gradients.** Flat fills only. Exception: subtle overlay gradients on images (functional, for text readability)
- **Opacity for hierarchy:** use `opacity: 0.7` or `rgba` for secondary elements on dark backgrounds instead of separate colors

---

## Layout Patterns

### Structural Grid

```
Max width: 1100px (tight) or 1280px (spacious)
Padding: 24px sides (mobile), scales to content max-width
Section padding: 100px vertical (desktop), 64–80px (mobile)
```

### Industrial Grid (Shared Borders)

The signature layout pattern. Grid cells share a single border (no gap between cells). Achieved via:

```css
.industrial-grid {
  display: grid;
  gap: 0;
  border: 2px solid var(--steel);  /* or var(--border) */
}

.industrial-grid > * {
  border: 1px solid rgba(var(--steel-rgb), 0.1);
  padding: 36px 28px;
}
```

**Or the `gap-px` technique** (dark mode):
```css
.bento-grid {
  display: grid;
  gap: 1px;
  overflow: hidden;
  border: 1px solid var(--border);
  background: var(--border);  /* border color shows through gap */
}

.bento-grid > * {
  background: var(--bg-elevated);
}
```

### Asymmetric Layouts

- **Split grids:** `grid-template-columns: 380px 1fr` — sidebar + content
- **Feature cells:** `grid-row: span 2` for hero cells in bento layouts
- **Numbered rows:** `grid-template-columns: [4rem] [12rem] [1fr]` for step/spec layouts

### Alignment

- **Left-aligned by default.** Center alignment is the exception, reserved for:
  - Review/testimonial sections (dark background)
  - CTA/contact blocks
  - Stats dashboard (when numbers are the hero)
- **Asymmetric hero:** headline + subtitle + CTAs + stats stack left. No centering

---

## Structural Elements

### Rules (Dividers)

The backbone of the industrial system. Three types:

| Element | CSS | When |
|---------|-----|------|
| Heavy rule | `height: 3px; background: var(--rust/accent)` | Section breaks, accent markers |
| Section rule | `width: 60–80px; height: 3px; background: var(--rust/accent)` | Before section titles (accent bar) |
| Thin rule | `height: 1px; background: var(--border)` | Within-section separators |

### Accent Bars

Short horizontal bars (60–80px wide, 3px tall) placed **above section titles** as structural markers. This is the single most recognizable pattern:

```html
<div class="h-[3px] w-16 bg-accent mb-4" />  <!-- Tailwind -->
<h2 class="section-title">CAPABILITIES</h2>
```

### Border Treatments

- **Left border accent:** `border-left: 3px solid var(--rust)` on feature items, blockquotes
- **Top border accent:** `border-top: 3px solid var(--rust)` on section tops (dark sections)
- **Inset border frame:** `position: absolute; inset: 6px; border: 1px solid rgba(brass, 0.2)` for badge/callout double-border effect
- **Steel outer border:** `border: 2px solid var(--steel)` on grid containers

### Labels

Industrial section labels — always above the title:

```css
.section-label {
  font-family: var(--display);
  font-size: 11px;
  font-weight: 300–400;
  letter-spacing: 0.2–0.3em;
  text-transform: uppercase;
  color: var(--rust);  /* or var(--accent) */
}
```

Pattern: `LABEL → TITLE → RULE → CONTENT`

---

## Button Patterns

### Primary (Filled)

```css
.btn-primary {
  font-family: var(--display);
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  padding: 14px 36px;
  background: var(--rust);     /* or var(--accent) */
  border: 2px solid var(--rust);
  color: var(--cream);         /* or white */
}
```

### Secondary (Outline)

```css
.btn-secondary {
  /* Same typography */
  padding: 14px 36px;
  background: transparent;
  border: 2px solid var(--brass);  /* or var(--border) */
  color: var(--brass);             /* or var(--text-dim) */
}

.btn-secondary:hover {
  background: var(--brass);
  color: var(--dark);
}
```

### Button Rules

- **NEVER rounded.** Square corners only. `border-radius: 0`
- **Always uppercase display font** for button text
- **Generous padding** (14px 36px minimum) — industrial buttons feel wide
- **Hover:** filled buttons darken; outline buttons fill with border color
- **No shadows on buttons.** Border is the only visual weight

---

## Motion Primitives

All motion is CSS + IntersectionObserver + requestAnimationFrame. **Zero external libraries.**

### Scroll Reveal

```css
[data-motion="scroll-reveal"] {
  opacity: 0;
  transform: translateY(24px);
  transition: opacity 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94),
              transform 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}
```

### Stagger Children

Parent observed; children get sequential `transitionDelay`:
```javascript
children[i].style.transitionDelay = (i * interval) + 'ms';
```
Typical interval: 60–100ms.

### Text Reveal (Clip)

```css
[data-motion="text-reveal"] { overflow: hidden; }
[data-motion="text-reveal"] > * {
  transform: translateY(100%);
  transition: transform 0.7s cubic-bezier(0.16, 1, 0.3, 1);
}
```

### Hover Lift

```css
[data-motion="hover-lift"]:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 24px rgba(0,0,0,0.08);
}
```

### Card Cinematic (Dark Mode)

```css
.card-cinematic {
  transition: transform 0.5s cubic-bezier(0.16, 1, 0.3, 1),
              box-shadow 0.5s cubic-bezier(0.16, 1, 0.3, 1),
              border-color 0.3s ease;
}
.card-cinematic:hover {
  transform: scale(1.02);
  box-shadow: 0 24px 48px rgba(0,0,0,0.5);
  border-color: var(--accent);
}
```

### Motion Rules

- **Always respect `prefers-reduced-motion`** — disable all transforms and transitions
- **No bounce/spring physics** — easing is smooth, not playful
- **Stagger reveals sparingly** — use for grids and lists, not every element
- **No glow/pulse animations** — industrial aesthetic is static until interacted with

---

## Texture & Grain

### Film Grain Overlay

A subtle noise texture adds analog warmth:

```css
.grain::after {
  content: "";
  position: fixed;
  inset: 0;
  background-image: url("data:image/svg+xml,..."); /* fractalNoise SVG */
  background-repeat: repeat;
  background-size: 256px;
  pointer-events: none;
  z-index: 50;
  opacity: 0.3–0.5;
}
```

### Diagonal Stripes (Warm Palette)

Subtle repeating diagonal lines at 2% opacity on dark sections:

```css
background: repeating-linear-gradient(
  -45deg,
  transparent, transparent 20px,
  rgba(200, 168, 76, 0.02) 20px,
  rgba(200, 168, 76, 0.02) 22px
);
```

### Dot Grid / Scanline (Optional)

For data-heavy sections or "terminal" vibes:
```css
background-image: radial-gradient(circle, var(--steel) 1px, transparent 1px);
background-size: 20px 20px;
```

---

## Component Patterns

### Stats Display

Large numerals + condensed labels:
```
┌──────────────────────────────────┐
│  4.8        340+       2019      │
│  RATING     REVIEWS    FOUNDED   │
└──────────────────────────────────┘
```

- Numbers: display font, 36–64px, accent/brass color
- Labels: display font, 10–11px, 0.2em spacing, uppercase, muted color
- Layout: `flex` with generous gap (24–48px)

### Numbered Step Rows

```
┌─────┬──────────────┬──────────────────────────────────┐
│ 01  │ Step Title   │ Description text                  │
├─────┼──────────────┼──────────────────────────────────┤
│ 02  │ Step Title   │ Description text                  │
└─────┴──────────────┴──────────────────────────────────┘
```

- Number: display font, 40–50px, accent at 40% opacity → full on hover
- Grid: `grid-cols-[4rem_12rem_1fr]`
- Rows separated by `border-top: 1px solid var(--border)`

### Feature Items (Left-Border)

```css
.feature-item {
  border-left: 3px solid var(--rust);
  padding: 20px 16px;
  font-family: var(--display);
  font-size: 13px;
  text-transform: uppercase;
}
```

### Tag Pills

```css
/* Warm palette */
.tag { border: 1px solid rgba(var(--accent), 0.3); padding: 6px 16px; font-size: 11px; text-transform: uppercase; }

/* Dark palette */
.tag { border: 1px solid var(--border); padding: 4px 12px; font-size: 10–12px; }
.tag:hover { border-color: var(--accent); color: var(--accent); }
```

### Nav Bar

```
┌──────────────────────────────────────────────────┐
│  LOGO NAME          About   Menu   Contact       │
│──────────────────── 3px accent rule ─────────────│
```

- Sticky, dark background
- Logo: display font, 14–16px, uppercase, 0.08em spacing
- Links: display font, 11–12px, uppercase, 0.12em spacing, opacity 0.7 → 1 on hover
- Bottom border: 3px solid accent

---

## Dark Mode Adaptation Guide

When applying American Industrial to a dark palette:

| Warm (Light) | Dark Equivalent | Notes |
|-------------|-----------------|-------|
| Cream bg `#F0EDE7` | Navy bg `#0a0e27` | Deep, not pure black |
| Surface `#E8E4DC` | Elevated `#121733` | Cards, nav |
| Steel `#4A4A48` | Border `#1f2547` | Structural lines |
| Rust `#B8542C` | {company} `#6366f1` | Primary accent |
| Brass `#C9A84C` | Light {company} `#818cf8` | Secondary accent |
| Dark `#2C2A26` | Card `#1a1f3d` | Nested surfaces |
| Text `#2C2A26` | Text `#e8ebff` | Primary text |
| Muted `#7A766E` | Dim `#8b92c4` | Secondary text |
| Cream text `#F7F4EE` | White `#ffffff` | Text on accent fills |

**Same rules apply:** no gradients, no glows, square corners, structural rules, heavy display type.

---

## Anti-Patterns (What This Is NOT)

| ❌ Pattern | Why It Fails |
|-----------|-------------|
| Purple/violet gradients on dark bg | Generic AI dark theme, not industrial |
| `text-transparent bg-clip-text bg-gradient` | Gradient text is decorative, not structural |
| `box-shadow: 0 0 30px rgba(accent, 0.3)` | Glowing elements are sci-fi, not industrial |
| `border-radius: 12px+` | Rounded = soft = not industrial |
| Centered everything | Industrial is left-aligned, asymmetric |
| System fonts | No personality, no weight |
| Monospace labels | Lazy "technical" shorthand — use condensed display instead |
| Background illustrations/blobs | Industrial uses text + rules, not artwork |
| `backdrop-filter: blur()` | Glass morphism is the opposite of industrial honesty |
| Floating cards with excessive shadows | Industrial cards use borders, not shadows |

---

## Reference Implementation

A complete HTML template demonstrating every pattern is available at:
`repos/private/keptwork-site/src/templates/american-industrial.html`

This template implements: nav with accent rule, hero with display type + stats + diagonal stripes, band/ticker, split layout, industrial grid (shared borders), dark review section, motion primitives (scroll-reveal, stagger, text-reveal, hover-lift), and responsive breakpoints.

## Project References

| Project | Palette | Key Patterns |
|---------|---------|-------------|
| `keptwork-industrial-redesign` | Warm (rust/brass/cream) | Full homepage, agent feed, stats grid, services |
| `keptwork-brass-hands` | Dark (matches extension) | Texture system, terminal widget, card tilt, easter eggs |
| `annotated` | Dark (navy/{company}) | Editorial hero, bento capabilities, image-first archive grid |
