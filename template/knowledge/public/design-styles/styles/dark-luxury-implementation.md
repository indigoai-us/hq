---
name: dark-luxury
description: Dark Luxury design style pack — Cormorant Garamond ultra-thin type, champagne gold accents, vast negative space, frosted glass, slow opacity reveals. Use for luxury fashion, prestige fintech, private banking, limited-edition drops, and exclusive membership products.
---

# Dark Luxury Design — Style Pack

A codified design language drawn from Tom Ford, Rolls-Royce, A. Lange & Söhne, and Brunello Cucinelli. This guide provides a complete visual system — typography, color, layout, motion, texture, and component patterns — that can be applied to any prestige frontend project.

**When to use:** Any time the design direction calls for "luxury", "prestige", "private banking", "exclusive", "high jewellery", "couture", "limited edition", or "by appointment" aesthetic. The default surface is dark; a cream variant is described at the end.

**Prerequisite:** Load `frontend-design` SKILL.md first for general design principles. This guide layers on top as a specific aesthetic direction.

---

## Core Philosophy

Dark Luxury is about **authority through restraint**. Nothing competes for attention. The product is the hero; everything else recedes. Decoration is absence — empty space signals that what remains is worth looking at.

**Three pillars:**
1. **Restraint** — gold appears once per page. Every additional use diminishes it
2. **Space** — negative space is the primary luxury signal, not imagery or type size
3. **Weight** — ultra-thin type at extreme scale communicates confidence, not effort

**The feeling:** A Tom Ford store at 10 pm. A Rolls-Royce configurator. A private bank's member portal. Nothing announces itself loudly. You lean in.

---

## Typography System

### Font Stack

| Role | Primary | Fallback | Notes |
|------|---------|----------|-------|
| Display | **Cormorant Garamond Light** (weight 300) | Georgia, serif | Lowercase preferred. Wide tracking at large sizes. |
| Body | **Suisse Int'l Light** or system-ui | system-ui, sans-serif | Weight 300 only. Never bold. |
| Labels / Metadata | Same body stack, ALL CAPS | system-ui | 10–11px, tracking 0.2–0.3em, gold or warm gray |

**Google Fonts import (display only):**
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;1,300&display=swap" rel="stylesheet">
```

```css
:root {
  --font-display: 'Cormorant Garamond', Georgia, serif;
  --font-body:    system-ui, -apple-system, 'Helvetica Neue', sans-serif;
}
```

### Type Scale

```
Display hero:   clamp(72px, 10vw, 150px)   — display, weight 300, lowercase, line-height 0.90, letter-spacing 0.05em
Section title:  clamp(40px, 5vw, 72px)     — display, weight 300, lowercase, line-height 1.0
Card heading:   clamp(24px, 3vw, 36px)     — display, weight 300, lowercase
Body text:      16px                        — body, weight 300, line-height 1.85
Label:          10–11px                     — body, ALL CAPS, weight 300, letter-spacing 0.25em
Caption:        11px                        — body, weight 300, warm gray (#8A8478)
Folio/meta:     10px                        — body, ALL CAPS, weight 300, gold (#C9A96E)
```

### Type Rules

- **Display is almost always lowercase** — "by appointment" not "BY APPOINTMENT". Lowercase signals confidence without announcing itself
- **ALL CAPS is reserved for labels, navigation, and metadata only** — thin, widely tracked, never display-sized
- **Maximum weight is 300** — no exceptions for body or display type. If you need emphasis, use letter-spacing or size
- **Letter-spacing tiers:** display 0.05–0.15em (scales with size), labels 0.2–0.3em, body 0 (natural)
- **Line-height:** display tight (0.88–1.0), body generous (1.75–1.90). The contrast between compressed display and airy prose is the rhythm
- **Italic Cormorant** is permitted for one-line pull quotes or material descriptions only — never body paragraphs
- **NEVER use weight 400+ for any visible text on a dark luxury page**

### Typography Anti-Patterns

- ❌ Bold or semibold text anywhere — weight reads as aggression, not authority
- ❌ Mixed case headlines (Title Case) — signals neither confidence nor craft
- ❌ Conventional body fonts (Inter, Roboto, SF Pro) — too neutral, no materiality
- ❌ Type smaller than 10px — illegibility is not exclusivity
- ❌ More than two typefaces — one serif display, one sans body, done
- ❌ Gradient text on display headings — a Web 2.0 remnant, not luxury
- ❌ Tight line-height on body text — luxury breathes

---

## Color Palettes

### Primary Dark Palette

```css
:root {
  /* Surfaces — layered dark tones create depth without light */
  --color-base:       #0D0D0D;   /* richest dark — page background */
  --color-surface:    #1A1A1A;   /* elevated: cards, nav, drawers */
  --color-surface-mid:#222018;   /* warm dark — used for contrast sections */

  /* Primary accent — used sparingly, once per composition */
  --color-gold:       #C9A96E;   /* champagne gold */
  --color-gold-dim:   rgba(201, 169, 110, 0.4); /* for rules, borders */
  --color-gold-ghost: rgba(201, 169, 110, 0.12); /* for background tints */

  /* Text hierarchy */
  --color-text:       #E8E0D0;   /* muted cream — primary text */
  --color-text-muted: #8A8478;   /* warm gray — secondary, captions */

  /* Tertiary accents — used for section color variants, never mixed */
  --color-emerald:    #1C3A2E;   /* deep emerald — for nature/craft contexts */
  --color-sapphire:   #0D1F35;   /* sapphire — for finance/precision contexts */
  --color-burgundy:   #2E0D15;   /* burgundy — for fashion/wine contexts */
}
```

### Accent Variants

When a section needs a chromatic shift (e.g., a material highlight or category band), swap the surface to one tertiary accent. Never use more than one tertiary accent on a single page.

```css
/* Section: emerald variant */
.section--emerald {
  background: var(--color-emerald);
  color: var(--color-text);
}

/* Section: sapphire variant */
.section--sapphire {
  background: var(--color-sapphire);
  color: var(--color-text);
}

/* Section: burgundy variant */
.section--burgundy {
  background: var(--color-burgundy);
  color: var(--color-text);
}
```

### Color Rules

- **Gold is not a background color** — it appears as hairline rules, folio numbers, one label per page, and the gold shimmer animation. Never as a fill
- **Pure black (#000000) and pure white (#FFFFFF) are forbidden** — base is #0D0D0D, text is #E8E0D0
- **No neon or saturated color** — the tertiary accents are dark, almost-neutral color washes, not accent brights
- **One tertiary accent per page** — pick one context (emerald / sapphire / burgundy) and use it for a single contrast section
- **Surface depth is non-negotiable** — use #0D0D0D → #1A1A1A → #222018 to layer; never two sections of identical surface color

---

## Layout Patterns

### Extreme Vertical Padding

Sections breathe with vast vertical space. This is non-negotiable.

```css
.section {
  padding-block: clamp(100px, 14vw, 200px);
  padding-inline: clamp(24px, 6vw, 120px);
}

.section--hero {
  padding-block-start: clamp(140px, 20vw, 240px);
  padding-block-end:   clamp(120px, 16vw, 200px);
}
```

Max content width is 1100px, centered. Never wider — wide layouts dilute the museum-display feeling.

```css
.container {
  max-width: 1100px;
  margin-inline: auto;
  width: 100%;
}
```

### Single-Column Storytelling

Brand narrative sequences are strictly single-column, centered, with lavish spacing between each beat:

```css
.narrative {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: clamp(80px, 12vw, 160px);
  max-width: 680px;
  margin-inline: auto;
}

.narrative__beat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24px;
}

.narrative__label {
  font-family: var(--font-body);
  font-size: 10px;
  font-weight: 300;
  letter-spacing: 0.28em;
  text-transform: uppercase;
  color: var(--color-gold);
}

.narrative__headline {
  font-family: var(--font-display);
  font-size: clamp(36px, 5vw, 64px);
  font-weight: 300;
  line-height: 1.0;
  letter-spacing: 0.06em;
  color: var(--color-text);
}
```

### Asymmetric Product Placement

Product imagery occupies 65–70% of the horizontal space. Text floats in the remaining margin at mid-height, never anchored to edges.

```css
.product-asymmetric {
  display: grid;
  grid-template-columns: 68fr 32fr;
  grid-template-rows: auto;
  align-items: center;
  gap: 0;
  min-height: 80vh;
}

.product-asymmetric__image {
  position: relative;
  height: 100%;
  min-height: 600px;
}

.product-asymmetric__image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.product-asymmetric__text {
  padding: 60px 48px;
  display: flex;
  flex-direction: column;
  gap: 28px;
}

/* Reversed variant — text left, image right */
.product-asymmetric--reversed {
  grid-template-columns: 32fr 68fr;
}
.product-asymmetric--reversed .product-asymmetric__text { order: -1; }
```

---

## Structural Elements

### Gold Hairline Rule

One hairline rule per page, used as a section divider or below a section label. It is the only decorative element permitted.

```css
.hairline {
  display: block;
  width: 100%;
  height: 0.5px;
  background: var(--color-gold-dim);
  border: none;
  margin-block: 0;
}

/* Short variant — used below section labels */
.hairline--short {
  width: 40px;
  height: 0.5px;
  background: var(--color-gold);
  margin-block: 20px 28px;
}
```

### Material Callout Block

Tiny ALL CAPS text describing craft or material provenance. This is the luxury brand's "specification" pattern.

```css
.material-callout {
  display: inline-flex;
  flex-direction: column;
  gap: 8px;
  padding: 20px 24px;
  border: 0.5px solid var(--color-gold-dim);
  background: transparent;
}

.material-callout__label {
  font-family: var(--font-body);
  font-size: 9px;
  font-weight: 300;
  letter-spacing: 0.3em;
  text-transform: uppercase;
  color: var(--color-gold);
}

.material-callout__value {
  font-family: var(--font-body);
  font-size: 10px;
  font-weight: 300;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--color-text);
}
```

### Folio Numbers

Small gold numerals at page section corners — used in long editorial layouts to denote sequence.

```css
.folio {
  position: absolute;
  font-family: var(--font-body);
  font-size: 10px;
  font-weight: 300;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--color-gold);
  opacity: 0.7;
}

.folio--top-right    { top: 32px; right: 40px; }
.folio--bottom-right { bottom: 32px; right: 40px; }
.folio--bottom-left  { bottom: 32px; left: 40px; }
```

### Navigation Treatment

Navigation is minimal — centered, wide-tracked ALL CAPS labels, no visible background on scroll start. Background appears on scroll.

```css
.nav {
  position: fixed;
  top: 0;
  inset-inline: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 28px 48px;
  transition: background 0.8s ease, padding 0.6s ease;
}

.nav--scrolled {
  background: rgba(13, 13, 13, 0.92);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  padding: 20px 48px;
}

.nav__wordmark {
  font-family: var(--font-display);
  font-size: 14px;
  font-weight: 300;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--color-text);
  text-decoration: none;
}

.nav__links {
  display: flex;
  align-items: center;
  gap: 40px;
  list-style: none;
  margin: 0;
  padding: 0;
}

.nav__link {
  font-family: var(--font-body);
  font-size: 10px;
  font-weight: 300;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--color-text-muted);
  text-decoration: none;
  transition: color 0.5s ease;
}

.nav__link:hover { color: var(--color-text); }
```

---

## Button Patterns

### Primary Enquiry CTA

Language: "enquire within", "by appointment", "request a consultation" — never "buy now", "add to cart", "sign up".

```css
.btn-enquire {
  display: inline-block;
  font-family: var(--font-body);
  font-size: 10px;
  font-weight: 300;
  letter-spacing: 0.28em;
  text-transform: uppercase;
  color: var(--color-text);
  background: transparent;
  border: 0.5px solid var(--color-gold-dim);
  padding: 16px 40px;
  text-decoration: none;
  cursor: pointer;
  transition: border-color 0.6s ease, color 0.6s ease;
}

.btn-enquire:hover {
  border-color: var(--color-gold);
  color: var(--color-gold);
}
```

### Ghost Variant

Used for secondary actions (e.g., "learn more", "view collection") where the primary CTA is already present.

```css
.btn-ghost {
  display: inline-block;
  font-family: var(--font-body);
  font-size: 10px;
  font-weight: 300;
  letter-spacing: 0.28em;
  text-transform: uppercase;
  color: var(--color-text-muted);
  background: transparent;
  border: none;
  padding: 0;
  text-decoration: none;
  cursor: pointer;
  position: relative;
  transition: color 0.5s ease;
}

.btn-ghost::after {
  content: '';
  position: absolute;
  bottom: -3px;
  left: 0;
  width: 0;
  height: 0.5px;
  background: var(--color-text-muted);
  transition: width 0.6s ease;
}

.btn-ghost:hover { color: var(--color-text); }
.btn-ghost:hover::after { width: 100%; }
```

### Button Rules

- **No border-radius** — `border-radius: 0` on all buttons without exception
- **Never "Buy Now"** — luxury is never transactional in its language. Reserve directness for the checkout page
- **One primary CTA per section** — never two filled or bordered buttons competing
- **No hover color fills** — only border weight and text color shift, never a filled state
- **No shadows** — buttons are defined by their border, not depth
- **Generous padding** — minimum 14px 36px; buttons that feel small feel cheap

---

## Motion Primitives

All motion is CSS-only or CSS + IntersectionObserver. No GSAP, no Framer Motion. Motion is slow, opacity-only for primary reveals — luxury never pops or snaps.

### Slow Fade (Primary Reveal)

```css
[data-motion="fade"] {
  opacity: 0;
  transition: opacity 1000ms ease;
}

[data-motion="fade"].is-visible {
  opacity: 1;
}

/* Stagger: set --delay on each child via JS */
[data-motion="fade"] { transition-delay: var(--delay, 0ms); }
```

```javascript
// IntersectionObserver for slow fade
const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.15 }
);

document.querySelectorAll('[data-motion="fade"]').forEach((el, i) => {
  el.style.setProperty('--delay', `${i * 120}ms`);
  observer.observe(el);
});
```

### Parallax Setup

Slow parallax on product photography — background moves at 40% of scroll rate.

```javascript
// Parallax — runs on scroll, no library
// Respects prefers-reduced-motion: if set, parallax is skipped entirely
function initParallax() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const layers = document.querySelectorAll('[data-parallax]');
  if (!layers.length) return;

  function update() {
    layers.forEach((el) => {
      const speed  = parseFloat(el.dataset.parallax) || 0.4;
      const rect   = el.getBoundingClientRect();
      const center = rect.top + rect.height / 2;
      const offset = (window.innerHeight / 2 - center) * speed;
      el.style.transform = `translateY(${offset}px)`;
    });
  }

  window.addEventListener('scroll', update, { passive: true });
  update();
}

initParallax();
```

```html
<!-- Usage -->
<div class="product-asymmetric__image">
  <img src="product.jpg" alt="..." data-parallax="0.35">
</div>
```

### Hover Reveal

Text or detail elements hidden by default, revealed on parent hover with slow opacity — no transforms.

```css
.hover-reveal {
  position: relative;
}

.hover-reveal__overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: flex-end;
  padding: 32px;
  opacity: 0;
  transition: opacity 800ms ease;
  background: linear-gradient(
    to top,
    rgba(13, 13, 13, 0.85) 0%,
    rgba(13, 13, 13, 0.0) 60%
  );
}

.hover-reveal:hover .hover-reveal__overlay {
  opacity: 1;
}
```

### Motion Rules

- **Primary reveals: opacity only** — no translateY, no scale for initial entrance. Transforms are reserved for scroll parallax
- **Minimum duration: 800ms** — maximum 1200ms for primary reveals, 600ms for hover states
- **Easing: `ease` or `ease-out`** — no spring physics, no bounce, no cubic-bezier overshoot
- **No simultaneous motion** — elements reveal sequentially with 120ms stagger, never all at once
- **Always respect prefers-reduced-motion:**

```css
@media (prefers-reduced-motion: reduce) {
  [data-motion],
  [data-motion="fade"],
  .hover-reveal__overlay,
  .gold-shimmer {
    transition: none !important;
    animation: none !important;
    opacity: 1 !important;
    transform: none !important;
  }
}
```

---

## Texture & Grain

### Dark Noise

Subtle film grain overlaid on the base background. Adds material presence to a flat dark surface.

```css
body::after {
  content: '';
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 9999;
  opacity: 0.035;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");
  background-repeat: repeat;
  background-size: 192px 192px;
}
```

### Vignette

Applied to full-bleed photography sections to draw the eye inward and frame the product.

```css
.vignette {
  position: relative;
  overflow: hidden;
}

.vignette::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: radial-gradient(
    ellipse at center,
    transparent 40%,
    rgba(13, 13, 13, 0.65) 100%
  );
}
```

### Gold Shimmer Animation

Reserved for one text element per page — typically the hero display headline or a single material label. A slow, subtle gradient sweep that reads as light catching precious metal.

```css
@keyframes gold-shimmer {
  0%   { background-position: -200% center; }
  100% { background-position: 200% center; }
}

.gold-shimmer {
  background: linear-gradient(
    105deg,
    #C9A96E 0%,
    #E8D5A3 30%,
    #C9A96E 50%,
    #A8874A 70%,
    #C9A96E 100%
  );
  background-size: 200% auto;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  animation: gold-shimmer 4s linear infinite;
}

@media (prefers-reduced-motion: reduce) {
  .gold-shimmer {
    animation: none;
    -webkit-text-fill-color: #C9A96E;
    background: none;
    color: #C9A96E;
  }
}
```

### Frosted Glass

Used for the scrolled nav state, modal overlays, and floating callout panels over dark photography.

```css
.frosted {
  background: rgba(26, 26, 26, 0.72);
  backdrop-filter: blur(20px) saturate(1.2);
  -webkit-backdrop-filter: blur(20px) saturate(1.2);
  border: 0.5px solid rgba(201, 169, 110, 0.15);
}

/* Frosted card variant — for floating panels */
.frosted-card {
  background: rgba(26, 26, 26, 0.80);
  backdrop-filter: blur(24px) saturate(1.1);
  -webkit-backdrop-filter: blur(24px) saturate(1.1);
  border: 0.5px solid rgba(201, 169, 110, 0.18);
  padding: 36px 40px;
}
```

---

## Component Patterns

### Material Callout Block

Used to surface craft or material provenance. Positioned as a floating overlay on product imagery, or as a standalone module in a spec section.

```
┌─────────────────────────────────────────┐  ← 0.5px gold border
│                                         │
│  MATERIAL          ← 9px ALL CAPS gold  │
│  Hand-stitched Calfskin                 │  ← 10px ALL CAPS cream
│                                         │
│  PROVENANCE                             │
│  Cordovan, Spain                        │
│                                         │
│  FINISH                                 │
│  Natural wax patina                     │
│                                         │
└─────────────────────────────────────────┘
```

```html
<div class="material-callout" data-motion="fade">
  <span class="material-callout__label">Material</span>
  <span class="material-callout__value">Hand-stitched Calfskin</span>
  <span class="material-callout__label">Provenance</span>
  <span class="material-callout__value">Cordovan, Spain</span>
  <span class="material-callout__label">Finish</span>
  <span class="material-callout__value">Natural wax patina</span>
</div>
```

### Product Spec Table

A refined specification table — hairline borders, wide-tracked labels, no zebra stripes, no hover fills.

```
  SPECIFICATION          VALUE
  ────────────────────────────────  ← 0.5px gold (#C9A96E) top rule
  Movement               Manual-winding, 21 jewels
  ────────────────────────────────  ← 0.5px warm gray row divider
  Power reserve          72 hours
  ────────────────────────────────
  Case material          Grade 5 titanium
  ────────────────────────────────
  Water resistance       30 m
  ────────────────────────────────
```

```css
.spec-table {
  width: 100%;
  border-collapse: collapse;
  border-top: 0.5px solid var(--color-gold-dim);
}

.spec-table th {
  font-family: var(--font-body);
  font-size: 9px;
  font-weight: 300;
  letter-spacing: 0.28em;
  text-transform: uppercase;
  color: var(--color-gold);
  text-align: left;
  padding: 0 0 16px;
}

.spec-table td {
  font-family: var(--font-body);
  font-size: 13px;
  font-weight: 300;
  letter-spacing: 0.04em;
  color: var(--color-text);
  padding: 18px 0;
  border-bottom: 0.5px solid rgba(138, 132, 120, 0.25);
}

.spec-table td:first-child {
  font-size: 9px;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--color-text-muted);
  width: 40%;
}
```

### Navigation

```
                    wordmark              about  collection  enquire
```

Centered wordmark, navigation links right-aligned, all in spaced ALL CAPS.

```html
<nav class="nav" id="nav">
  <a href="/" class="nav__wordmark">Maison</a>
  <ul class="nav__links">
    <li><a href="/about"      class="nav__link">About</a></li>
    <li><a href="/collection" class="nav__link">Collection</a></li>
    <li><a href="/enquire"    class="nav__link">Enquire</a></li>
  </ul>
</nav>
```

```javascript
// Scrolled state
const nav = document.getElementById('nav');
window.addEventListener('scroll', () => {
  nav.classList.toggle('nav--scrolled', window.scrollY > 60);
}, { passive: true });
```

### Sequential Narrative Section

One product, one fact, one image per screen — the fundamental luxury scrollytelling pattern.

```
┌──────────────────────────────────────────────────────────────────┐
│                                                                  │
│                                                                  │
│              01                    ← 10px folio, gold           │
│                                                                  │
│              the craft             ← display, 72px, lowercase   │
│              ─────                 ← 40px hairline, gold        │
│                                                                  │
│              There are 47 steps    ← body, 16px, weight 300    │
│              in the making of      ← line-height 1.85          │
│              a single sole.        │
│                                    │
│              [enquire within →]    ← ghost button              │
│                                                                  │
│                          ┌──────────────────┐                   │
│                          │                  │                   │
│                          │  [photography]   │ ← 70% width      │
│                          │                  │                   │
│                          └──────────────────┘                   │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

```css
.narrative-section {
  padding-block: clamp(120px, 16vw, 200px);
  display: grid;
  grid-template-columns: 1fr;
  gap: clamp(60px, 8vw, 100px);
  max-width: 800px;
  margin-inline: auto;
  position: relative;
}

.narrative-section__folio {
  font-family: var(--font-body);
  font-size: 10px;
  font-weight: 300;
  letter-spacing: 0.25em;
  text-transform: uppercase;
  color: var(--color-gold);
  opacity: 0.8;
}

.narrative-section__heading {
  font-family: var(--font-display);
  font-size: clamp(52px, 8vw, 96px);
  font-weight: 300;
  line-height: 0.92;
  letter-spacing: 0.05em;
  color: var(--color-text);
  margin: 0;
}

.narrative-section__body {
  font-family: var(--font-body);
  font-size: 16px;
  font-weight: 300;
  line-height: 1.85;
  color: var(--color-text-muted);
  max-width: 480px;
}

.narrative-section__image {
  width: 70%;
  aspect-ratio: 4 / 5;
  object-fit: cover;
  align-self: flex-end;
}
```

---

## Light / Cream Mode Adaptation

Dark Luxury has no "light mode" in the conventional sense. When a cream variant is required (e.g., print collateral, cream-background editorial sections, or a lighter hero on a mostly-dark page), the palette inverts surface values while gold accents remain unchanged.

| Dark Default Token | Cream Variant Value | Notes |
|-------------------|---------------------|-------|
| `--color-base` `#0D0D0D` | `#F0EAD8` | Warm parchment, not clinical white |
| `--color-surface` `#1A1A1A` | `#E8E0CC` | Elevated surface — cards, insets |
| `--color-surface-mid` `#222018` | `#DDD5BE` | Contrast bands |
| `--color-text` `#E8E0D0` | `#0D0D0D` | Near-black on cream |
| `--color-text-muted` `#8A8478` | `#6B6358` | Warm dark gray |
| `--color-gold` `#C9A96E` | `#C9A96E` | Unchanged — gold reads on both |
| `--color-gold-dim` `rgba(201,169,110,0.4)` | `rgba(201,169,110,0.5)` | Slightly more visible on light |

```css
/* Cream variant — apply to :root or a scoping selector */
.theme-cream {
  --color-base:        #F0EAD8;
  --color-surface:     #E8E0CC;
  --color-surface-mid: #DDD5BE;
  --color-text:        #0D0D0D;
  --color-text-muted:  #6B6358;
  --color-gold:        #C9A96E;
  --color-gold-dim:    rgba(201, 169, 110, 0.50);
  --color-gold-ghost:  rgba(201, 169, 110, 0.14);
}
```

**Cream variant rules:**
- The grain overlay opacity drops from 0.035 to 0.025 on cream surfaces
- Navigation background on scroll: `rgba(240, 234, 216, 0.92)` instead of dark
- Frosted glass: `rgba(232, 224, 204, 0.80)` with identical blur values
- Gold shimmer animation is permitted on cream — it reads similarly
- Tertiary accents (emerald, sapphire, burgundy) are not used in cream variant — the palette is a binary inversion, not a recomposition

---

## Anti-Patterns

| ❌ Pattern | Why It Fails |
|-----------|-------------|
| Pure black background (#000000) | Flat and digital — luxury warmth requires #0D0D0D or #0A0909, never pure black |
| Pure white text (#FFFFFF) on dark | Harsh contrast reads as utility app. Use muted cream #E8E0D0 |
| Gold as a fill color | Fills register as garish. Gold is for hairlines, labels, and shimmer only |
| Font weight 400+ in any element | Bold type signals urgency; luxury communicates through space, not weight |
| "Buy Now" or "Add to Cart" CTA | Transactional language collapses the experiential distance luxury requires |
| CTA as a filled colored button | A gold-filled button is a billboard, not an invitation. Use bordered ghost only |
| More than one gold accent per section | Repetition destroys scarcity. If gold is everywhere, it means nothing |
| Animations under 600ms or with bounce | Fast motion is anxious. Bounce is playful. Neither belongs here |
| `transform: scale` or `translateY` on reveal | Entry transforms feel mechanical. Luxury appears — it doesn't slide in |
| Multiple typefaces or font weights | Two fonts maximum: one display serif, one sans body. Weight 300 only |
| Saturated color (any hue above ~20% saturation) | Luxury palettes are near-neutral. A bright blue or red reads as retail |
| Tight letter-spacing on labels | Labels must breathe: minimum 0.2em tracking. Crowded labels are packaging copy, not prestige |

