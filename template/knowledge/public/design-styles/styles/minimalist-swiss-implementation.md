---
name: minimalist-swiss
description: Minimalist Swiss design style pack — Müller-Brockmann / Vignelli / Rams inspired. Mathematical grid, one-typeface discipline, functional whitespace, hairline rules, and numbered indices. Use for SaaS products, developer tools, design-forward agencies, and any project that communicates through clarity.
---

# Minimalist Swiss Design — Style Pack

A codified design language drawn from the Swiss/International Typographic Style — Josef Müller-Brockmann's grid discipline, Massimo Vignelli's typographic objectivity, and Dieter Rams's functional restraint. This guide provides a complete visual system — typography, color, layout, motion, and component patterns — for any project that must communicate before it is read.

**When to use:** Any time the design direction calls for "Swiss", "Bauhaus", "modernist", "systematic", "functional", "precision-engineered", "clear", or "considered minimalism." Works for SaaS dashboards, developer tools, design agency portfolios, fintech, and premium product marketing. Modern practitioners include Apple, Linear, Vercel, and Stripe.

**Prerequisite:** Load `frontend-design` SKILL.md first for general design principles. This guide layers on top as a specific aesthetic direction.

---

## Core Philosophy

Minimalist Swiss design is about **information architecture as visual form**. The grid is not invisible scaffolding — it is the design. Every margin, column, and interval is a decision. Typography alone creates hierarchy; no decorative additions are needed or welcome.

**Three pillars:**
1. **Objectivity** — design serves the message, not the designer. Remove everything that does not contribute to meaning
2. **Grid discipline** — the 12-column mathematical grid is the creative constraint that generates beauty through alignment
3. **Typographic hierarchy** — one typeface, varied in size and weight, creates all visual distinction

**The feeling:** Opening a Vignelli-designed annual report. The silence before someone speaks who always says precisely the right thing. Confident restraint. Every element where it is because it must be there.

---

## Typography System

### Font Stack

| Role | Primary | Fallback | Notes |
|------|---------|----------|-------|
| Display + Body | **Inter** | Helvetica Neue, Arial, sans-serif | One family throughout — this is the discipline |
| Metadata / Code | **IBM Plex Mono** | JetBrains Mono, monospace | Dates, indices, version numbers, code only |

**Google Fonts import:**
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;700&family=IBM+Plex+Mono:wght@300;400&display=swap" rel="stylesheet">
```

```css
:root {
  --font-sans: 'Inter', 'Helvetica Neue', Arial, sans-serif;
  --font-mono: 'IBM Plex Mono', 'JetBrains Mono', monospace;
}
```

### Type Scale

```
Hero headline:    clamp(48px, 8vw, 120px)   — Inter 700, line-height 0.90, tracking -0.03em
Section title:    clamp(32px, 4vw, 52px)    — Inter 700, line-height 1.0, tracking -0.02em
Subheading:       clamp(20px, 2.5vw, 28px)  — Inter 400, line-height 1.2, tracking -0.01em
Body text:        17px                       — Inter 400, line-height 1.7, tracking 0
Label/category:   12px                       — Inter 500, line-height 1, tracking 0.08em, uppercase
Metadata:         12–13px                    — IBM Plex Mono 300–400, line-height 1, tracking 0
Pull quote:       clamp(28px, 4vw, 48px)    — Inter 300, line-height 1.15, tracking -0.01em
Index number:     clamp(40px, 6vw, 80px)    — Inter 300, line-height 1, tracking -0.04em
Caption:          12px                       — Inter 400, line-height 1.5, color muted
```

### Type Rules

- **One typeface, always** — Inter handles every role through weight and size variation alone. IBM Plex Mono appears only for genuinely technical content (dates, indices, code, version strings)
- **Weight contrast is the hierarchy** — 700 (Bold) for headlines, 400 (Regular) for body, 300 (Light) for indices and pull quotes, 500 (Medium) for labels
- **Sentence case preferred** — not all-caps for headlines. Labels and metadata use uppercase; headlines use sentence case. This is the Swiss way
- **Tight tracking on large type** — `letter-spacing: -0.02em` to `–0.04em` at display scale creates print-like density
- **Strict measure** — body text columns must not exceed 65–70 characters per line. Use `max-width: 66ch` to enforce
- **No italic for decoration** — italic is reserved for functional use (foreign terms, citations). Headlines are never italic
- **Tabular figures** — use `font-variant-numeric: tabular-nums` on all numerical data

### Typography Anti-Patterns

- ❌ Multiple typefaces — the discipline is one family. A second sans is clutter, not contrast
- ❌ All-caps headlines — labels use all-caps, headlines do not. This distinction is structural
- ❌ Bold body text for emphasis — use a structural hierarchy change, not inline bold
- ❌ Tight line-height on body — body copy must breathe at 1.65 minimum
- ❌ Decorative or display fonts — Swiss design uses workhorse grotesques, not expressive faces
- ❌ Italic at display scale — Inter light at large scale communicates restraint. Italic decorates

---

## Color Palettes

### Primary Palette (Light)

```css
:root {
  --font-sans: 'Inter', 'Helvetica Neue', Arial, sans-serif;
  --font-mono: 'IBM Plex Mono', 'JetBrains Mono', monospace;

  --color-bg:           #FAFAFA;              /* near-white — primary surface */
  --color-bg-alt:       #F4F4F2;              /* warm light gray — alternate sections */
  --color-text:         #111111;              /* near-black — primary text */
  --color-text-secondary: #444444;            /* charcoal — secondary text */
  --color-text-tertiary:  #888888;            /* medium gray — captions, metadata */
  --color-accent:       #3B6FDB;              /* muted steel blue — one restrained accent */
  --color-divider:      #E5E5E5;              /* light gray — hairline rules */
  --color-surface:      #FFFFFF;              /* pure white — cards, elevated surfaces */
}
```

### Dark Mode Palette

```css
/* Explicit dark theme (via data-theme attribute toggle) */
:root[data-theme="dark"] {
  --color-bg:             #111111;
  --color-bg-alt:         #1A1A1A;
  --color-text:           #FAFAFA;
  --color-text-secondary: #BBBBBB;
  --color-text-tertiary:  #777777;
  --color-accent:         #5B8FFF;
  --color-divider:        #2A2A2A;
  --color-surface:        #1A1A1A;
}

/* OS-level dark preference */
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --color-bg:             #111111;
    --color-bg-alt:         #1A1A1A;
    --color-text:           #FAFAFA;
    --color-text-secondary: #BBBBBB;
    --color-text-tertiary:  #777777;
    --color-accent:         #5B8FFF;
    --color-divider:        #2A2A2A;
    --color-surface:        #1A1A1A;
  }
}
```

### Color Rules

- **Monochrome foundation** — the palette is near-white, near-black, and two or three gray steps. That's it
- **One accent, used sparingly** — the steel blue appears on interactive elements (links, active states, one structural marker per section). Never as background fills; never competing with itself
- **No fills for section separation** — use hairline rules and whitespace to separate sections, not background color bands
- **Opacity for tertiary text** — `--color-text-tertiary: #888888` handles captions and metadata. Do not add a fourth text color
- **No gradients anywhere** — backgrounds are flat, solid fields. This is non-negotiable

---

## Layout Patterns

### Structural Grid

```
Max width:       1200px (standard) or 1440px (spacious)
Column system:   12 columns, 24px gutter
Page padding:    clamp(24px, 5vw, 80px) sides
Section padding: 100px vertical (desktop), 64px (mobile)
Measure limit:   66ch for body text columns
```

### 12-Column CSS Grid

```css
.swiss-grid {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  gap: 24px;
  max-width: 1200px;
  margin-inline: auto;
  padding-inline: clamp(24px, 5vw, 80px);
}

/* Standard text column: 8 of 12 */
.col-8  { grid-column: span 8; }

/* Offset text: columns 3–9, leaving margins */
.col-8-offset-2 { grid-column: 3 / 11; }

/* Full-width bleed within grid */
.col-full { grid-column: 1 / -1; }

/* Sidebar / narrow: 3 of 12 */
.col-3   { grid-column: span 3; }

/* Wide headline that dominates: 10 of 12 */
.col-10  { grid-column: span 10; }

@media (max-width: 768px) {
  .swiss-grid { grid-template-columns: repeat(4, 1fr); gap: 16px; }
  .col-8, .col-8-offset-2, .col-10, .col-3 { grid-column: 1 / -1; }
}
```

### Section Container

```css
.section {
  padding-block: 100px;
  border-top: 1px solid var(--color-divider);
}

@media (max-width: 768px) {
  .section { padding-block: 64px; }
}
```

### Asymmetric Split Layout

The signature Swiss composition: large-scale text anchored left, secondary content offset right.

```html
<section class="section">
  <div class="swiss-grid">
    <div class="split-label col-full">
      <span class="meta-label">01 / Capabilities</span>
    </div>
    <div class="split-headline" style="grid-column: 1 / 8;">
      <h2 class="display-heading">Form follows<br>function.</h2>
    </div>
    <div class="split-body" style="grid-column: 9 / 13;">
      <p class="body-text">Every decision is a design decision. The margin between this text and the headline is not an accident — it is a measured interval.</p>
    </div>
  </div>
</section>
```

```css
.display-heading {
  font-family: var(--font-sans);
  font-size: clamp(40px, 6vw, 84px);
  font-weight: 700;
  line-height: 0.92;
  letter-spacing: -0.03em;
  color: var(--color-text);
  margin: 0;
}

.body-text {
  font-family: var(--font-sans);
  font-size: 17px;
  font-weight: 400;
  line-height: 1.7;
  color: var(--color-text-secondary);
  max-width: 44ch;
}
```

### Alignment

- **Left-align by default** — flush-left creates the strong vertical axis that Swiss design depends on
- **Center alignment reserved for** — pull quotes, CTAs, single stat callouts where the number is the hero
- **Right-align sparingly** — metadata strings and page indices in the right margin create tension against left-aligned headlines
- **Never justify body text** — optical word spacing varies on screen. Ragged right is correct

---

## Structural Elements

### Rules (Dividers)

The hairline and the heavy rule are the system's punctuation:

| Element | CSS | When |
|---------|-----|------|
| Hairline rule | `height: 1px; background: var(--color-divider)` | Section borders, table rows, caption separators |
| Section rule | `height: 1px; background: var(--color-text)` | Top of major sections — full width, full weight |
| Accent rule | `height: 2px; width: 48px; background: var(--color-accent)` | Before section labels — short, structural, never decorative |

```css
.rule-hairline {
  width: 100%;
  height: 1px;
  background: var(--color-divider);
  border: none;
  margin: 0;
}

.rule-section {
  width: 100%;
  height: 1px;
  background: var(--color-text);
  border: none;
  margin: 0;
}

.rule-accent {
  width: 48px;
  height: 2px;
  background: var(--color-accent);
  border: none;
  margin-bottom: 16px;
}
```

### Numbered Index Pattern

The most recognizable Swiss signature: oversized running numbers anchoring sections as structural markers.

```html
<section class="section indexed-section">
  <div class="swiss-grid">
    <div class="index-col" style="grid-column: 1 / 2;">
      <span class="index-number" aria-hidden="true">01</span>
    </div>
    <div class="index-content" style="grid-column: 2 / 13;">
      <span class="meta-label">Services</span>
      <h2 class="section-title">What we build</h2>
      <p class="body-text">The systems that underpin how your team works, designed with the same precision as the products your customers use.</p>
    </div>
  </div>
</section>
```

```css
.index-number {
  font-family: var(--font-mono);
  font-size: clamp(40px, 6vw, 72px);
  font-weight: 300;
  line-height: 1;
  letter-spacing: -0.04em;
  color: var(--color-text-tertiary);
  display: block;
  padding-top: 4px;  /* optical alignment with label */
}

.section-title {
  font-family: var(--font-sans);
  font-size: clamp(28px, 3.5vw, 44px);
  font-weight: 700;
  line-height: 1.05;
  letter-spacing: -0.02em;
  color: var(--color-text);
  margin-block: 8px 24px;
}

.meta-label {
  font-family: var(--font-sans);
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-accent);
  display: block;
  margin-bottom: 8px;
}
```

### Metadata Row Pattern

Monospaced strings for dates, version numbers, client codes — always in IBM Plex Mono, always light weight:

```html
<div class="metadata-row">
  <span class="meta-string">2025.04.15</span>
  <span class="meta-divider" aria-hidden="true">—</span>
  <span class="meta-string">v2.4.1</span>
  <span class="meta-divider" aria-hidden="true">—</span>
  <span class="meta-string">Zurich, CH</span>
</div>
```

```css
.metadata-row {
  display: flex;
  align-items: center;
  gap: 12px;
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 300;
  color: var(--color-text-tertiary);
  letter-spacing: 0.02em;
}

.meta-divider {
  color: var(--color-divider);
}

.meta-string {
  font-variant-numeric: tabular-nums;
}
```

### Labels

Section labels: always above the title, never below.

```css
.section-label {
  font-family: var(--font-sans);
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-accent);
  display: block;
  margin-bottom: 16px;
}

/* Pattern: LABEL → TITLE → RULE → CONTENT */
```

---

## Button Patterns

### Primary (Filled)

```css
.btn-primary {
  font-family: var(--font-sans);
  font-size: 14px;
  font-weight: 500;
  letter-spacing: 0.01em;
  padding: 12px 28px;
  background: var(--color-text);
  border: 1px solid var(--color-text);
  color: var(--color-bg);
  border-radius: 0;
  cursor: pointer;
  display: inline-block;
  text-decoration: none;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}

.btn-primary:hover {
  background: var(--color-accent);
  border-color: var(--color-accent);
  color: #FFFFFF;
}
```

### Secondary (Outline)

```css
.btn-secondary {
  font-family: var(--font-sans);
  font-size: 14px;
  font-weight: 500;
  letter-spacing: 0.01em;
  padding: 11px 27px;
  background: transparent;
  border: 1px solid var(--color-divider);
  color: var(--color-text);
  border-radius: 0;
  cursor: pointer;
  display: inline-block;
  text-decoration: none;
  transition: border-color 0.15s ease, color 0.15s ease;
}

.btn-secondary:hover {
  border-color: var(--color-text);
  color: var(--color-text);
}
```

### Button Rules

- **No border-radius** — square corners only. Rounded buttons belong to app-y product aesthetics, not Swiss modernism
- **Hover is weight-based** — background fills in or shifts to accent. No scale transforms, no box shadows, no glows
- **Text is sentence case** — labels and CTAs do not need uppercase shouting
- **Generous but precise padding** — 12px 28px. Not too spacious, not cramped. Proportional
- **Primary uses page text color as fill** — near-black on near-white. The accent appears on hover only

---

## Motion Primitives

All motion is CSS + IntersectionObserver. Zero external libraries.

### Scroll Reveal — Text Fade Up

The primary scroll entrance. Subtle — a 20px lift and opacity fade, nothing dramatic.

```css
[data-motion="scroll-reveal"] {
  opacity: 0;
  transform: translateY(20px);
  transition: opacity 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94),
              transform 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}

[data-motion="scroll-reveal"].is-visible {
  opacity: 1;
  transform: translateY(0);
}

@media (prefers-reduced-motion: reduce) {
  [data-motion="scroll-reveal"] {
    opacity: 1;
    transform: none;
    transition: none;
  }
}
```

```javascript
(function() {
  var els = document.querySelectorAll('[data-motion="scroll-reveal"]');
  if (!els.length) return;

  var observer = new IntersectionObserver(function(entries) {
    entries.forEach(function(entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -32px 0px' });

  els.forEach(function(el) { observer.observe(el); });
})();
```

### Headline Clip Reveal

Headline lines sweep up from a clipped container — precise, mechanical, print-inspired.

```css
.headline-clip-wrap {
  overflow: hidden;
  display: block;
}

.headline-clip-inner {
  display: block;
  transform: translateY(105%);
  transition: transform 0.7s cubic-bezier(0.16, 1, 0.3, 1);
}

.headline-clip-wrap.is-visible .headline-clip-inner {
  transform: translateY(0);
}

@media (prefers-reduced-motion: reduce) {
  .headline-clip-inner {
    transform: none;
    transition: none;
  }
}
```

```javascript
(function() {
  var wraps = document.querySelectorAll('.headline-clip-wrap');
  if (!wraps.length) return;

  var observer = new IntersectionObserver(function(entries) {
    entries.forEach(function(entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.05 });

  wraps.forEach(function(el) { observer.observe(el); });
})();
```

### Stagger Children

Grid items enter sequentially with minimal delay intervals.

```javascript
(function() {
  var grids = document.querySelectorAll('[data-motion="stagger"]');
  if (!grids.length) return;

  grids.forEach(function(grid) {
    var items = grid.querySelectorAll('[data-motion="scroll-reveal"]');
    items.forEach(function(item, i) {
      item.style.transitionDelay = (i * 80) + 'ms';
    });

    var observer = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting) {
          entry.target.querySelectorAll('[data-motion="scroll-reveal"]').forEach(function(child) {
            child.classList.add('is-visible');
          });
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.08 });

    observer.observe(grid);
  });
})();
```

### Hover Underline (Link Style)

Swiss interaction: underline on hover, weight shift — nothing else.

```css
.swiss-link {
  color: var(--color-text);
  text-decoration: none;
  border-bottom: 1px solid var(--color-divider);
  transition: border-color 0.15s ease, color 0.15s ease;
}

.swiss-link:hover {
  color: var(--color-accent);
  border-bottom-color: var(--color-accent);
}

@media (prefers-reduced-motion: reduce) {
  .swiss-link { transition: none; }
}
```

### Motion Rules

- **Always respect `prefers-reduced-motion`** — disable all transforms and transitions. Content must be immediately visible
- **No bounce, spring, or elastic easing** — Swiss motion is precise. Use `cubic-bezier(0.25, 0.46, 0.45, 0.94)` for reveals, `cubic-bezier(0.16, 1, 0.3, 1)` for clip reveals
- **Hover states shift weight only** — underline appears, border darkens, color tints to accent. No scale, no lift, no glow
- **Stagger intervals: 60–100ms maximum** — longer delays feel theatrical, not systematic
- **No parallax** — Swiss layout is architectural, not cinematic

---

## Texture & Grain

### Subtle Background Noise

A 2–4% noise layer adds depth to flat backgrounds without breaking the zero-gradient rule.

```css
/* SVG fractalNoise technique — no external image required */
.grain-subtle::before {
  content: "";
  position: absolute;
  inset: 0;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)'/%3E%3C/svg%3E");
  background-repeat: repeat;
  background-size: 200px 200px;
  opacity: 0.025;
  pointer-events: none;
  z-index: 0;
}

/* Parent must be positioned */
.grain-subtle { position: relative; }
```

### Full-Page Grain Overlay (optional)

For landing pages where the overall surface benefits from warmth:

```css
body::after {
  content: "";
  position: fixed;
  inset: 0;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.72' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='300' height='300' filter='url(%23g)'/%3E%3C/svg%3E");
  background-repeat: repeat;
  background-size: 300px 300px;
  opacity: 0.018;
  pointer-events: none;
  z-index: 9999;
}
```

### Photography Treatment

Swiss photography is geometric, desaturated, or high-contrast black-and-white:

```css
.swiss-photo {
  filter: grayscale(0.3) contrast(1.08);
  display: block;
  width: 100%;
}

/* Full desaturate for strict Swiss mode */
.swiss-photo--mono {
  filter: grayscale(1) contrast(1.1);
}
```

### No Gradients — Enforce in Code

```css
/* Document-level protection: override any accidental gradient usage */
.no-gradient,
.no-gradient * {
  background-image: none !important;
}
```

---

## Component Patterns

### Numbered Section Index

The signature Swiss pattern: index numbers as structural anchors down the left margin.

```
┌─────────────────────────────────────────────────────────────────┐
│  01           Services                                          │
│               ────────────────────────────────────────────────  │
│               What we build         We design and build         │
│                                     systems...                  │
├─────────────────────────────────────────────────────────────────┤
│  02           Approach                                          │
│               ────────────────────────────────────────────────  │
│               How we work           Our process is...           │
└─────────────────────────────────────────────────────────────────┘
```

```html
<ol class="index-list">
  <li class="index-item" data-motion="scroll-reveal">
    <span class="index-number" aria-hidden="true">01</span>
    <div class="index-content">
      <span class="meta-label">Services</span>
      <div class="index-rule"></div>
      <div class="index-columns">
        <h3 class="index-title">What we build</h3>
        <p class="body-text">We design and build systems that work precisely because every decision was deliberate.</p>
      </div>
    </div>
  </li>
  <li class="index-item" data-motion="scroll-reveal">
    <span class="index-number" aria-hidden="true">02</span>
    <div class="index-content">
      <span class="meta-label">Approach</span>
      <div class="index-rule"></div>
      <div class="index-columns">
        <h3 class="index-title">How we work</h3>
        <p class="body-text">Process is invisible when it works. We make it invisible.</p>
      </div>
    </div>
  </li>
</ol>
```

```css
.index-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.index-item {
  display: grid;
  grid-template-columns: clamp(60px, 8vw, 100px) 1fr;
  gap: 0 24px;
  border-top: 1px solid var(--color-divider);
  padding-block: 48px;
}

.index-item:last-child {
  border-bottom: 1px solid var(--color-divider);
}

.index-number {
  font-family: var(--font-mono);
  font-size: clamp(28px, 4vw, 48px);
  font-weight: 300;
  line-height: 1;
  letter-spacing: -0.03em;
  color: var(--color-text-tertiary);
  padding-top: 3px;
}

.index-content {
  display: flex;
  flex-direction: column;
}

.index-rule {
  width: 100%;
  height: 1px;
  background: var(--color-divider);
  margin-block: 12px 24px;
}

.index-columns {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
}

.index-title {
  font-family: var(--font-sans);
  font-size: 20px;
  font-weight: 700;
  line-height: 1.1;
  letter-spacing: -0.01em;
  color: var(--color-text);
  margin: 0;
}

@media (max-width: 600px) {
  .index-columns { grid-template-columns: 1fr; }
  .index-item { grid-template-columns: 48px 1fr; }
}
```

### Pull Quote

The pull quote uses the typeface at light weight and large scale — the same font, a different register.

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  "Design is the silent ambassador of                            │
│   your brand."                                                  │
│                                                                 │
│  — Paul Rand                               meta: 1956           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

```html
<blockquote class="pull-quote" data-motion="scroll-reveal">
  <p class="pull-quote-text">"Design is the silent ambassador of your brand."</p>
  <footer class="pull-quote-footer">
    <cite class="pull-quote-attribution">— Paul Rand</cite>
    <span class="pull-quote-meta">1956</span>
  </footer>
</blockquote>
```

```css
.pull-quote {
  margin: 0;
  padding: 64px 0;
  border-top: 1px solid var(--color-divider);
  border-bottom: 1px solid var(--color-divider);
}

.pull-quote-text {
  font-family: var(--font-sans);
  font-size: clamp(28px, 4.5vw, 52px);
  font-weight: 300;
  line-height: 1.12;
  letter-spacing: -0.02em;
  color: var(--color-text);
  max-width: 20em;
  margin: 0 0 28px 0;
}

.pull-quote-footer {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}

.pull-quote-attribution {
  font-family: var(--font-sans);
  font-size: 14px;
  font-weight: 400;
  color: var(--color-text-secondary);
  font-style: normal;
}

.pull-quote-meta {
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 300;
  color: var(--color-text-tertiary);
  letter-spacing: 0.02em;
}
```

### Navigation

```
┌──────────────────────────────────────────────────────────────────┐
│  Studio Name                    Work    About    Contact          │
│──────────────────────────────────────────────────────────────────│
│  (1px hairline border below)                                     │
└──────────────────────────────────────────────────────────────────┘
```

```html
<header class="swiss-nav">
  <div class="swiss-nav-inner">
    <a href="/" class="nav-wordmark">Studio Name</a>
    <nav class="nav-links" aria-label="Primary navigation">
      <a href="/work" class="nav-link">Work</a>
      <a href="/about" class="nav-link">About</a>
      <a href="/contact" class="nav-link">Contact</a>
    </nav>
  </div>
</header>
```

```css
.swiss-nav {
  position: sticky;
  top: 0;
  z-index: 100;
  background: var(--color-bg);
  border-bottom: 1px solid var(--color-divider);
}

.swiss-nav-inner {
  display: flex;
  justify-content: space-between;
  align-items: center;
  max-width: 1200px;
  margin-inline: auto;
  padding-inline: clamp(24px, 5vw, 80px);
  height: 60px;
}

.nav-wordmark {
  font-family: var(--font-sans);
  font-size: 15px;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: var(--color-text);
  text-decoration: none;
}

.nav-links {
  display: flex;
  gap: 40px;
}

.nav-link {
  font-family: var(--font-sans);
  font-size: 14px;
  font-weight: 400;
  color: var(--color-text-secondary);
  text-decoration: none;
  border-bottom: 1px solid transparent;
  transition: color 0.15s ease, border-color 0.15s ease;
}

.nav-link:hover,
.nav-link[aria-current="page"] {
  color: var(--color-text);
  border-bottom-color: var(--color-text);
}
```

### Stats Grid

Numerical data displayed at scale — monospaced values, light sans labels.

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  240+              98%              12yr                         │
│  Projects          Retention        Practice                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

```html
<div class="stats-grid" data-motion="stagger">
  <div class="stat-item" data-motion="scroll-reveal">
    <span class="stat-value">240+</span>
    <span class="stat-label">Projects</span>
  </div>
  <div class="stat-item" data-motion="scroll-reveal">
    <span class="stat-value">98%</span>
    <span class="stat-label">Retention</span>
  </div>
  <div class="stat-item" data-motion="scroll-reveal">
    <span class="stat-value">12yr</span>
    <span class="stat-label">Practice</span>
  </div>
</div>
```

```css
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 0;
  border-top: 1px solid var(--color-divider);
}

.stat-item {
  padding: 48px 0 48px;
  border-right: 1px solid var(--color-divider);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.stat-item:last-child {
  border-right: none;
}

.stat-value {
  font-family: var(--font-mono);
  font-size: clamp(36px, 5vw, 64px);
  font-weight: 300;
  line-height: 1;
  letter-spacing: -0.04em;
  color: var(--color-text);
  font-variant-numeric: tabular-nums;
}

.stat-label {
  font-family: var(--font-sans);
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-text-tertiary);
}
```

---

## Dark Mode Adaptation Guide

Swiss dark mode is the same palette inverted — near-black background, near-white text. The accent shifts slightly warmer on dark to maintain legibility.

| Light Token | Light Value | Dark Value | Notes |
|-------------|-------------|------------|-------|
| `--color-bg` | `#FAFAFA` | `#111111` | Near-black, not pure black — same distance from pure as `#FAFAFA` |
| `--color-bg-alt` | `#F4F4F2` | `#1A1A1A` | Alternate section surface |
| `--color-text` | `#111111` | `#FAFAFA` | Direct inversion |
| `--color-text-secondary` | `#444444` | `#BBBBBB` | Maintains proportional step down from primary |
| `--color-text-tertiary` | `#888888` | `#777777` | Gray midpoint — near identical in both modes |
| `--color-accent` | `#3B6FDB` | `#5B8FFF` | Lightened on dark for contrast |
| `--color-divider` | `#E5E5E5` | `#2A2A2A` | Subtle hairline on dark surface |
| `--color-surface` | `#FFFFFF` | `#1A1A1A` | Cards, elevated panels |

```css
@media (prefers-color-scheme: dark) {
  :root {
    --color-bg:               #111111;
    --color-bg-alt:           #1A1A1A;
    --color-text:             #FAFAFA;
    --color-text-secondary:   #BBBBBB;
    --color-text-tertiary:    #777777;
    --color-accent:           #5B8FFF;
    --color-divider:          #2A2A2A;
    --color-surface:          #1A1A1A;
  }
}
```

**Dark mode rules:** No gradients in dark mode either. The grain overlay persists — it is equally appropriate on dark surfaces. Photography becomes higher contrast. The accent rule remains the only color touch.

---

## Anti-Patterns (What This Is NOT)

| ❌ Pattern | Why It Fails |
|-----------|-------------|
| Multiple typefaces | The one-font discipline is the whole aesthetic. A second face breaks the system |
| Background color fills for sections | Swiss sections separate via hairline rules and whitespace, not colored bands |
| Rounded corners (`border-radius > 0`) | Swiss design is rectangular. Rounded = product-y softness, not modernist precision |
| Gradients anywhere | Flat, solid fields only. Gradients signal digital product decoration, not functional design |
| Centered body text | Swiss text is left-aligned. Center alignment is for isolated numbers or CTAs only |
| Decorative illustration or icon sets | Typography and grid do the visual work. Illustrations are noise |
| All-caps headlines | Labels are uppercase. Headlines are sentence case. The distinction is structural |
| Hover effects with scale transforms or glows | Interaction is: underline appears, color tints to accent. Nothing theatrical |
| Drop shadows on cards or surfaces | Depth is created by hairline borders, not elevation shadows |
| Mixing weight and color for hierarchy | Size and weight create hierarchy. Color appears once, as accent, not as hierarchy marker |
| `font-weight: 600` (semibold) | Swiss type uses 300 (Light), 400 (Regular), 700 (Bold). Semibold is the compromised middle |
| Icon-heavy navigation | Navigation is typographic — wordmark and text links. No hamburger menus with icons |
