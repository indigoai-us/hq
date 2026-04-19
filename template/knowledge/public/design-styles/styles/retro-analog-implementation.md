---
name: retro-analog
description: Retro Analog design style pack — Saul Bass / vintage letterpress / mid-century American advertising inspired. Paper grain, earthen palettes, badge and ribbon components, halftone dots, duotone photography, letterpress text shadows. Use for craft brands, artisan products, food & beverage, and any brand that signals warmth over precision.
---

# Retro Analog Design — Style Pack

A codified design language drawn from mid-century American advertising, vintage letterpress printing, and analog production craft — Saul Bass's poster compositions, vintage packaging design, and the hand-produced warmth of 1950s–70s print. This guide provides a complete visual system — typography, color, layout, texture, and component patterns — for any project that must communicate warmth, craft, and human presence before it is read.

**When to use:** Any time the design direction calls for "vintage", "craft", "artisan", "analog", "hand-made", "warm", "nostalgic", "approachable", "heritage brand", or "anti-tech" aesthetic. Works for food and beverage, coffee, independent retail, restaurant platforms, farmers markets, craft goods, wellness brands, and any product that competes on warmth rather than precision. Modern practitioners include Mailchimp (pre-Intuit brand), Toast, and many craft/artisan direct-to-consumer brands.

**Prerequisite:** Load `frontend-design` SKILL.md first for general design principles. This guide layers on top as a specific aesthetic direction.

---

## Core Philosophy

Retro Analog design is about **warmth as a strategic signal**. In a sea of cold, precise, blue-accented software products, this aesthetic says: "made by humans, for humans." Imperfection is intentional. Grain is a choice. The badge is not a decoration — it is a trust mark.

**Three pillars:**
1. **Handcraft legibility** — type choices, textures, and layout patterns that evoke physical production. Letterpress deboss. Ink on paper. Screen-printed registration
2. **Earthy restraint** — the palette is terracotta, mustard, cream, and sage. Never synthetic. Never cold
3. **Nostalgia as trust** — familiar forms (badges, ribbons, seals, stamps) activate pattern recognition from a pre-digital era when things were made with care

**The feeling:** Picking up a tin of small-batch coffee at a market stall. Reading a handwritten chalkboard menu. Finding a decades-old product label that still looks better than anything designed last year. It has been here before — it will still be here.

---

## Typography System

### Font Stack

| Role | Primary | Fallback | Notes |
|------|---------|----------|-------|
| Display / Headlines | **Fraunces** or **Playfair Display** | Georgia, serif | Optical size variable, weights 700–900, soft and rounded |
| Body | **Lora** | Georgia, serif | Warm serif, generous x-height, 1.7–1.8 line-height |
| Labels / Stamps | **Source Serif 4 Condensed** or monospace | Georgia, serif | Small caps or condensed for badge text, "Est." stamps |
| Accent / Callouts | **Libre Baskerville** | serif | For pull quotes and callout blocks |

**Google Fonts import:**
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,700;0,9..144,900;1,9..144,400&family=Lora:ital,wght@0,400;0,600;1,400&family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&display=swap" rel="stylesheet">
```

```css
:root {
  --font-display: 'Fraunces', 'Playfair Display', Georgia, serif;
  --font-body:    'Lora', Georgia, serif;
  --font-accent:  'Libre Baskerville', Georgia, serif;
}
```

### Type Scale

```
Hero headline:    clamp(52px, 8vw, 110px)   — display 900, line-height 0.92, tracking -0.01em
Section title:    clamp(36px, 5vw, 64px)    — display 700, line-height 0.98, tracking -0.01em
Subheading:       clamp(22px, 3vw, 32px)    — display 400 italic, line-height 1.15
Body text:        17–18px                    — body 400, line-height 1.78
Label / stamp:    10–12px                    — small caps or uppercase condensed, tracking 0.12–0.18em
Badge text:       12–14px                    — uppercase, tracking 0.14em, weight 600
Pull quote:       clamp(24px, 3.5vw, 40px)  — accent italic, line-height 1.2
Caption:          13px                       — body 400, color muted
```

### Type Rules

- **Warm serifs carry the personality** — display serif for headlines, body serif for long-form. This is what separates craft from corporate
- **Sentence case for warmth** — mixed case feels hand-composed. All-caps is reserved for stamps, badges, and label text only
- **Slightly open tracking on headlines** — `letter-spacing: 0.01–0.03em` at large scale for vintage typesetting feel. Tight tracking at display scale is modernist; open tracking is print-era
- **Italic as accent** — italic weights at body and subheading scale add the warmth and personality that a grotesque cannot
- **Never mix display weights mid-sentence** — pick 700 or 900. Mixing within a single headline looks indecisive
- **Small caps for labels** — `font-variant: small-caps` or a condensed face with wide tracking at 10–12px for stamp text

### Typography Anti-Patterns

- ❌ Sans-serif for headlines — grotesques signal digital precision, not analog craft. The entire warmth register lives in the serif
- ❌ Tight tracking on label text — stamp and badge text must be readable. Track it open (0.12em minimum)
- ❌ Thin/ultralight weights — retro analog type has mass and body. Light weights feel modern and cold
- ❌ System fonts — Inter and SF Pro are the aesthetic opposition. Use warmth-forward serifs
- ❌ Pure black (`#000000`) — use the warm brown anchor (`#5C4033`) instead. Pure black is cold ink
- ❌ Bold body text — body type is regular weight. Bold body text destroys the analog texture

---

## Color Palettes

### Primary Palette (Light / Cream)

```css
:root {
  --font-display: 'Fraunces', 'Playfair Display', Georgia, serif;
  --font-body:    'Lora', Georgia, serif;
  --font-accent:  'Libre Baskerville', Georgia, serif;

  --color-bg:           #F5F0E8;              /* aged paper cream — primary surface */
  --color-primary:      #C65D3E;              /* terracotta — primary accent */
  --color-secondary:    #D4A843;              /* mustard yellow — secondary accent */
  --color-tertiary:     #8B9E7E;              /* sage green — supporting accent */
  --color-anchor:       #5C4033;              /* warm brown / espresso — dark anchor, text on light */
  --color-neutral:      #C4A882;              /* warm sand — mid-tone surfaces */
  --color-bg-band:      #E8E0D0;              /* warmer cream — alternate section bands */
  --color-text:         #5C4033;              /* espresso — primary text (warm brown, not black) */
  --color-text-muted:   #8C7060;              /* medium warm — secondary text */
  --color-divider:      #D4C4AA;              /* warm sand divider */
}
```

### Dark Mode Palette (Espresso)

```css
:root[data-theme="dark"] {
  --color-bg:           #3A2820;              /* dark espresso — primary surface */
  --color-primary:      #C65D3E;              /* terracotta — same, reads well on dark */
  --color-secondary:    #D4A843;              /* mustard — same */
  --color-tertiary:     #8B9E7E;              /* sage — same */
  --color-anchor:       #F5F0E8;              /* cream — flipped to text role */
  --color-neutral:      #5C4033;              /* espresso now as mid-surface */
  --color-bg-band:      #2A1E18;              /* darker espresso — alternate sections */
  --color-text:         #F5F0E8;              /* cream — primary text */
  --color-text-muted:   #C4A882;              /* warm sand — secondary text */
  --color-divider:      #5C4033;              /* espresso divider */
}
```

### Color Rules

- **No pure white, no pure black** — backgrounds are cream (`#F5F0E8`), text is espresso (`#5C4033`). These are the warm-end poles
- **Terracotta is the one call-to-action color** — it appears on primary buttons, accent rules, and badge borders. Not on backgrounds
- **Mustard as data and secondary highlight** — dates, running numbers, star ratings, secondary badges
- **Sage as breathing room** — sage green appears as a tertiary surface or a decorative band, not as an action color
- **Earth tones only** — no blues, no purples, no synthetic brights. The cold color wheel does not exist in this system
- **Warm band sections** — section backgrounds alternate between `--color-bg` and `--color-bg-band`, never a stark white or flat gray

---

## Layout Patterns

### Structural Grid

```
Max width:       1100px (editorial), 1280px (marketing)
Column system:   12 columns, 24px gutter
Page padding:    clamp(24px, 5vw, 72px) sides
Section padding: 88px vertical (desktop), 56px (mobile)
Centered axis:   strong vertical center — poster-style compositions
```

### 12-Column CSS Grid

```css
.retro-grid {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  gap: 24px;
  max-width: 1100px;
  margin-inline: auto;
  padding-inline: clamp(24px, 5vw, 72px);
}

/* Centered text column: 8 of 12, offset 2 */
.col-centered { grid-column: 3 / 11; text-align: center; }

/* Wide left: 7 of 12 */
.col-7-left   { grid-column: 1 / 8; }

/* Right balance: 5 of 12 */
.col-5-right  { grid-column: 8 / 13; }

/* Full bleed */
.col-full     { grid-column: 1 / -1; }

@media (max-width: 768px) {
  .retro-grid { grid-template-columns: repeat(4, 1fr); gap: 16px; }
  .col-centered, .col-7-left, .col-5-right { grid-column: 1 / -1; }
}
```

### Earth Tone Section Band

Full-bleed color sections that transition the page through earth tones:

```css
.section-band {
  background: var(--color-bg-band);
  padding-block: 88px;
  position: relative;
}

.section-band--terracotta {
  background: var(--color-primary);
  --color-text: #F5F0E8;
  --color-text-muted: rgba(245, 240, 232, 0.7);
}

.section-band--anchor {
  background: var(--color-anchor);
  --color-text: #F5F0E8;
  --color-text-muted: var(--color-neutral);
}
```

### Alignment

- **Center-axis compositions** — retro analog channels the vintage poster. Hero sections are centered, creating symmetry around a vertical axis
- **Left-align for long-form** — body text, article content, and step layouts stay left-aligned for readability
- **Asymmetric hand-placed feel** — not grid-perfect symmetry, but a visual balance where elements appear placed by eye, not ruler. Achieve this by mixing `text-align: center` sections with left-anchored content sections
- **Generous internal breathing room** — padding and margin are always more than you expect. Crowding destroys the craft signal

---

## Structural Elements

### Rules (Dividers)

| Element | CSS | When |
|---------|-----|------|
| Warm hairline | `height: 1px; background: var(--color-divider)` | Section separators within light surfaces |
| Ornamental rule | Centered, 80px wide, with em-dash or diamond ornament | Before section headings in centered layouts |
| Terracotta accent bar | `height: 3px; width: 64px; background: var(--color-primary)` | Above section headlines |

```css
.rule-warm {
  width: 100%;
  height: 1px;
  background: var(--color-divider);
  border: none;
}

.rule-ornamental {
  display: flex;
  align-items: center;
  gap: 12px;
  justify-content: center;
  color: var(--color-neutral);
  font-family: var(--font-display);
  font-size: 18px;
  letter-spacing: 0.2em;
  margin-block: 32px;
}

.rule-ornamental::before,
.rule-ornamental::after {
  content: "";
  flex: 1;
  max-width: 80px;
  height: 1px;
  background: var(--color-divider);
}

/* Usage: <div class="rule-ornamental">◆</div> */

.rule-accent-bar {
  width: 64px;
  height: 3px;
  background: var(--color-primary);
  border: none;
  margin: 0 auto 20px auto;
}
```

### Stamp / Seal Shape

The circular or oval stamp motif — distressed edges, letterpress impression:

```css
.stamp {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 120px;
  height: 120px;
  border-radius: 50%;
  border: 3px solid var(--color-primary);
  background: transparent;
  padding: 16px;
  text-align: center;
  position: relative;
}

/* Inner double-border — letterpress detail */
.stamp::after {
  content: "";
  position: absolute;
  inset: 5px;
  border-radius: 50%;
  border: 1px solid var(--color-primary);
  opacity: 0.5;
}

.stamp-text {
  font-family: var(--font-display);
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.18em;
  color: var(--color-primary);
  line-height: 1.3;
}

.stamp-year {
  font-family: var(--font-display);
  font-size: 18px;
  font-weight: 900;
  color: var(--color-primary);
  line-height: 1;
  margin-block: 4px;
}
```

### Labels

Stamp-style labels: all-caps, wide tracking, condensed or small-caps:

```css
.retro-label {
  font-family: var(--font-display);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--color-primary);
  display: block;
  margin-bottom: 12px;
}

/* Badge tag style */
.retro-tag {
  display: inline-block;
  font-family: var(--font-display);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--color-anchor);
  border: 1px solid var(--color-neutral);
  padding: 4px 10px;
  background: transparent;
}
```

---

## Button Patterns

### Primary (Filled — Terracotta)

```css
.btn-primary {
  font-family: var(--font-display);
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: 14px 36px;
  background: var(--color-primary);
  border: 2px solid var(--color-primary);
  color: #F5F0E8;
  border-radius: 3px;           /* slight softening — not sharp, not pill */
  cursor: pointer;
  display: inline-block;
  text-decoration: none;
  transition: background 0.2s ease, transform 0.15s ease;
}

.btn-primary:hover {
  background: #B0502E;          /* slightly darker terracotta */
  border-color: #B0502E;
  transform: translateY(-1px);  /* subtle warm lift */
}
```

### Secondary (Outline)

```css
.btn-secondary {
  font-family: var(--font-display);
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: 12px 34px;
  background: transparent;
  border: 2px solid var(--color-anchor);
  color: var(--color-anchor);
  border-radius: 3px;
  cursor: pointer;
  display: inline-block;
  text-decoration: none;
  transition: background 0.2s ease, color 0.2s ease;
}

.btn-secondary:hover {
  background: var(--color-anchor);
  color: #F5F0E8;
}
```

### Button Rules

- **Slight border-radius allowed** — `border-radius: 2–4px` only. The softness is intentional: this is not a sharp modernist system, but not pill-shaped either
- **Uppercase serif for button text** — display font in uppercase, not a sans. The serif keeps it warm
- **Open tracking** — `letter-spacing: 0.06–0.1em` on button labels. Tight tracking is modernist
- **Primary fill is terracotta** — the one color that signals action. Mustard and sage do not appear on buttons
- **Hover: slight lift** — `translateY(-1px)` is permitted. Warmth includes gentle physical response

---

## Motion Primitives

All motion is CSS + IntersectionObserver. Zero external libraries. Motion in this system is slow, warm, and organic — no sharp or quick transitions.

### Scroll Reveal — Warm Fade

Slow fade with gentle vertical movement — the pace of analog.

```css
[data-motion="scroll-reveal"] {
  opacity: 0;
  transform: translateY(16px);
  transition: opacity 0.85s cubic-bezier(0.33, 1, 0.68, 1),
              transform 0.85s cubic-bezier(0.33, 1, 0.68, 1);
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
  }, { threshold: 0.1, rootMargin: '0px 0px -24px 0px' });

  els.forEach(function(el) { observer.observe(el); });
})();
```

### Warm Stagger

Grid items enter slowly, staggered — like things being placed one at a time.

```javascript
(function() {
  var grids = document.querySelectorAll('[data-motion="warm-stagger"]');
  if (!grids.length) return;

  grids.forEach(function(grid) {
    var items = grid.querySelectorAll('[data-motion="scroll-reveal"]');
    items.forEach(function(item, i) {
      item.style.transitionDelay = (i * 120) + 'ms';  /* 120ms — slower than swiss 80ms */
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

### Parallax Scroll (Reduced Speed)

Backgrounds scroll at 60% foreground speed — the vintage projection sensation.

```javascript
(function() {
  var parallax = document.querySelectorAll('[data-parallax]');
  if (!parallax.length) return;

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) return;  /* skip entirely on reduced motion */

  function update() {
    parallax.forEach(function(el) {
      var rect = el.getBoundingClientRect();
      var speed = parseFloat(el.dataset.parallax) || 0.4;
      var offset = (rect.top - window.innerHeight / 2) * speed;
      el.style.transform = 'translateY(' + offset + 'px)';
    });
  }

  window.addEventListener('scroll', update, { passive: true });
  update();
})();
```

```css
/* Wrap parent must be overflow: hidden */
.parallax-wrap {
  overflow: hidden;
  position: relative;
}

@media (prefers-reduced-motion: reduce) {
  [data-parallax] { transform: none !important; }
}
```

### Hover Warm Lift

Cards and badges lift slightly on hover — the analog pick-up gesture.

```css
[data-motion="hover-lift"] {
  transition: transform 0.3s cubic-bezier(0.33, 1, 0.68, 1),
              box-shadow 0.3s cubic-bezier(0.33, 1, 0.68, 1);
}

[data-motion="hover-lift"]:hover {
  transform: translateY(-3px);
  box-shadow: 0 8px 24px rgba(92, 64, 51, 0.12);
}

@media (prefers-reduced-motion: reduce) {
  [data-motion="hover-lift"] { transition: none; }
  [data-motion="hover-lift"]:hover { transform: none; box-shadow: none; }
}
```

### Motion Rules

- **Always respect `prefers-reduced-motion`** — all transforms and transitions must be disabled. Content must be immediately visible
- **Slow transitions: 0.7s–1.0s** — retro analog moves at the pace of physical materials, not digital snaps
- **No bounce or spring easing** — `cubic-bezier(0.33, 1, 0.68, 1)` is the signature easing: smooth exit with a gentle overshoot that fades, not springs
- **Parallax only on decorative elements** — never on text that needs to be read. Background images and badge elements only
- **Fade is the primary animation** — not slide, not scale. Fade-in from 0 to 1 is the closest to an exposure developing

---

## Texture & Effects

### Paper Grain — SVG fractalNoise (Primary Technique)

The signature texture. Paper grain at 10–20% opacity covers all backgrounds:

```css
/* Full-page grain overlay */
body::after {
  content: "";
  position: fixed;
  inset: 0;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='grain'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='300' height='300' filter='url(%23grain)'/%3E%3C/svg%3E");
  background-repeat: repeat;
  background-size: 300px 300px;
  opacity: 0.08;
  pointer-events: none;
  z-index: 9999;
}
```

### Paper Grain — PNG Overlay Fallback

For environments where inline SVG data URIs are blocked:

```css
/* Host grain.png at /assets/grain.png — a 200×200 grayscale noise PNG */
.grain-png-overlay {
  position: fixed;
  inset: 0;
  background-image: url('/assets/grain.png');
  background-repeat: repeat;
  background-size: 200px 200px;
  opacity: 0.07;
  pointer-events: none;
  z-index: 9999;
  mix-blend-mode: multiply;
}
```

### Letterpress Text Shadow (Inner Shadow Simulation)

Simulates the debossed appearance of type pressed into paper:

```css
.letterpress {
  /* Outer shadow creates deboss depth; text-shadow in CSS cannot do inner shadow */
  /* Simulate with layered text-shadow: dark below-right, light above-left */
  text-shadow:
    1px 1px 1px rgba(255, 255, 255, 0.4),
    -1px -1px 1px rgba(92, 64, 51, 0.3);
  color: var(--color-anchor);
}

/* Stronger deboss for badge/stamp text */
.letterpress--deep {
  text-shadow:
    2px 2px 2px rgba(255, 255, 255, 0.5),
    -1px -1px 2px rgba(92, 64, 51, 0.4),
    0 1px 3px rgba(92, 64, 51, 0.2);
  color: var(--color-anchor);
}
```

### Halftone Dot Pattern

Mid-century print halftone as a section background or image overlay:

```css
.halftone-bg {
  background-color: var(--color-bg-band);
  background-image: radial-gradient(
    circle,
    var(--color-neutral) 1.5px,
    transparent 1.5px
  );
  background-size: 12px 12px;
}

/* Larger, sparser dots for decorative panels */
.halftone-bg--sparse {
  background-image: radial-gradient(
    circle,
    var(--color-neutral) 2px,
    transparent 2px
  );
  background-size: 20px 20px;
}

/* Halftone as section overlay (over solid band) */
.halftone-overlay {
  position: relative;
}

.halftone-overlay::before {
  content: "";
  position: absolute;
  inset: 0;
  background-image: radial-gradient(
    circle,
    rgba(92, 64, 51, 0.08) 1px,
    transparent 1px
  );
  background-size: 10px 10px;
  pointer-events: none;
}
```

### Duotone Photography

Two-color tint evoking halftone offset printing — terracotta + cream:

```css
.duotone-wrap {
  position: relative;
  display: block;
  overflow: hidden;
}

.duotone-wrap img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  filter: grayscale(1) contrast(1.05) brightness(0.9);
  mix-blend-mode: luminosity;
}

.duotone-wrap::before {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(
    150deg,
    #C65D3E 0%,        /* terracotta */
    #F5F0E8 100%       /* aged cream */
  );
  mix-blend-mode: color;
  z-index: 1;
  pointer-events: none;
}

/* Alternate duotone: espresso + cream (darker, more print-like) */
.duotone-wrap--dark::before {
  background: linear-gradient(
    150deg,
    #5C4033 0%,        /* espresso */
    #C4A882 100%       /* warm sand */
  );
}
```

### Distressed Edge on Images

A subtle worn-edge mask on image containers:

```css
.image-distressed {
  position: relative;
  overflow: hidden;
}

.image-distressed::after {
  content: "";
  position: absolute;
  inset: 0;
  box-shadow: inset 0 0 20px rgba(92, 64, 51, 0.15);
  pointer-events: none;
}
```

---

## Component Patterns

### Badge with Circular Border (Signature Component)

The oval or circular badge with outer text running along the curve, centered design motif.

```
         ╭──────────────────╮
      ╭  │   SMALL BATCH    │  ╮
     │   │                  │   │
     │   │   ◆ EST. ◆       │   │
     │   │      1987        │   │
      ╰  │                  │  ╯
         ╰──────────────────╯
```

```html
<div class="badge-circle" aria-label="Small Batch — Est. 1987">
  <svg class="badge-svg" viewBox="0 0 200 200" width="200" height="200" aria-hidden="true">
    <!-- Outer ring border -->
    <circle cx="100" cy="100" r="92" fill="none" stroke="#C65D3E" stroke-width="2"/>
    <!-- Inner ring border -->
    <circle cx="100" cy="100" r="80" fill="none" stroke="#C65D3E" stroke-width="1" opacity="0.5"/>
    <!-- Curved text along top arc -->
    <defs>
      <path id="top-arc" d="M 18,100 A 82,82 0 0,1 182,100"/>
      <path id="bot-arc" d="M 30,115 A 75,75 0 0,0 170,115"/>
    </defs>
    <text class="badge-arc-text">
      <textPath href="#top-arc" startOffset="50%" text-anchor="middle">SMALL BATCH ◆ HANDCRAFTED</textPath>
    </text>
    <!-- Center content (can be HTML overlaid instead) -->
    <text x="100" y="90" text-anchor="middle" class="badge-center-label">EST.</text>
    <text x="100" y="120" text-anchor="middle" class="badge-center-year">1987</text>
  </svg>
</div>
```

```css
.badge-circle {
  display: inline-block;
}

.badge-svg {
  display: block;
}

.badge-arc-text {
  font-family: var(--font-display);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.14em;
  fill: var(--color-primary);
  text-transform: uppercase;
}

.badge-center-label {
  font-family: var(--font-display);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.16em;
  fill: var(--color-anchor);
  text-transform: uppercase;
}

.badge-center-year {
  font-family: var(--font-display);
  font-size: 28px;
  font-weight: 900;
  fill: var(--color-anchor);
}
```

### Ribbon Banner

The ribbon callout: "Est. 1987", "Small Batch", "Award Winner" — diagonal or horizontal.

```
    ┌─────────────────────────────────────────────┐
   ╱                                               ╲
  │   ◆  AWARD WINNER  ◆  BEST IN CLASS  ◆         │
   ╲                                               ╱
    └─────────────────────────────────────────────┘
```

```html
<div class="ribbon-banner">
  <span class="ribbon-text">◆ Award Winner ◆ Best in Class ◆</span>
</div>
```

```css
.ribbon-banner {
  position: relative;
  background: var(--color-primary);
  padding: 12px 32px;
  display: inline-block;
  text-align: center;
}

/* Angled ends via clip-path */
.ribbon-banner {
  clip-path: polygon(
    12px 0%,
    calc(100% - 12px) 0%,
    100% 50%,
    calc(100% - 12px) 100%,
    12px 100%,
    0% 50%
  );
}

.ribbon-text {
  font-family: var(--font-display);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #F5F0E8;
  white-space: nowrap;
}

/* Full-width marquee ribbon */
.ribbon-banner--full {
  width: 100%;
  clip-path: none;
  background: var(--color-anchor);
  padding: 10px 0;
  overflow: hidden;
}

.ribbon-banner--full .ribbon-text {
  display: inline-block;
  padding-inline: 40px;
}
```

### Pull Quote (Warm)

```
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│  ◆                                                           │
│                                                              │
│  "The best things are made slowly,                           │
│   by people who care what happens next."                     │
│                                                              │
│  — Patagonia, Catalog, 1992                                  │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

```html
<blockquote class="retro-pull-quote" data-motion="scroll-reveal">
  <span class="pull-quote-ornament" aria-hidden="true">◆</span>
  <p class="pull-quote-text">"The best things are made slowly, by people who care what happens next."</p>
  <footer class="pull-quote-footer">
    <cite class="pull-quote-source">— Patagonia, Catalog, 1992</cite>
  </footer>
</blockquote>
```

```css
.retro-pull-quote {
  margin: 0;
  padding: 48px 0;
  border-top: 1px solid var(--color-divider);
  border-bottom: 1px solid var(--color-divider);
  max-width: 680px;
}

.pull-quote-ornament {
  display: block;
  font-size: 20px;
  color: var(--color-primary);
  margin-bottom: 20px;
}

.pull-quote-text {
  font-family: var(--font-accent);
  font-size: clamp(22px, 3.5vw, 38px);
  font-weight: 400;
  font-style: italic;
  line-height: 1.25;
  letter-spacing: 0.01em;
  color: var(--color-text);
  margin: 0 0 24px 0;
}

.pull-quote-footer {
  display: block;
}

.pull-quote-source {
  font-family: var(--font-display);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--color-text-muted);
  font-style: normal;
}
```

### Product Card (Craft Style)

```
┌──────────────────────────────────────┐
│                                      │
│   [DUOTONE PRODUCT PHOTOGRAPH]       │
│                                      │
├──────────────────────────────────────┤
│  SMALL BATCH · SEASONAL              │
│                                      │
│  Ethiopian Yirgacheffe               │
│  Single Origin Roast                 │
│                                      │
│  Notes: Jasmine, Peach, Honey        │
│                                      │
│  [Order Now]                         │
└──────────────────────────────────────┘
```

```html
<article class="product-card" data-motion="scroll-reveal" data-motion-lift="hover-lift">
  <div class="product-image duotone-wrap">
    <img src="coffee-beans.jpg" alt="Ethiopian Yirgacheffe single origin">
  </div>
  <div class="product-body">
    <p class="retro-label">Small Batch · Seasonal</p>
    <h3 class="product-title">Ethiopian Yirgacheffe<br><em>Single Origin Roast</em></h3>
    <p class="product-notes">Notes: Jasmine, Peach, Honey</p>
    <a href="#order" class="btn-primary">Order Now</a>
  </div>
</article>
```

```css
.product-card {
  background: var(--color-bg);
  border: 1px solid var(--color-divider);
  border-radius: 4px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  transition: transform 0.3s cubic-bezier(0.33, 1, 0.68, 1),
              box-shadow 0.3s cubic-bezier(0.33, 1, 0.68, 1);
}

.product-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 12px 32px rgba(92, 64, 51, 0.1);
}

.product-image {
  aspect-ratio: 4 / 3;
  overflow: hidden;
}

.product-body {
  padding: 28px 24px 32px;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0;
}

.product-title {
  font-family: var(--font-display);
  font-size: clamp(20px, 2.5vw, 26px);
  font-weight: 700;
  line-height: 1.1;
  color: var(--color-text);
  margin: 0 0 16px 0;
}

.product-title em {
  font-weight: 400;
  font-style: italic;
  display: block;
}

.product-notes {
  font-family: var(--font-body);
  font-size: 14px;
  font-weight: 400;
  color: var(--color-text-muted);
  margin: 0 0 24px 0;
  flex: 1;
}
```

---

## Dark Mode Adaptation Guide

Retro Analog dark mode swaps cream to espresso — the same warmth, just in candlelight instead of daylight.

| Light Token | Light Value | Dark Value | Notes |
|-------------|-------------|------------|-------|
| `--color-bg` | `#F5F0E8` | `#3A2820` | Dark espresso — rich, not cold |
| `--color-bg-band` | `#E8E0D0` | `#2A1E18` | Deeper espresso for alternate bands |
| `--color-text` | `#5C4033` | `#F5F0E8` | Cream text on espresso background |
| `--color-text-muted` | `#8C7060` | `#C4A882` | Warm sand as muted text — readable |
| `--color-primary` | `#C65D3E` | `#C65D3E` | Terracotta holds well on dark — unchanged |
| `--color-secondary` | `#D4A843` | `#D4A843` | Mustard is equally warm on dark — unchanged |
| `--color-tertiary` | `#8B9E7E` | `#8B9E7E` | Sage is muted enough to work unchanged |
| `--color-anchor` | `#5C4033` | `#F5F0E8` | Anchor flips to cream in dark mode |
| `--color-neutral` | `#C4A882` | `#5C4033` | Sand lightens to espresso in dark context |
| `--color-divider` | `#D4C4AA` | `#5C4033` | Espresso divider on dark surface |

```css
@media (prefers-color-scheme: dark) {
  :root {
    --color-bg:           #3A2820;
    --color-bg-band:      #2A1E18;
    --color-text:         #F5F0E8;
    --color-text-muted:   #C4A882;
    --color-primary:      #C65D3E;
    --color-secondary:    #D4A843;
    --color-tertiary:     #8B9E7E;
    --color-anchor:       #F5F0E8;
    --color-neutral:      #5C4033;
    --color-divider:      #5C4033;
  }
}
```

**Dark mode rules:** Paper grain persists — it is even more important on dark surfaces to maintain the analog texture. Duotone photography shifts to the espresso + cream variant. Badge borders use terracotta unchanged. The letterpress text-shadow reverses: dark highlight replaces the white highlight.

```css
@media (prefers-color-scheme: dark) {
  .letterpress {
    text-shadow:
      1px 1px 1px rgba(0, 0, 0, 0.5),
      -1px -1px 1px rgba(245, 240, 232, 0.15);
  }
}
```

---

## Anti-Patterns (What This Is NOT)

| ❌ Pattern | Why It Fails |
|-----------|-------------|
| Pure white backgrounds (`#FFFFFF`) | White is cold and clinical. The surface must be cream (`#F5F0E8`) or warm parchment |
| Pure black text (`#000000`) | Hard black ink on cream is the wrong era. Use espresso (`#5C4033`) |
| Cold blue accent colors | Blue belongs to tech minimalism. The entire color wheel here is warm: terracotta, mustard, sage |
| Sans-serif for headlines | Grotesques signal digital precision. Warm serifs are non-negotiable for the craft register |
| Sharp corners everywhere (`border-radius: 0`) | The aesthetic permits slight radius (2–4px). Zero radius is Swiss modernism, not craft warmth |
| Flat icon packs (Heroicons, Lucide, etc.) | Ornamental flourishes, botanical illustrations, and hand-drawn marks — not uniform icon libraries |
| CSS gradients as primary backgrounds | Backgrounds are flat earth tones. Gradients appear only in duotone image overlays |
| Cold photography (desaturated blue-toned) | Photography is warm-toned, duotone terracotta-cream, or high-contrast warm grayscale |
| Thin type weights (300 or below for display) | Craft type has mass. Light weights are modern and lean |
| Fast transitions under 0.3s | Analog warmth requires slowness. Quick snap transitions feel digital and cold |
| Exact symmetry, grid-perfect placement | The hand-placed feel requires deliberate asymmetry — elements that appear placed by eye |
| Hover glow effects | Warm lift (`translateY(-2–3px)`) is the retro hover. Glows are sci-fi |
| Drop shadows in blue or purple | Box shadows use warm brown: `rgba(92, 64, 51, 0.12)`. Cold-toned shadows kill the warmth |
