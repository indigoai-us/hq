---
name: editorial-magazine
description: Editorial Magazine design style pack — Brodovitch / Lubalin / Carson inspired. Extreme typographic scale, full-bleed photography, pull quotes, multi-column editorial grids, duotone effects, paper grain. Use for journalism platforms, cultural brands, magazine-style editorial sites, and narrative-forward products.
---

# Editorial Magazine Design — Style Pack

A codified design language drawn from the tradition of Alexey Brodovitch (Harper's Bazaar), Herb Lubalin (Avant Garde), and David Carson (Ray Gun). This guide provides a complete visual system — typography, color, layout, motion, texture, and component patterns — for any project that needs to feel like a premium editorial spread.

**When to use:** Any time the design direction calls for "editorial", "magazine", "journalism", "photography-forward", "narrative", "cultural brand", "arts publication", or "spread-based" aesthetic. Works for both feature journalism and cultural product marketing.

**Prerequisite:** Load `frontend-design` SKILL.md first for general design principles. This guide layers on top as a specific aesthetic direction.

---

## Core Philosophy

Editorial Magazine design is about **the spread as a unit of thought**. Every screen is a layout decision — type and image in conversation, not hierarchy. The reader's eye is led through tension and release, not a predictable scroll.

**Three pillars:**
1. **Scale contrast** — 120px headlines beside 17px body text. Extreme contrast is the grammar
2. **Grid that breaks** — establish a 12-column grid, then violate it purposefully. Text over image, bleeds, pullouts
3. **Typography as image** — the headline IS the art. Typographic choices carry as much weight as photographs

**The feeling:** Opening a well-designed magazine and being stopped by the opening spread. The layout communicates before you read a word. Confident, directorial, editorial.

---

## Typography System

### Font Stack

| Role | Primary | Fallback | Notes |
|------|---------|----------|-------|
| Display | **Playfair Display** Black or Regular | Georgia, serif | Extreme weights only — 900 or 400/italic. Never 600–700 |
| Condensed / Labels | **Barlow Condensed** | Impact, sans-serif | Datelines, section slugs, captions |
| Body | **PT Serif** | Georgia, serif | Editorial body, bylines, captions |

**Google Fonts import:**
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,900;1,400;1,900&family=Barlow+Condensed:wght@300;400;600&family=PT+Serif:ital,wght@0,400;0,700;1,400&display=swap" rel="stylesheet">
```

```css
:root {
  --font-display:    'Playfair Display', Georgia, serif;
  --font-condensed:  'Barlow Condensed', Impact, sans-serif;
  --font-body:       'PT Serif', Georgia, serif;
}
```

### Type Scale

```
Hero headline:    clamp(72px, 12vw, 160px)   — display Black (900), line-height 0.82, tracking -0.02em
Alt hero (thin):  clamp(72px, 12vw, 160px)   — display regular (400) italic, line-height 0.88
Pull quote:       clamp(40px, 6vw, 72px)      — display italic, line-height 1.05
Section title:    clamp(28px, 3.5vw, 44px)   — display Black, line-height 1.0
Body text:        17px                         — body, line-height 1.78
Caption/label:    11px                         — condensed, uppercase, tracking 0.12em
Dateline:         11px                         — condensed, uppercase, tracking 0.18em
```

### Type Rules

- **Two registers only:** maximum weight (900) or regular italic (400i) — never medium, semibold, or bold
- **Display headlines are rarely uppercase** — sentence case or all-lowercase signals editorial sophistication. Reserve all-caps for datelines and labels
- **Tracking on large type is negative:** `-0.02em` at hero scale tightens letterfit for print-like density
- **Body text is generous:** 17px at 1.78 line-height. Editorial body type gives the eye room to breathe between massive headlines
- **Pull quotes escape the grid:** they span columns, often interrupting body paragraphs visually
- **Dateline format:** `VOL. 03 — SPRING 2025` or `CULTURE — APRIL 2025` in condensed, uppercase, tracked wide

### Typography Anti-Patterns

- ❌ Semibold or bold (600–700) display type — editorial uses extremes, not middle weights
- ❌ Sans-serif for primary display — this aesthetic is rooted in serif editorial tradition
- ❌ Uniform scale (16px body, 32px heading) — radical scale contrast is the whole point
- ❌ System fonts — no personality, no historical weight
- ❌ Tight body line-height — editorial body must breathe (1.7 minimum)
- ❌ Centered pull quotes inside columns — pull quotes break columns or anchor left

---

## Color Palettes

### Primary Editorial Palette

```css
:root {
  --font-display:    'Playfair Display', Georgia, serif;
  --font-condensed:  'Barlow Condensed', Impact, sans-serif;
  --font-body:       'PT Serif', Georgia, serif;

  --color-bg:           #FFFFFF;              /* pure white — paper */
  --color-bg-alt:       #F5F5F0;              /* off-white — alternate sections */
  --color-text:         #0A0A0A;              /* near-black — primary text */
  --color-text-muted:   #6B6B6B;              /* mid gray — captions, secondary */
  --color-accent:       #D4001A;              /* signal red — the editorial punch */
  --color-accent-cool:  #0033CC;              /* deep cobalt — alternate accent */
  --color-accent-warm:  #E84D1C;              /* burnt orange — third accent */
  --color-rule:         #0A0A0A;              /* full-weight rules */
  --color-rule-light:   rgba(10, 10, 10, 0.12); /* light interior rules */
}
```

### Color Rules

- **White is the primary surface** — the page is paper. Color appears in type and accent moments
- **Signal red is used once per composition** — a rule, a drop cap initial, a dateline accent. Use it again and it loses its charge
- **Deep cobalt and burnt orange are alternates, not companions** — pick one per project, not both
- **No fills on section backgrounds** — editorial backgrounds are white or near-white. Color lives in type, rules, and photography
- **Photography adds all the chromatic complexity** — the typographic palette should be near-monochrome to let images breathe

---

## Layout Patterns

### Structural Grid

```
Max width:       1280px (feature layout), 1100px (text-heavy)
Column system:   12 columns, 20px gutter
Page padding:    clamp(20px, 4vw, 80px) sides
Section padding: 80–120px vertical (desktop), 48–64px (mobile)
```

### 12-Column Editorial Grid

```css
.editorial-grid {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  gap: 20px;
  max-width: 1280px;
  margin-inline: auto;
  padding-inline: clamp(20px, 4vw, 80px);
}

/* Feature article: text 7 cols, image 5 cols */
.feature-text    { grid-column: 1 / 8; }
.feature-image   { grid-column: 8 / 13; }

/* Full bleed: text over image */
.full-bleed-grid { grid-column: 1 / -1; position: relative; }

/* Pull quote breaks grid */
.pull-quote-break {
  grid-column: 1 / -1;
  max-width: 680px;
  margin-inline: auto;
  padding-block: 60px;
}
```

### Section Opener Layout

The editorial opener pattern: dateline + massive headline + byline + thin rule, no image required.

```html
<article class="section-opener">
  <p class="dateline">Vol. 03 — Spring 2025 / Culture</p>
  <div class="opener-rule"></div>
  <h1 class="hero-headline">The Architecture<br><em>of Silence</em></h1>
  <div class="byline-row">
    <span class="byline-label">By</span>
    <span class="byline-name">Morgan Ellis</span>
    <span class="byline-date">April 15, 2025</span>
  </div>
</article>
```

```css
.section-opener {
  max-width: 1280px;
  margin-inline: auto;
  padding: 80px clamp(20px, 4vw, 80px) 40px;
}

.dateline {
  font-family: var(--font-condensed);
  font-size: 11px;
  font-weight: 400;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--color-accent);
  margin-bottom: 16px;
}

.opener-rule {
  width: 100%;
  height: 2px;
  background: var(--color-rule);
  margin-bottom: 40px;
}

.hero-headline {
  font-family: var(--font-display);
  font-size: clamp(72px, 12vw, 160px);
  font-weight: 900;
  line-height: 0.82;
  letter-spacing: -0.02em;
  color: var(--color-text);
  margin-bottom: 40px;
}

.hero-headline em {
  font-weight: 400;
  font-style: italic;
}

.byline-row {
  display: flex;
  gap: 16px;
  align-items: baseline;
  font-family: var(--font-condensed);
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--color-text-muted);
}

.byline-name { color: var(--color-text); font-weight: 600; }
```

### Full-Bleed Photography with Text Overlay

```html
<section class="full-bleed-hero">
  <div class="bleed-image-wrap">
    <img src="photo.jpg" alt="Feature photograph" class="bleed-image">
    <div class="bleed-overlay"></div>
  </div>
  <div class="bleed-text">
    <p class="dateline">Photography — Issue 12</p>
    <h2 class="bleed-headline">Monuments<br>to Nothing</h2>
  </div>
</section>
```

```css
.full-bleed-hero {
  position: relative;
  width: 100%;
  height: 80vh;
  min-height: 500px;
  overflow: hidden;
}

.bleed-image-wrap {
  position: absolute;
  inset: 0;
}

.bleed-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.bleed-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    to top,
    rgba(10, 10, 10, 0.72) 0%,
    rgba(10, 10, 10, 0.2) 50%,
    transparent 100%
  );
}

.bleed-text {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 48px clamp(20px, 4vw, 80px);
  color: #FFFFFF;
}

.bleed-headline {
  font-family: var(--font-display);
  font-size: clamp(52px, 8vw, 120px);
  font-weight: 900;
  line-height: 0.85;
  letter-spacing: -0.02em;
  color: #FFFFFF;
}
```

### Multi-Column Article Body

```css
.article-body {
  max-width: 1280px;
  margin-inline: auto;
  padding-inline: clamp(20px, 4vw, 80px);
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  gap: 20px;
}

.article-main {
  grid-column: 2 / 9;
  font-family: var(--font-body);
  font-size: 17px;
  line-height: 1.78;
  color: var(--color-text);
}

.article-sidebar {
  grid-column: 10 / 13;
  border-left: 1px solid var(--color-rule-light);
  padding-left: 24px;
  font-family: var(--font-condensed);
  font-size: 12px;
  letter-spacing: 0.06em;
  color: var(--color-text-muted);
}

@media (max-width: 768px) {
  .article-main    { grid-column: 1 / -1; }
  .article-sidebar { grid-column: 1 / -1; border-left: none; border-top: 1px solid var(--color-rule-light); padding-left: 0; padding-top: 24px; }
}
```

---

## Structural Elements

### Editorial Rules

Three rule weights define page structure:

```css
/* Full-width section break rule — heavy */
.rule-full {
  width: 100%;
  height: 2px;
  background: var(--color-rule);
  margin-block: 0;
}

/* Accent marker rule — short, before headings */
.rule-accent {
  width: 64px;
  height: 3px;
  background: var(--color-accent);
  margin-bottom: 20px;
}

/* Interior section rule — light */
.rule-light {
  width: 100%;
  height: 1px;
  background: var(--color-rule-light);
  margin-block: 40px;
}
```

### Drop Cap

The editorial opening signal: first paragraph begins with a large drop cap initial.

```css
.drop-cap::first-letter {
  font-family: var(--font-display);
  font-size: clamp(56px, 8vw, 96px);
  font-weight: 900;
  line-height: 0.78;
  float: left;
  margin-right: 8px;
  margin-top: 6px;
  color: var(--color-accent);
  line-height: 1;
  padding-right: 2px;
}
```

### Dateline

```css
.dateline {
  font-family: var(--font-condensed);
  font-size: 11px;
  font-weight: 400;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--color-accent);
}

/* With em-dash separator */
.dateline-full::before {
  content: "— ";
  color: var(--color-text-muted);
}
```

### Photo Caption

```css
.photo-caption {
  font-family: var(--font-condensed);
  font-size: 11px;
  font-weight: 300;
  letter-spacing: 0.08em;
  line-height: 1.5;
  color: var(--color-text-muted);
  border-top: 1px solid var(--color-rule-light);
  padding-top: 8px;
  margin-top: 8px;
}
```

---

## Button Patterns

### Primary (Editorial CTA)

```css
.btn-primary {
  font-family: var(--font-condensed);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  padding: 14px 40px;
  background: var(--color-text);
  border: 2px solid var(--color-text);
  color: var(--color-bg);
  cursor: pointer;
  display: inline-block;
  text-decoration: none;
  transition: background 0.2s ease, color 0.2s ease;
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
  font-family: var(--font-condensed);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  padding: 12px 38px;
  background: transparent;
  border: 2px solid var(--color-rule-light);
  color: var(--color-text);
  cursor: pointer;
  display: inline-block;
  text-decoration: none;
  transition: border-color 0.2s ease, color 0.2s ease;
}

.btn-secondary:hover {
  border-color: var(--color-text);
  color: var(--color-text);
}
```

### Button Rules

- **Square corners always** — `border-radius: 0`. Editorial is not soft
- **Condensed font with tracking** — labels and CTAs use the condensed/grotesque, not the display serif
- **Black/white primary** — editorial CTAs default to black fill. Reserve accent (red) fills for maximum urgency moments only
- **Never rounded or pill-shaped** — that aesthetic belongs to product apps, not editorial
- **Text hover: accent** — on hover, shift to signal red to tie into editorial accent language

---

## Motion Primitives

All motion is CSS + IntersectionObserver + requestAnimationFrame. Zero external libraries.

### Scroll Reveal — Editorial Entrance

```css
[data-motion="scroll-reveal"] {
  opacity: 0;
  transform: translateY(20px);
  transition: opacity 0.7s cubic-bezier(0.25, 0.46, 0.45, 0.94),
              transform 0.7s cubic-bezier(0.25, 0.46, 0.45, 0.94);
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
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

  els.forEach(function(el) { observer.observe(el); });
})();
```

### Headline Sweep — Text Reveal (Clip)

Headline lines emerge from bottom of their clip container — a print-press animation.

```css
.headline-reveal-wrap { overflow: hidden; }

.headline-reveal-inner {
  display: block;
  transform: translateY(110%);
  transition: transform 0.8s cubic-bezier(0.16, 1, 0.3, 1);
}

.headline-reveal-wrap.is-visible .headline-reveal-inner {
  transform: translateY(0);
}

@media (prefers-reduced-motion: reduce) {
  .headline-reveal-inner {
    transform: none;
    transition: none;
  }
}
```

```javascript
(function() {
  var wraps = document.querySelectorAll('.headline-reveal-wrap');
  if (!wraps.length) return;

  var observer = new IntersectionObserver(function(entries) {
    entries.forEach(function(entry) {
      if (entry.isIntersecting) {
        var lines = entry.target.querySelectorAll('.headline-reveal-inner');
        lines.forEach(function(line, i) {
          line.style.transitionDelay = (i * 80) + 'ms';
        });
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });

  wraps.forEach(function(el) { observer.observe(el); });
})();
```

### Image Reveal — Slow Pan

Full-bleed images enter with a subtle scale-down, creating a cinematic quality.

```css
[data-motion="image-reveal"] {
  overflow: hidden;
}

[data-motion="image-reveal"] img {
  transform: scale(1.06);
  transition: transform 1.2s cubic-bezier(0.25, 0.46, 0.45, 0.94);
  display: block;
  width: 100%;
}

[data-motion="image-reveal"].is-visible img {
  transform: scale(1.0);
}

@media (prefers-reduced-motion: reduce) {
  [data-motion="image-reveal"] img {
    transform: none;
    transition: none;
  }
}
```

```javascript
(function() {
  var reveals = document.querySelectorAll('[data-motion="image-reveal"]');
  if (!reveals.length) return;

  var observer = new IntersectionObserver(function(entries) {
    entries.forEach(function(entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.05 });

  reveals.forEach(function(el) { observer.observe(el); });
})();
```

### Stagger Grid Reveal

Article card grids stagger entrance by column index.

```javascript
(function() {
  var grids = document.querySelectorAll('[data-motion="stagger-grid"]');
  if (!grids.length) return;

  grids.forEach(function(grid) {
    var items = grid.querySelectorAll('[data-motion-child]');
    items.forEach(function(item, i) {
      item.style.transitionDelay = (i * 75) + 'ms';
    });

    var observer = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting) {
          entry.target.querySelectorAll('[data-motion-child]').forEach(function(child) {
            child.classList.add('is-visible');
          });
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1 });

    observer.observe(grid);
  });
})();
```

---

## Texture & Grain

### Paper Grain Overlay

A subtle noise layer adds analog, printed-page warmth to the white background.

```css
.grain-overlay {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 100;
  opacity: 0.028;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='grain'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='300' height='300' filter='url(%23grain)'/%3E%3C/svg%3E");
  background-repeat: repeat;
  background-size: 300px 300px;
}
```

### Duotone Photography Effect

Applies a two-color tint to images, evoking offset-printing aesthetics.

```css
.duotone-wrap {
  position: relative;
  display: inline-block;
  overflow: hidden;
}

.duotone-wrap img {
  display: block;
  filter: grayscale(1) contrast(1.1);
  mix-blend-mode: luminosity;
}

.duotone-wrap::before {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(
    135deg,
    #D4001A 0%,
    #0A0A0A 100%
  );
  mix-blend-mode: color;
  z-index: 1;
  pointer-events: none;
}
```

### Overprint / Multiply Effect (CSS-only)

```css
.overprint-image {
  filter: grayscale(0.6) contrast(1.15) brightness(0.95);
  mix-blend-mode: multiply;
}

/* Usage: place over a colored background to simulate offset overprint */
.overprint-bg {
  background: var(--color-accent);
}
```

---

## Component Patterns

### Pull Quote

The editorial pull quote interrupts and punctuates long-form content.

```
┌─────────────────────────────────────────────────────┐
│                                                     │
│   "The architecture of a good magazine              │
│    is visible before you read a word."              │
│                                                     │
│   — Morgan Ellis                                    │
│                                                     │
└─────────────────────────────────────────────────────┘
```

```html
<blockquote class="pull-quote" data-motion="scroll-reveal">
  <p class="pull-quote-text">"The architecture of a good magazine is visible before you read a word."</p>
  <footer class="pull-quote-attribution">— Morgan Ellis</footer>
</blockquote>
```

```css
.pull-quote {
  margin: 64px auto;
  max-width: 680px;
  padding: 0 clamp(20px, 4vw, 64px);
  border-left: none;
  text-align: left;
}

.pull-quote::before {
  content: "";
  display: block;
  width: 64px;
  height: 3px;
  background: var(--color-accent);
  margin-bottom: 28px;
}

.pull-quote-text {
  font-family: var(--font-display);
  font-size: clamp(28px, 4.5vw, 52px);
  font-weight: 400;
  font-style: italic;
  line-height: 1.12;
  letter-spacing: -0.01em;
  color: var(--color-text);
  margin-bottom: 20px;
}

.pull-quote-attribution {
  font-family: var(--font-condensed);
  font-size: 11px;
  font-weight: 400;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--color-text-muted);
}
```

### Article Card Grid

Magazine-style card layout: image-first, dateline, headline.

```
┌────────────────────┐  ┌────────────────────┐  ┌────────────────────┐
│                    │  │                    │  │                    │
│  [PHOTOGRAPH]      │  │  [PHOTOGRAPH]      │  │  [PHOTOGRAPH]      │
│                    │  │                    │  │                    │
├────────────────────┤  ├────────────────────┤  ├────────────────────┤
│ CULTURE — APR 2025 │  │ DESIGN — APR 2025  │  │ TRAVEL — MAR 2025  │
│                    │  │                    │  │                    │
│ Title of The       │  │ Another Story      │  │ The Third Piece    │
│ Feature Article    │  │ in the Issue       │  │ of This Issue      │
│                    │  │                    │  │                    │
│ By Writer Name     │  │ By Writer Name     │  │ By Writer Name     │
└────────────────────┘  └────────────────────┘  └────────────────────┘
```

```html
<section class="article-grid" data-motion="stagger-grid">
  <article class="article-card" data-motion-child data-motion="scroll-reveal">
    <div class="card-image" data-motion="image-reveal">
      <img src="story1.jpg" alt="Feature story photograph">
    </div>
    <div class="card-content">
      <p class="dateline">Culture — Apr 2025</p>
      <h3 class="card-headline">Title of the Feature Article</h3>
      <p class="card-byline">By Writer Name</p>
    </div>
  </article>
  <!-- repeat -->
</section>
```

```css
.article-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 40px 28px;
  max-width: 1280px;
  margin-inline: auto;
  padding-inline: clamp(20px, 4vw, 80px);
  padding-block: 80px;
}

.article-card {
  display: flex;
  flex-direction: column;
}

.card-image {
  aspect-ratio: 3 / 2;
  overflow: hidden;
  margin-bottom: 20px;
}

.card-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  transition: transform 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}

.article-card:hover .card-image img {
  transform: scale(1.03);
}

.card-content { flex: 1; }

.card-headline {
  font-family: var(--font-display);
  font-size: clamp(22px, 3vw, 32px);
  font-weight: 900;
  line-height: 1.05;
  letter-spacing: -0.01em;
  color: var(--color-text);
  margin-block: 8px 12px;
}

.card-byline {
  font-family: var(--font-condensed);
  font-size: 11px;
  font-weight: 300;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--color-text-muted);
}
```

### Feature Spread (Two-Column Text + Image)

```html
<section class="feature-spread">
  <div class="feature-image-col" data-motion="image-reveal">
    <img src="feature.jpg" alt="Feature photograph">
  </div>
  <div class="feature-text-col">
    <p class="dateline">Essay — Vol. 03</p>
    <h2 class="feature-title">
      <span class="headline-reveal-wrap">
        <span class="headline-reveal-inner">When Space</span>
      </span>
      <span class="headline-reveal-wrap">
        <span class="headline-reveal-inner"><em>Becomes Language</em></span>
      </span>
    </h2>
    <p class="feature-intro drop-cap">Every designed page makes an argument before the reader begins. The margins, the type size, the weight of the rules — these are not neutral decisions.</p>
    <a href="#" class="btn-primary">Read the Essay</a>
  </div>
</section>
```

```css
.feature-spread {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0;
  max-width: 1280px;
  margin-inline: auto;
  align-items: center;
}

.feature-image-col {
  aspect-ratio: 3 / 4;
  overflow: hidden;
}

.feature-image-col img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.feature-text-col {
  padding: 80px 64px;
  border-left: 1px solid var(--color-rule-light);
}

.feature-title {
  font-family: var(--font-display);
  font-size: clamp(36px, 5vw, 72px);
  font-weight: 900;
  line-height: 0.92;
  letter-spacing: -0.02em;
  color: var(--color-text);
  margin-block: 16px 28px;
}

.feature-title em {
  font-weight: 400;
  font-style: italic;
}

.feature-intro {
  font-family: var(--font-body);
  font-size: 17px;
  line-height: 1.78;
  color: var(--color-text);
  margin-bottom: 36px;
}

@media (max-width: 900px) {
  .feature-spread {
    grid-template-columns: 1fr;
  }
  .feature-text-col {
    border-left: none;
    border-top: 2px solid var(--color-rule);
    padding: 40px clamp(20px, 4vw, 48px);
  }
}
```

### Issue Navigator / Table of Contents

```
┌──────────────────────────────────────────────────────────────┐
│  VOL. 03 — SPRING 2025                     CONTENTS          │
├──────────────────────────────────────────────────────────────┤
│  01  Culture       The Architecture of Silence    p. 12      │
│  02  Photography   Monuments to Nothing           p. 28      │
│  03  Essay         When Space Becomes Language    p. 44      │
│  04  Profile       The Invisible Designer         p. 60      │
└──────────────────────────────────────────────────────────────┘
```

```css
.toc {
  border: 2px solid var(--color-rule);
  max-width: 800px;
  margin-inline: auto;
}

.toc-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 28px;
  border-bottom: 2px solid var(--color-rule);
  font-family: var(--font-condensed);
  font-size: 11px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--color-text);
}

.toc-item {
  display: grid;
  grid-template-columns: 3rem 8rem 1fr auto;
  gap: 16px;
  align-items: baseline;
  padding: 16px 28px;
  border-bottom: 1px solid var(--color-rule-light);
  font-family: var(--font-condensed);
  font-size: 13px;
  letter-spacing: 0.06em;
  color: var(--color-text);
  text-decoration: none;
  transition: background 0.15s ease;
}

.toc-item:hover { background: var(--color-bg-alt); }
.toc-item:last-child { border-bottom: none; }

.toc-num {
  font-size: 11px;
  color: var(--color-accent);
  font-weight: 600;
}

.toc-section {
  text-transform: uppercase;
  color: var(--color-text-muted);
  font-size: 10px;
  letter-spacing: 0.14em;
}

.toc-title { font-weight: 400; }

.toc-page {
  color: var(--color-text-muted);
  font-size: 11px;
}
```

---

## Dark Mode Adaptation Guide

When applying Editorial Magazine to a dark palette (night reading mode):

| Light Token | Dark Value | Notes |
|-------------|------------|-------|
| `--color-bg: #FFFFFF` | `--color-bg: #0A0A0A` | True black is fine — mimics a dark cover |
| `--color-bg-alt: #F5F5F0` | `--color-bg-alt: #111111` | Slightly elevated dark surface |
| `--color-text: #0A0A0A` | `--color-text: #F0EDE6` | Warm off-white — not pure white, like paper |
| `--color-text-muted: #6B6B6B` | `--color-text-muted: #888880` | Keep mid-gray, slightly warm |
| `--color-accent: #D4001A` | `--color-accent: #D4001A` | Signal red reads well on dark — keep it |
| `--color-rule: #0A0A0A` | `--color-rule: #F0EDE6` | Full-weight rule flips with bg |
| `--color-rule-light: rgba(10,10,10,.12)` | `--color-rule-light: rgba(240,237,230,.12)` | Light rule opacity stays same |

```css
@media (prefers-color-scheme: dark) {
  :root {
    --color-bg:          #0A0A0A;
    --color-bg-alt:      #111111;
    --color-text:        #F0EDE6;
    --color-text-muted:  #888880;
    --color-accent:      #D4001A;
    --color-rule:        #F0EDE6;
    --color-rule-light:  rgba(240, 237, 230, 0.12);
  }
}
```

**Dark mode rules:** The grain overlay stays. Duotone effects shift to dark base colors. Full-bleed photography is unchanged. Pull quotes gain slightly more contrast.

---

## Anti-Patterns

| ❌ Pattern | Why It Fails |
|-----------|-------------|
| Sans-serif display headlines | The editorial tradition is rooted in serif display — sans destroys the register |
| Medium/semibold (600–700) display weights | Editorial uses extremes. Middle weights look indecisive |
| Tight body line-height (< 1.6) | Editorial body text breathes. Cramped text reads as cheap |
| Centered headlines at hero scale | Editorial is left-aligned or deliberately asymmetric |
| Uniform type scale (small contrast) | The whole aesthetic is radical size contrast |
| Colored backgrounds (non-white/non-black) | Color lives in photography and accent moments, not section fills |
| `border-radius` on images or cards | Editorial photography is square-cropped, hard edges |
| Decorative icons or illustrations | The typographic system and photography are the visual language |
| Background gradients | Gradients signal digital product, not print editorial |
| Rounded buttons or pill CTAs | Square-cornered, tracked condensed type only |
| Hover glow effects | Editorial interactions are quiet — scale, opacity, or color shifts only |
| Drop shadows on cards | Cards in editorial use rules and whitespace, not elevation shadows |
