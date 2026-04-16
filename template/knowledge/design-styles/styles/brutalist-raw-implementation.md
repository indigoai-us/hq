---
name: brutalist-raw
description: Brutalist Raw design style pack — exposed structure, system fonts, acid accents, anti-polish. Use when the brief calls for "raw", "punk", "hacker", "avant-garde", or "deliberate ugliness as luxury signal".
---

# Brutalist Raw Design — Style Pack

A codified design language rooted in web brutalism and béton brut architecture. Structural honesty is the aesthetic — everything is visible, nothing is softened. System fonts, pure primaries, exposed grid lines, and hard-cut interactions. This is not ugly by accident; it is unpolished by conviction.

**When to use:** Any time the design direction calls for "raw", "punk", "hacker", "avant-garde", "anti-design", "zine aesthetic", or "deliberate ugliness as luxury signal". Works for portfolios, editorial sites, experimental agencies, music/art platforms, and any project where conspicuous refinement would be a lie.

**Prerequisite:** Load `frontend-design` SKILL.md first for general design principles. This skill layers on top as a specific aesthetic direction.

---

## Core Philosophy

Brutalist Raw design is about **structural honesty**. No element is hidden behind decoration. The grid is visible. The type is system-sourced. The colors are primary. Every design decision is a refusal — a refusal to sand, polish, or prettify.

**Three pillars:**
1. **Exposure** — structure is shown, not hidden. Grid lines, borders, and raw HTML-like visual logic are legible features, not implementation details
2. **Refusal** — no gradients, no shadows, no blur, no rounded corners. Each banned element is a deliberate stance
3. **Aggression** — color is used at full saturation. Type is oversized or system-default. Nothing is neutral

**The feeling:** A photocopied zine, a 1996 university homepage, a ransom note typeset in Arial, a gallery show with the scaffolding still up. Simultaneously cheap and intentional.

---

## Typography System

### Font Stack

| Role | Primary | Fallback | Notes |
|------|---------|----------|-------|
| Display | **Arial Black** or **Impact** | system-ui, sans-serif | All-caps, no tracking adjustment — raw default |
| Body | **Courier New** or **Times New Roman** | Georgia, serif | Dense, default leading; monospace preferred for data-heavy copy |
| Accent/Error | **Arial** or **Helvetica** | system-ui | Used for error-label UI elements, timestamps, file paths |

### Type Scale

```
Hero headline:     clamp(64px, 12vw, 180px)   — Arial Black / Impact, uppercase, line-height 0.85
Section title:     clamp(32px, 5vw, 72px)      — Arial Black, uppercase, line-height 0.9
Card heading:      24–32px                      — Arial Black or Impact, uppercase
Body text:         16px                         — Courier New, line-height 1.4 (dense, not generous)
Label/Error:       11–13px                      — Arial, uppercase, no extra tracking
Caption/Data:      11–12px                      — Courier New or Arial, uppercase
```

### Type Rules

- **Headlines are ALWAYS uppercase** — mixed case reads as designed, uppercase reads as shouted
- **No letter-spacing adjustments on display type** — brutalism uses raw default tracking, not curated spacing
- **Line-height tight on display (0.85–0.95):** words stack, not float
- **Body text dense (1.4):** no airy whitespace. Information density is the goal
- **System fonts are the point** — Arial and Courier New are chosen because they are unglamorous. Their banality is the message
- **Oversized type as primary layout:** 10vw+ headlines that break the container are features, not bugs
- **Monospace for non-code content:** using `<pre>` tags or Courier New for running text signals rawness

### Typography Anti-Patterns

- ❌ Designed display fonts (Söhne, Neue Haas, GT America) — too curated, defeats the aesthetic
- ❌ Custom letter-spacing on headlines — Brutalism uses type as-found, not as-adjusted
- ❌ Line-height above 1.6 for body — generous spacing reads as polished
- ❌ Mixed serif/sans pairing for sophistication — use one system font family aggressively
- ❌ Italic as style choice — italic is for `<em>`, not aesthetics. Brutalism has no italics

---

## Color Palettes

### Light Palette (Raw White — "Newsprint")

```css
:root {
  --bg: #FFFFFF;           /* pure white — no warmth, no cream */
  --surface: #F0F0F0;      /* exposed gray for elevated surfaces */
  --border: #000000;       /* pure black borders — 1px solid structural lines */
  --text: #000000;         /* pure black text */
  --muted: #555555;        /* secondary text — no softness, just lessened contrast */
  --accent-green: #00FF00; /* acid green — primary accent */
  --accent-pink: #FF00FF;  /* magenta — alert / destructive / highlight */
  --accent-yellow: #FFFF00;/* traffic yellow — warning / marker */
  --accent-red: #FF0000;   /* pure primary red — error / emphasis */
  --invert: #000000;       /* background for inverted sections */
  --invert-text: #FFFFFF;  /* text on inverted sections */
}
```

### Dark Palette (Raw Black — "Terminal")

```css
:root {
  --bg: #000000;           /* pure black — no depth, no navy */
  --surface: #111111;      /* barely-elevated surface for cards */
  --border: #FFFFFF;       /* pure white borders on black */
  --text: #FFFFFF;         /* pure white text */
  --muted: #999999;        /* secondary text */
  --accent-green: #00FF00; /* acid green — same accent, same voltage */
  --accent-pink: #FF00FF;  /* magenta — unchanged */
  --accent-yellow: #FFFF00;/* yellow — unchanged */
  --accent-red: #FF0000;   /* red — unchanged */
  --invert: #FFFFFF;       /* background for inverted sections */
  --invert-text: #000000;  /* text on inverted sections */
}
```

### Color Rules

- **Primaries at full saturation only** — #00FF00 not #3ecf3e. The violence of the color is the point
- **Accent used for information, not beauty:** error labels, active states, data callouts, hover inversions
- **One accent per view** — if acid green is the primary accent, magenta is for alerts only. Don't stack saturated primaries
- **No gradients. No transparency on backgrounds.** Flat fills, flat text, flat borders
- **Color inversion is a valid interaction pattern** — black bg becomes white bg on hover; text inverts accordingly
- **Inverted sections (black on white site):** use `background: #000000; color: #FFFFFF` — no blending, no fade

---

## Layout Patterns

### Structural Grid

```
Max width: none (full-bleed by default) or 1440px maximum
Padding: 0 or 16px sides — never generous. Content bleeds to edge
Section padding: 48px vertical (desktop), 24–32px (mobile)
Gap: 0 (shared borders) or 1px (gap technique)
```

### Exposed Grid (Shared Borders)

The brutalist signature. Grid lines are visible as design elements — no gap, border is the grid:

```css
.raw-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 0;
  border: 1px solid var(--border);
}

.raw-grid > * {
  border: 1px solid var(--border);
  padding: 24px 20px;
}
```

### Table-as-Layout

Tables used as primary structural device — not for data, for layout:

```css
.layout-table {
  width: 100%;
  border-collapse: collapse;
  border: 1px solid var(--border);
}

.layout-table td {
  border: 1px solid var(--border);
  padding: 20px;
  vertical-align: top;
}

.layout-table td:first-child {
  width: 80px;
  font-family: "Courier New", monospace;
  font-size: 11px;
  color: var(--muted);
  white-space: nowrap;
}
```

### Full-Bleed Typography

No `max-width` on headlines. Type breaks the container. This is not a bug:

```css
.hero-headline {
  font-family: "Arial Black", "Impact", system-ui, sans-serif;
  font-size: clamp(64px, 12vw, 180px);
  font-weight: 900;
  text-transform: uppercase;
  line-height: 0.85;
  letter-spacing: 0;
  color: var(--text);
  margin: 0;
  padding: 0;
  overflow-wrap: break-word;
  word-break: break-all; /* intentional overflow is fine */
}
```

### Zero-Ceremony Start

No hero section. No introductory whitespace. Content at pixel 0:

```css
body {
  margin: 0;
  padding: 0;
}

.page-start {
  border-bottom: 1px solid var(--border);
  padding: 16px;
}
```

---

## Structural Elements

### Rules (Dividers)

The most brutalist element. `<hr>` used without styling — or with exactly 1px:

| Element | CSS | When |
|---------|-----|------|
| Raw rule | `border: none; border-top: 1px solid var(--border); margin: 0;` | Between every section, used aggressively |
| Thick rule | `border: none; border-top: 4px solid var(--border); margin: 0;` | Major section breaks |
| Accent rule | `border: none; border-top: 4px solid var(--accent-green); margin: 0;` | Single high-emphasis marker per page |
| Terminal rule | `border: none; border-top: 1px solid var(--accent-green); margin: 0;` | Inside dark/terminal sections |

### Error-Label Blocks

The brutalist alternative to accent bars. Labels styled as system error messages — 404, WARNING, STATUS:

```html
<div class="error-label">ERROR_404</div>
<h2 class="section-title">WORK THAT DOESN'T EXIST YET</h2>
```

```css
.error-label {
  display: inline-block;
  font-family: "Courier New", monospace;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  color: var(--accent-red);
  border: 1px solid var(--accent-red);
  padding: 3px 8px;
  margin-bottom: 12px;
  letter-spacing: 0;
}
```

### Border Treatments

- **Full-box border:** `border: 1px solid var(--border)` on every card, every section, every element — nothing floats without containment
- **Left-pipe accent:** `border-left: 4px solid var(--accent-green)` on blockquotes, highlighted content
- **Double border (nested):** outer container `border: 1px solid var(--border)`, inner element `border: 1px solid var(--border)` at 8px inset — visible structural frame
- **No `border-radius` anywhere** — `border-radius: 0` is mandatory

### Labels

Brutalist labels look like filesystem paths, terminal output, or HTTP status codes:

```css
.section-label {
  font-family: "Courier New", monospace;
  font-size: 11px;
  font-weight: 400;
  text-transform: uppercase;
  color: var(--muted);
  display: block;
  margin-bottom: 8px;
}

.section-label--accent {
  color: var(--accent-green);
}
```

Pattern: `LABEL → TITLE → RULE → CONTENT`
Label examples: `SECTION_01`, `STATUS: ACTIVE`, `TYPE: WORK`, `/projects/2024/`, `[LOADING...]`

---

## Button Patterns

### Primary (Inverted Fill)

```css
.btn-primary {
  font-family: "Arial Black", "Impact", system-ui, sans-serif;
  font-size: 13px;
  font-weight: 900;
  letter-spacing: 0;
  text-transform: uppercase;
  padding: 12px 28px;
  background: var(--text);         /* black on light, white on dark */
  border: 2px solid var(--text);
  color: var(--bg);                /* inverted text */
  border-radius: 0;
  cursor: crosshair;               /* brutalist cursor convention */
  display: inline-block;
  text-decoration: none;
}

.btn-primary:hover {
  background: var(--accent-green);
  border-color: var(--accent-green);
  color: #000000;
}
```

### Secondary (Raw Outline)

```css
.btn-secondary {
  font-family: "Arial", "Helvetica", system-ui, sans-serif;
  font-size: 13px;
  font-weight: 700;
  text-transform: uppercase;
  padding: 12px 28px;
  background: transparent;
  border: 2px solid var(--border);
  color: var(--text);
  border-radius: 0;
  cursor: crosshair;
}

.btn-secondary:hover {
  background: var(--text);
  color: var(--bg);
}
```

### Destructive / Alert Button

```css
.btn-alert {
  font-family: "Courier New", monospace;
  font-size: 13px;
  font-weight: 700;
  text-transform: uppercase;
  padding: 12px 28px;
  background: var(--accent-red);
  border: 2px solid var(--accent-red);
  color: #FFFFFF;
  border-radius: 0;
  cursor: crosshair;
}

.btn-alert:hover {
  background: #000000;
  color: var(--accent-red);
  border-color: var(--accent-red);
}
```

### Button Rules

- **NEVER rounded.** `border-radius: 0` everywhere, always
- **Cursor must be `crosshair`** — the default pointer cursor is too polished
- **Hover is inversion** — not opacity fade, not color shift. Full inversion
- **No shadows.** `box-shadow: none` on all interactive elements
- **Underlines on links** — styled like HTML defaults. `text-decoration: underline` is authentic
- **Blinking is allowed** — `animation: blink 1s step-end infinite` on active states is legitimate

---

## Motion Primitives

All motion is CSS only — no easing curves, no spring physics. Brutalist motion is either instant (hard cut) or mechanically linear. **Zero external libraries.**

### Scroll Reveal (Hard Cut)

No smooth fade. Elements snap into view:

```css
[data-motion="snap-reveal"] {
  opacity: 0;
  visibility: hidden;
}

[data-motion="snap-reveal"].is-visible {
  opacity: 1;
  visibility: visible;
  transition: none; /* hard cut — no interpolation */
}
```

### Scroll Reveal (Linear Allowed)

When transition is used, it must be linear — no easing:

```css
[data-motion="linear-reveal"] {
  opacity: 0;
  transform: translateY(20px);
  transition: opacity 0.2s linear,
              transform 0.2s linear;
}

[data-motion="linear-reveal"].is-visible {
  opacity: 1;
  transform: translateY(0);
}
```

### Stagger Children (Hard Cut)

```javascript
document.querySelectorAll('[data-motion="stagger-parent"]').forEach((container) => {
  const children = container.querySelectorAll('[data-motion="stagger-child"]');
  children.forEach((child, i) => {
    child.style.animationDelay = (i * 80) + 'ms';
    child.style.animationFillMode = 'both';
  });
});
```

```css
[data-motion="stagger-child"] {
  animation: brutal-appear 0s linear both;
}

@keyframes brutal-appear {
  from { opacity: 0; }
  to   { opacity: 1; }
}
```

### Text Reveal (Clip — Linear)

```css
[data-motion="text-reveal"] {
  overflow: hidden;
}

[data-motion="text-reveal"] > span {
  display: block;
  transform: translateY(100%);
  transition: transform 0.15s linear;
}

[data-motion="text-reveal"].is-visible > span {
  transform: translateY(0);
}
```

### Hover — Color Inversion

```css
[data-motion="hover-invert"] {
  transition: background 0s, color 0s; /* instant — no lerp */
}

[data-motion="hover-invert"]:hover {
  background: var(--text);
  color: var(--bg);
}
```

### Hover — Acid Flash

```css
[data-motion="hover-flash"]:hover {
  background: var(--accent-green);
  color: #000000;
  transition: none; /* hard cut */
}
```

### Marquee / Ticker (CSS only)

```css
.marquee {
  overflow: hidden;
  white-space: nowrap;
  border-top: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  padding: 8px 0;
}

.marquee__inner {
  display: inline-block;
  animation: marquee-scroll 12s linear infinite;
  font-family: "Courier New", monospace;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0;
}

@keyframes marquee-scroll {
  from { transform: translateX(0); }
  to   { transform: translateX(-50%); }
}
```

### Blink (Active States)

```css
@keyframes blink {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0; }
}

.cursor-blink {
  animation: blink 1s step-end infinite;
}
```

### Motion Rules

- **Always respect `prefers-reduced-motion`** — disable all animation and transition when set

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

- **No easing curves** — `linear` or `step-end` only. `cubic-bezier` and `ease-in-out` are banned
- **No bounce, no spring, no overshoot** — mechanical and precise, or instant
- **Hover states are instant** — `transition: none` on hover is the brutalist default
- **Marquee/ticker is always allowed** — it is a signature brutalist interaction
- **Blinking cursors on inputs** — `caret-color: var(--accent-green)` with CSS blink

---

## Texture & Grain

### Maximum Opacity Grain

Grain in brutalist design is not subtle. It is loud. Use visible noise:

```css
.grain::after {
  content: "";
  position: fixed;
  inset: 0;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 512 512' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E");
  background-repeat: repeat;
  background-size: 200px;
  pointer-events: none;
  z-index: 9999;
  opacity: 0.08; /* visible but not obscuring — increase to 0.15 for maximum rawness */
  mix-blend-mode: multiply;
}
```

### Newsprint Halftone Pattern

For section backgrounds — a printing-press texture:

```css
.halftone-bg {
  background-image: radial-gradient(circle, var(--border) 1px, transparent 1px);
  background-size: 6px 6px;
  background-color: var(--bg);
}
```

### Static / TV Noise (CSS only)

For terminal or error sections:

```css
.static-bg {
  background-image:
    repeating-linear-gradient(
      0deg,
      transparent,
      transparent 2px,
      rgba(0, 0, 0, 0.03) 2px,
      rgba(0, 0, 0, 0.03) 4px
    );
}
```

### Scanline Overlay

Retro monitor effect for dark sections:

```css
.scanlines::after {
  content: "";
  position: absolute;
  inset: 0;
  background: repeating-linear-gradient(
    to bottom,
    transparent 0px,
    transparent 2px,
    rgba(0, 0, 0, 0.08) 2px,
    rgba(0, 0, 0, 0.08) 4px
  );
  pointer-events: none;
  z-index: 1;
}
```

---

## Component Patterns

### Stats Display

Brutalist stats use monospace labels and full-saturation numbers — no soft accents:

```
┌────────────────────────────────────────────┐
│  01/  REVENUE      02/  CLIENTS    03/  YR │
│  $2.4M             340+            2019     │
│────────────────────────────────────────────│
```

```css
.stats-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  border: 1px solid var(--border);
}

.stat-item {
  border-right: 1px solid var(--border);
  padding: 20px 16px;
}

.stat-item:last-child {
  border-right: none;
}

.stat-label {
  font-family: "Courier New", monospace;
  font-size: 10px;
  text-transform: uppercase;
  color: var(--muted);
  display: block;
  margin-bottom: 8px;
}

.stat-value {
  font-family: "Arial Black", "Impact", system-ui, sans-serif;
  font-size: clamp(28px, 4vw, 52px);
  font-weight: 900;
  line-height: 1;
  color: var(--accent-green);
}
```

### Error-Label Section Block

The brutalist signature: section headers styled as system error output:

```
┌──────────────────────────────────────────────────────┐
│  [ERROR_001]  ABOUT                                  │
│  STATUS: ACTIVE                                      │
│──────────────────────────────────────────────────────│
│  Content content content content content content     │
│  content content content content content.            │
└──────────────────────────────────────────────────────┘
```

```html
<section class="error-section">
  <header class="error-section__header">
    <span class="error-code">[ERROR_001]</span>
    <h2 class="error-title">ABOUT</h2>
    <span class="error-status">STATUS: ACTIVE</span>
  </header>
  <div class="error-section__body">
    <p>Content here.</p>
  </div>
</section>
```

```css
.error-section {
  border: 1px solid var(--border);
}

.error-section__header {
  display: flex;
  align-items: baseline;
  gap: 16px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  background: var(--text);
  color: var(--bg);
}

.error-code {
  font-family: "Courier New", monospace;
  font-size: 11px;
  font-weight: 700;
}

.error-title {
  font-family: "Arial Black", system-ui, sans-serif;
  font-size: 16px;
  font-weight: 900;
  text-transform: uppercase;
  margin: 0;
}

.error-status {
  font-family: "Courier New", monospace;
  font-size: 10px;
  color: var(--accent-green);
  margin-left: auto;
}

.error-section__body {
  padding: 20px 16px;
  font-family: "Courier New", monospace;
  font-size: 15px;
  line-height: 1.4;
}
```

### Numbered Step Rows (Table Layout)

```
┌──────┬──────────────────┬────────────────────────────────────┐
│  01  │  STEP TITLE      │  Description of step goes here.    │
├──────┼──────────────────┼────────────────────────────────────┤
│  02  │  STEP TITLE      │  Description of step goes here.    │
├──────┼──────────────────┼────────────────────────────────────┤
│  03  │  STEP TITLE      │  Description of step goes here.    │
└──────┴──────────────────┴────────────────────────────────────┘
```

```css
.step-table {
  width: 100%;
  border-collapse: collapse;
  border: 1px solid var(--border);
}

.step-table td {
  border: 1px solid var(--border);
  padding: 16px 20px;
  vertical-align: top;
}

.step-number {
  font-family: "Arial Black", system-ui, sans-serif;
  font-size: clamp(24px, 3vw, 40px);
  font-weight: 900;
  color: var(--muted);
  width: 64px;
  white-space: nowrap;
}

.step-title {
  font-family: "Arial Black", system-ui, sans-serif;
  font-size: 14px;
  font-weight: 900;
  text-transform: uppercase;
  width: 160px;
  white-space: nowrap;
}

.step-body {
  font-family: "Courier New", monospace;
  font-size: 14px;
  line-height: 1.4;
  color: var(--text);
}
```

### Tag Pills (Raw)

```css
.tag {
  display: inline-block;
  font-family: "Courier New", monospace;
  font-size: 11px;
  text-transform: uppercase;
  border: 1px solid var(--border);
  padding: 4px 10px;
  margin: 2px;
  color: var(--text);
  background: transparent;
  cursor: crosshair;
  border-radius: 0;
}

.tag:hover {
  background: var(--text);
  color: var(--bg);
  transition: none;
}

.tag--accent {
  border-color: var(--accent-green);
  color: var(--accent-green);
}

.tag--accent:hover {
  background: var(--accent-green);
  color: #000000;
}
```

### Nav Bar

```
┌────────────────────────────────────────────────────────────┐
│  SITENAME.EXE          /work    /about    /contact   [GO]  │
└────────────────────────────────────────────────────────────┘
   1px solid border at bottom
```

```css
.nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  background: var(--bg);
  position: sticky;
  top: 0;
  z-index: 100;
}

.nav__logo {
  font-family: "Arial Black", "Courier New", monospace;
  font-size: 14px;
  font-weight: 900;
  text-transform: uppercase;
  text-decoration: none;
  color: var(--text);
  letter-spacing: 0;
}

.nav__links {
  display: flex;
  gap: 0;
  list-style: none;
  margin: 0;
  padding: 0;
}

.nav__links a {
  font-family: "Courier New", monospace;
  font-size: 12px;
  text-transform: uppercase;
  text-decoration: none;
  color: var(--text);
  padding: 8px 16px;
  border-left: 1px solid var(--border);
  display: block;
}

.nav__links a:hover {
  background: var(--text);
  color: var(--bg);
}

.nav__cta {
  font-family: "Arial Black", system-ui, sans-serif;
  font-size: 12px;
  font-weight: 900;
  text-transform: uppercase;
  padding: 8px 16px;
  background: var(--text);
  color: var(--bg);
  border: 1px solid var(--text);
  border-radius: 0;
  cursor: crosshair;
}

.nav__cta:hover {
  background: var(--accent-green);
  color: #000000;
  border-color: var(--accent-green);
  transition: none;
}
```

---

## Dark Mode Adaptation Guide

Brutalist Raw dark mode is not a softened dark theme — it is the same system with the polarity reversed. Black becomes white; white becomes black. Accents are identical.

| Light (Newsprint) | Dark (Terminal) | Notes |
|-------------------|-----------------|-------|
| Background `#FFFFFF` | Background `#000000` | Pure polarity flip. No navy, no charcoal |
| Surface `#F0F0F0` | Surface `#111111` | Barely visible elevation |
| Border `#000000` | Border `#FFFFFF` | Structural lines invert |
| Text `#000000` | Text `#FFFFFF` | Pure inversion |
| Muted `#555555` | Muted `#999999` | Secondary text, same perceived contrast |
| Accent green `#00FF00` | Accent green `#00FF00` | Identical — acid green works on both |
| Accent pink `#FF00FF` | Accent pink `#FF00FF` | Identical |
| Accent yellow `#FFFF00` | Accent yellow `#FFFF00` | Identical |
| Accent red `#FF0000` | Accent red `#FF0000` | Identical |
| Invert section bg `#000000` | Invert section bg `#FFFFFF` | Sections flip to opposite pole |
| Invert section text `#FFFFFF` | Invert section text `#000000` | Text follows |

**Same rules apply in dark mode:** no gradients, no blur, no rounded corners, no glows. Grain overlay renders in `multiply` blend mode — switch to `screen` for dark backgrounds.

---

## Anti-Patterns (What This Is NOT)

| ❌ Pattern | Why It Fails |
|-----------|-------------|
| Rounded corners (`border-radius > 0`) | Softness is the anti-brutalist sin. Every radius is a betrayal |
| Gradients of any kind | Gradients are decorative interpolation — brutalism has no interpolation |
| `box-shadow` with spread | Floating elements contradict structural honesty. Use borders |
| `backdrop-filter: blur()` | Glass morphism is the polar opposite of raw exposure |
| Designed/licensed display fonts (Söhne, Neue Haas) | System fonts are the material. Designer fonts are curation |
| Easing curves on hover (`cubic-bezier`, `ease-in-out`) | Mechanical transitions only. Smooth hover = polish = disqualified |
| `opacity` tweens for section transitions | Fade-ins are refinement. Use hard cuts or linear only |
| Color palette with warmth or tint (navy, cream, warm gray) | Brutalist palette is pure primaries, black, and white only |
| Spacing `> 24px` on mobile without content justification | Generous whitespace signals luxury. Density signals rawness |
| `cursor: pointer` on interactive elements | Crosshair is the brutalist cursor convention. Pointer reads as polished |
| SVG illustrations or custom icons | System emoji, ASCII art, or text-based iconography only |
| `transition-timing-function: spring` or any JS physics | Brutalism does not simulate physics. Hard cuts or linear only |

---
