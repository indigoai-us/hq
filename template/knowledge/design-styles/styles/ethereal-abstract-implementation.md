---
name: ethereal-abstract
description: Ethereal Abstract design style pack — dreamy, atmospheric, premium. Warm gradients, frosted glass panels, SVG blur filters, bokeh circles, film grain, mix-blend-mode layering. Use for brand imagery, thought leadership, premium SaaS hero sections, creative agency sites, and mindful/wellness products.
---

# Ethereal Abstract Design — Style Pack

A codified design language drawn from the tradition of atmospheric photography, soft-focus editorial imagery, and warm-palette premium branding. This guide provides a complete visual system — typography, color, layout, motion, texture, and component patterns — for projects that should feel like premium, contemplative, or warmly aspirational.

**When to use:** Any time the design direction calls for "atmospheric", "dreamy", "premium SaaS", "brand imagery", "thought leadership", "warm and inviting", "soft luxury", "mindful", or "creative agency hero" aesthetic. Works for dark and light surface variants; cream is the default.

**Prerequisite:** Load `frontend-design` SKILL.md first for general design principles. This guide layers on top as a specific aesthetic direction.

---

## Core Philosophy

Ethereal Abstract design is about **atmosphere before information**. The visitor should feel something before they read anything. Color, blur, and light do emotional work before typography begins.

**Three pillars:**
1. **Warm light** — amber and cream tones read as safe, generous, and aspirational. Cool tech is the opposite of this aesthetic
2. **Soft depth** — layered blurs, frosted panels, and radial gradients create dimensionality without hard edges
3. **Organic restraint** — organic forms, minimal text, and generous negative space signal premium without aggression

**The feeling:** Looking through frosted glass at a golden-hour sunset. A spa lobby on a quiet afternoon. A beautifully photographed essay about slowing down. Warm, a little mysterious, clearly expensive.

---

## Typography System

### Font Stack

| Role | Primary | Fallback | Notes |
|------|---------|----------|-------|
| Display | **Cormorant Garamond** Light/Light-italic | Georgia, serif | Weight 300 only. Italic preferred at large scales |
| Body | **DM Sans** Light | system-ui, sans-serif | Weight 300–400. Understated, modern, never bold |

**Google Fonts import:**
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;1,300;1,400&family=DM+Sans:wght@300;400&display=swap" rel="stylesheet">
```

```css
:root {
  --font-display: 'Cormorant Garamond', Georgia, serif;
  --font-body:    'DM Sans', system-ui, sans-serif;
}
```

### Type Scale

```
Display hero:   clamp(56px, 9vw, 128px)   — display, weight 300, italic, line-height 1.0, tracking 0.02em
Section title:  clamp(32px, 4.5vw, 56px)  — display, weight 300, line-height 1.1
Accent quote:   clamp(24px, 3.5vw, 40px)  — display, weight 300, italic
Body:           16px                        — body, weight 400, line-height 1.8
Label:          11px                        — body, uppercase, weight 300, tracking 0.18em
Caption:        12px                        — display, weight 300, italic
```

### Type Rules

- **Display is almost always italic at large scales** — the oblique angle of italic Cormorant reads as contemplative, not aggressive
- **Weight 300 throughout** — no bold anywhere. Heaviness is antithetical to the ethereal register
- **Tracking opens at labels:** 0.18em for uppercase labels, 0.02em for headlines (slightly more open than default), 0 for body
- **Lowercase preferred at hero scale** — mirrors the dark luxury tradition; lowercase is confidence without announcement
- **Caption uses italic display font** — this style uses the serif italic even at small sizes for consistency

### Typography Anti-Patterns

- ❌ Bold or semibold text anywhere — weight reads as forceful, opposite of the mood
- ❌ Condensed or grotesque display type — this aesthetic is rooted in high-contrast serif elegance
- ❌ High-contrast black/white type — text lives in warm amber, slate, and cream tones, not pure black
- ❌ Small tracking on labels — labels must breathe widely (0.18em minimum)
- ❌ More than two typefaces — one elegant serif display, one minimal sans body
- ❌ System UI at display scale — generic and cold

---

## Color Palettes

### Primary Ethereal Palette

```css
:root {
  --font-display: 'Cormorant Garamond', Georgia, serif;
  --font-body:    'DM Sans', system-ui, sans-serif;

  --color-bg:           #F5EDE4;              /* warm cream — primary surface */
  --color-bg-deep:      #EDE3D8;              /* deeper cream — alt sections */
  --color-amber:        #D4A574;              /* primary warm accent */
  --color-teal:         #7BA3A8;              /* primary cool balance */
  --color-terracotta:   #C17F59;              /* secondary warm accent */
  --color-slate:        #2C3E50;              /* dark text — never pure black */
  --color-slate-muted:  #5A6B75;              /* secondary text */
  --color-gold:         #D4A020;              /* golden highlight — muted for UI */
  --color-fog:          rgba(245, 237, 228, 0.72); /* frosted glass base */
  --color-fog-teal:     rgba(123, 163, 168, 0.18); /* teal tint for glass */
}
```

### Color Rules

- **Cream is the surface, amber is the warmth, teal is the counterbalance** — never all warm, never all cool. The tension between amber and teal creates the depth
- **Text is dark slate, never black** — `#2C3E50` instead of `#000000`. The warmth must carry through to text color
- **Gold (`#D4A020`) is used once** — a single golden accent per composition. More dilutes it
- **Teal is used for atmosphere, not content** — bokeh backgrounds, gradient layers, frosted glass tints
- **No pure white surfaces** — even the lightest surface is `#F5EDE4`. White is cold, cream is warm

---

## Layout Patterns

### Structural Grid

```
Max width:       1200px (standard), full-bleed for atmospheric sections
Column system:   12 columns, 24px gutter
Page padding:    clamp(24px, 5vw, 80px) sides
Section padding: 100–140px vertical (desktop), 64–80px (mobile)
```

### Soft Gradient Sections

Sections bleed into each other via gradient transitions — there are no hard horizontal rules.

```css
.section-gradient {
  position: relative;
  padding-block: 120px;
}

.section-gradient::before {
  content: "";
  position: absolute;
  top: -80px;
  left: 0;
  right: 0;
  height: 160px;
  background: linear-gradient(to bottom, transparent, var(--color-bg-deep));
  pointer-events: none;
}
```

### Atmospheric Hero Layout

```html
<section class="hero-ethereal">
  <div class="hero-bokeh-layer" aria-hidden="true">
    <div class="bokeh-circle bokeh-1"></div>
    <div class="bokeh-circle bokeh-2"></div>
    <div class="bokeh-circle bokeh-3"></div>
  </div>
  <div class="hero-blur-bg" aria-hidden="true"></div>
  <div class="hero-content">
    <p class="hero-label">Brand Presence</p>
    <h1 class="hero-headline"><em>Beauty lives in<br>the space between</em></h1>
    <p class="hero-body">A contemplative approach to visual identity, rooted in warmth and restraint.</p>
    <a href="#" class="btn-primary">Begin the Journey</a>
  </div>
</section>
```

```css
.hero-ethereal {
  position: relative;
  min-height: 100vh;
  display: flex;
  align-items: center;
  overflow: hidden;
  background: radial-gradient(ellipse at 30% 60%, #EDE3D8 0%, #F5EDE4 60%, #E8DDD6 100%);
}

.hero-content {
  position: relative;
  z-index: 2;
  max-width: 800px;
  margin-inline: auto;
  padding-inline: clamp(24px, 5vw, 80px);
  text-align: left;
}

.hero-label {
  font-family: var(--font-body);
  font-size: 11px;
  font-weight: 300;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--color-terracotta);
  margin-bottom: 24px;
}

.hero-headline {
  font-family: var(--font-display);
  font-size: clamp(56px, 9vw, 128px);
  font-weight: 300;
  font-style: italic;
  line-height: 1.0;
  letter-spacing: 0.02em;
  color: var(--color-slate);
  margin-bottom: 28px;
}

.hero-body {
  font-family: var(--font-body);
  font-size: 16px;
  font-weight: 400;
  line-height: 1.8;
  color: var(--color-slate-muted);
  max-width: 480px;
  margin-bottom: 40px;
}
```

---

## Structural Elements

### Frosted Glass Panel

The signature surface of the ethereal style — panels float over gradient backgrounds with blur.

```css
.glass-panel {
  background: var(--color-fog);
  backdrop-filter: blur(24px) saturate(1.5);
  -webkit-backdrop-filter: blur(24px) saturate(1.5);
  border: 1px solid rgba(245, 237, 228, 0.4);
  border-radius: 2px;
}

/* Teal-tinted glass variant */
.glass-panel-teal {
  background: rgba(123, 163, 168, 0.12);
  backdrop-filter: blur(20px) saturate(1.6);
  -webkit-backdrop-filter: blur(20px) saturate(1.6);
  border: 1px solid rgba(123, 163, 168, 0.2);
  border-radius: 2px;
}
```

### SVG Atmospheric Blur Filter

Applied to background decorative shapes to create soft atmospheric depth.

```html
<!-- Place in HTML once, use filter references in CSS -->
<svg width="0" height="0" style="position:absolute;">
  <defs>
    <filter id="atmospheric-blur">
      <feGaussianBlur in="SourceGraphic" stdDeviation="32" result="blur"/>
      <feColorMatrix in="blur" type="saturate" values="1.4"/>
    </filter>
    <filter id="soft-glow">
      <feGaussianBlur in="SourceGraphic" stdDeviation="12"/>
    </filter>
  </defs>
</svg>
```

```css
.bg-shape-filtered {
  filter: url(#atmospheric-blur);
}

.glow-filtered {
  filter: url(#soft-glow);
}
```

### Soft Rule / Divider

No hard horizontal rules — use gradient fades.

```css
.soft-rule {
  width: 100%;
  height: 1px;
  background: linear-gradient(
    to right,
    transparent,
    var(--color-amber) 30%,
    var(--color-amber) 70%,
    transparent
  );
  opacity: 0.35;
  margin-block: 60px;
}

.accent-rule {
  width: 48px;
  height: 1px;
  background: var(--color-terracotta);
  margin-bottom: 20px;
  opacity: 0.7;
}
```

### Labels

```css
.label {
  font-family: var(--font-body);
  font-size: 11px;
  font-weight: 300;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--color-terracotta);
}

.label-teal {
  color: var(--color-teal);
}
```

---

## Button Patterns

### Primary (Amber Fill)

```css
.btn-primary {
  font-family: var(--font-body);
  font-size: 12px;
  font-weight: 400;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  padding: 14px 44px;
  background: var(--color-terracotta);
  border: 1px solid var(--color-terracotta);
  color: #F5EDE4;
  cursor: pointer;
  display: inline-block;
  text-decoration: none;
  transition: background 0.4s ease, box-shadow 0.4s ease;
  border-radius: 1px;
}

.btn-primary:hover {
  background: #A96B48;
  box-shadow: 0 8px 32px rgba(193, 127, 89, 0.28);
}
```

### Secondary (Ghost)

```css
.btn-secondary {
  font-family: var(--font-body);
  font-size: 12px;
  font-weight: 400;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  padding: 13px 43px;
  background: transparent;
  border: 1px solid rgba(44, 62, 80, 0.3);
  color: var(--color-slate);
  cursor: pointer;
  display: inline-block;
  text-decoration: none;
  transition: border-color 0.3s ease, background 0.3s ease;
  border-radius: 1px;
}

.btn-secondary:hover {
  border-color: var(--color-terracotta);
  background: rgba(193, 127, 89, 0.06);
  color: var(--color-terracotta);
}
```

### Button Rules

- **No `border-radius: 0`** — a very subtle 1px radius (or none) is acceptable; hard industrial squares are not this style
- **Slow transitions (0.3–0.4s)** — buttons respond slowly and gently, like everything in this system
- **Hover glow is permitted on primary** — a warm box-shadow on hover reinforces the light/warmth theme
- **Never pure black fill** — use terracotta or slate for fills, never #000000
- **Text buttons exist here** — a simple underline with letter-spacing is a valid CTA pattern for this style

---

## Motion Primitives

All motion is CSS + IntersectionObserver + requestAnimationFrame. Zero external libraries.

### Soft Fade Rise — Primary Entrance

Slower and softer than industrial or editorial — elements drift in.

```css
[data-motion="fade-rise"] {
  opacity: 0;
  transform: translateY(32px);
  transition: opacity 1.0s cubic-bezier(0.25, 0.46, 0.45, 0.94),
              transform 1.0s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}

[data-motion="fade-rise"].is-visible {
  opacity: 1;
  transform: translateY(0);
}

@media (prefers-reduced-motion: reduce) {
  [data-motion="fade-rise"] {
    opacity: 1;
    transform: none;
    transition: none;
  }
}
```

```javascript
(function() {
  var els = document.querySelectorAll('[data-motion="fade-rise"]');
  if (!els.length) return;

  var observer = new IntersectionObserver(function(entries) {
    entries.forEach(function(entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -60px 0px' });

  els.forEach(function(el) { observer.observe(el); });
})();
```

### Bokeh Float Animation

Background bokeh circles drift slowly — pure CSS, no JS.

```css
.bokeh-circle {
  position: absolute;
  border-radius: 50%;
  pointer-events: none;
  will-change: transform;
}

.bokeh-1 {
  width: 480px;
  height: 480px;
  background: radial-gradient(circle, rgba(212, 165, 116, 0.22) 0%, transparent 70%);
  top: -100px;
  left: -80px;
  animation: bokeh-drift-1 18s ease-in-out infinite;
}

.bokeh-2 {
  width: 360px;
  height: 360px;
  background: radial-gradient(circle, rgba(123, 163, 168, 0.18) 0%, transparent 70%);
  top: 40%;
  right: -60px;
  animation: bokeh-drift-2 22s ease-in-out infinite;
}

.bokeh-3 {
  width: 260px;
  height: 260px;
  background: radial-gradient(circle, rgba(193, 127, 89, 0.15) 0%, transparent 70%);
  bottom: 10%;
  left: 30%;
  animation: bokeh-drift-3 26s ease-in-out infinite;
}

@keyframes bokeh-drift-1 {
  0%   { transform: translate(0, 0) scale(1); }
  33%  { transform: translate(40px, 30px) scale(1.05); }
  66%  { transform: translate(-20px, 50px) scale(0.98); }
  100% { transform: translate(0, 0) scale(1); }
}

@keyframes bokeh-drift-2 {
  0%   { transform: translate(0, 0) scale(1); }
  40%  { transform: translate(-50px, -30px) scale(1.08); }
  70%  { transform: translate(30px, 20px) scale(0.95); }
  100% { transform: translate(0, 0) scale(1); }
}

@keyframes bokeh-drift-3 {
  0%   { transform: translate(0, 0) scale(1); }
  30%  { transform: translate(30px, -40px) scale(1.04); }
  65%  { transform: translate(-40px, 20px) scale(1.0); }
  100% { transform: translate(0, 0) scale(1); }
}

@media (prefers-reduced-motion: reduce) {
  .bokeh-circle { animation: none; }
}
```

### Stagger Reveal — Cards / Features

```css
[data-motion-child] {
  opacity: 0;
  transform: translateY(24px);
  transition: opacity 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94),
              transform 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}

[data-motion-child].is-visible {
  opacity: 1;
  transform: translateY(0);
}

@media (prefers-reduced-motion: reduce) {
  [data-motion-child] {
    opacity: 1;
    transform: none;
    transition: none;
  }
}
```

```javascript
(function() {
  var grids = document.querySelectorAll('[data-motion="stagger"]');
  if (!grids.length) return;

  grids.forEach(function(grid) {
    var items = grid.querySelectorAll('[data-motion-child]');
    items.forEach(function(item, i) {
      item.style.transitionDelay = (i * 100) + 'ms';
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
    }, { threshold: 0.08 });

    observer.observe(grid);
  });
})();
```

### Glass Panel Bloom — Hover Effect

```css
.glass-panel {
  transition: backdrop-filter 0.5s ease,
              box-shadow 0.5s ease,
              transform 0.5s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}

.glass-panel:hover {
  backdrop-filter: blur(32px) saturate(1.8);
  -webkit-backdrop-filter: blur(32px) saturate(1.8);
  box-shadow: 0 16px 48px rgba(212, 165, 116, 0.18);
  transform: translateY(-4px);
}

@media (prefers-reduced-motion: reduce) {
  .glass-panel,
  .glass-panel:hover {
    transition: none;
    transform: none;
  }
}
```

---

## Texture & Grain

### Film Grain + Soft Vignette

A warm film grain and vignette creates atmospheric softness — the primary texture of this style.

```css
.grain-vignette {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 80;
}

/* Film grain layer */
.grain-vignette::before {
  content: "";
  position: absolute;
  inset: 0;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='256' height='256'%3E%3Cfilter id='grain'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.72' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='256' height='256' filter='url(%23grain)' opacity='1'/%3E%3C/svg%3E");
  background-repeat: repeat;
  background-size: 256px 256px;
  opacity: 0.032;
}

/* Soft vignette layer */
.grain-vignette::after {
  content: "";
  position: absolute;
  inset: 0;
  background: radial-gradient(
    ellipse at 50% 50%,
    transparent 40%,
    rgba(44, 62, 80, 0.10) 80%,
    rgba(44, 62, 80, 0.20) 100%
  );
}
```

### Color Wash Overlay

A warm amber wash unifies sections and photography.

```css
.color-wash {
  position: relative;
  overflow: hidden;
}

.color-wash::after {
  content: "";
  position: absolute;
  inset: 0;
  background: radial-gradient(
    ellipse at 50% 0%,
    rgba(212, 165, 116, 0.12) 0%,
    transparent 60%
  );
  pointer-events: none;
  mix-blend-mode: multiply;
}
```

### Bokeh Decoration Layer

Static bokeh for non-animated sections.

```css
.bokeh-static {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
}

.bokeh-static::before {
  content: "";
  position: absolute;
  width: 400px;
  height: 400px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(212, 165, 116, 0.18) 0%, transparent 65%);
  top: -10%;
  left: -5%;
  filter: url(#soft-glow);
}

.bokeh-static::after {
  content: "";
  position: absolute;
  width: 300px;
  height: 300px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(123, 163, 168, 0.14) 0%, transparent 65%);
  bottom: -5%;
  right: -3%;
  filter: url(#soft-glow);
}
```

---

## Component Patterns

### Feature Card with Glass Panel

```
┌─────────────────────────────────┐
│    [warm gradient background]   │
│                                 │
│   ┌─────────────────────────┐   │
│   │   [Glass Panel]         │   │
│   │                         │   │
│   │   Icon or small image   │   │
│   │                         │   │
│   │   Feature Title         │   │
│   │   Description text      │   │
│   │                         │   │
│   └─────────────────────────┘   │
└─────────────────────────────────┘
```

```html
<div class="feature-cards" data-motion="stagger">
  <div class="glass-card" data-motion-child>
    <div class="card-icon">
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
        <circle cx="16" cy="16" r="12" stroke="#D4A574" stroke-width="1.5"/>
        <circle cx="16" cy="16" r="4" fill="#D4A574" opacity="0.5"/>
      </svg>
    </div>
    <h3 class="card-title">Warm Presence</h3>
    <p class="card-body">A soft-focused approach to visual identity that builds trust through atmosphere.</p>
  </div>
  <div class="glass-card" data-motion-child>
    <div class="card-icon">
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
        <path d="M4 16 Q16 4 28 16 Q16 28 4 16Z" stroke="#7BA3A8" stroke-width="1.5" fill="none"/>
      </svg>
    </div>
    <h3 class="card-title">Quiet Depth</h3>
    <p class="card-body">Layers of blur and light create a sense of spatial richness without complexity.</p>
  </div>
  <div class="glass-card" data-motion-child>
    <div class="card-icon">
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
        <rect x="8" y="8" width="16" height="16" stroke="#C17F59" stroke-width="1.5" rx="1"/>
        <rect x="12" y="12" width="8" height="8" fill="#C17F59" opacity="0.3" rx="0.5"/>
      </svg>
    </div>
    <h3 class="card-title">Organic Form</h3>
    <p class="card-body">Rounded edges and natural gradients evoke organic warmth rather than digital precision.</p>
  </div>
</div>
```

```css
.feature-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 24px;
  max-width: 1100px;
  margin-inline: auto;
  padding-inline: clamp(24px, 5vw, 80px);
  padding-block: 80px;
}

.glass-card {
  padding: 40px 32px;
  background: var(--color-fog);
  backdrop-filter: blur(24px) saturate(1.5);
  -webkit-backdrop-filter: blur(24px) saturate(1.5);
  border: 1px solid rgba(245, 237, 228, 0.5);
  border-radius: 2px;
  transition: transform 0.5s cubic-bezier(0.25, 0.46, 0.45, 0.94),
              box-shadow 0.5s ease;
}

.glass-card:hover {
  transform: translateY(-6px);
  box-shadow: 0 20px 48px rgba(212, 165, 116, 0.16);
}

.card-icon {
  margin-bottom: 24px;
}

.card-title {
  font-family: var(--font-display);
  font-size: clamp(20px, 2.5vw, 28px);
  font-weight: 300;
  font-style: italic;
  line-height: 1.2;
  color: var(--color-slate);
  margin-bottom: 12px;
}

.card-body {
  font-family: var(--font-body);
  font-size: 15px;
  font-weight: 400;
  line-height: 1.8;
  color: var(--color-slate-muted);
}
```

### Testimonial / Quote Panel

```
┌────────────────────────────────────────────────────┐
│          [atmospheric gradient background]          │
│                                                    │
│    "Working with this team changed how we think    │
│     about presence and identity."                  │
│                                                    │
│         — Name, Company                            │
│                                                    │
└────────────────────────────────────────────────────┘
```

```html
<section class="quote-section">
  <div class="bokeh-static" aria-hidden="true"></div>
  <blockquote class="atmospheric-quote" data-motion="fade-rise">
    <p class="quote-text">"Working with this team changed how we think about presence and identity."</p>
    <footer class="quote-attribution">
      <span class="quote-name">Name</span>
      <span class="quote-sep">—</span>
      <span class="quote-company">Company</span>
    </footer>
  </blockquote>
</section>
```

```css
.quote-section {
  position: relative;
  background: radial-gradient(ellipse at 50% 50%, #EDE3D8 0%, var(--color-bg) 70%);
  padding-block: 120px;
  overflow: hidden;
}

.atmospheric-quote {
  max-width: 720px;
  margin-inline: auto;
  padding-inline: clamp(24px, 5vw, 80px);
  text-align: center;
  position: relative;
  z-index: 1;
}

.quote-text {
  font-family: var(--font-display);
  font-size: clamp(28px, 4vw, 48px);
  font-weight: 300;
  font-style: italic;
  line-height: 1.3;
  letter-spacing: 0.01em;
  color: var(--color-slate);
  margin-bottom: 32px;
}

.quote-attribution {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 8px;
  font-family: var(--font-body);
  font-size: 12px;
  font-weight: 300;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--color-slate-muted);
}

.quote-name { color: var(--color-terracotta); }
.quote-sep { opacity: 0.4; }
```

### Image + Glass Overlay Card

```html
<div class="image-glass-card" data-motion="fade-rise">
  <div class="igc-image-wrap">
    <img src="landscape.jpg" alt="Atmospheric landscape">
    <div class="igc-blend-layer"></div>
  </div>
  <div class="igc-glass-caption">
    <p class="label">Series 01</p>
    <h3 class="igc-title"><em>Light Through Glass</em></h3>
  </div>
</div>
```

```css
.image-glass-card {
  position: relative;
  border-radius: 2px;
  overflow: hidden;
}

.igc-image-wrap {
  position: relative;
}

.igc-image-wrap img {
  width: 100%;
  display: block;
  filter: saturate(0.85) brightness(0.95);
}

.igc-blend-layer {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    135deg,
    rgba(212, 165, 116, 0.25) 0%,
    rgba(123, 163, 168, 0.15) 100%
  );
  mix-blend-mode: multiply;
  pointer-events: none;
}

.igc-glass-caption {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 28px 24px;
  background: rgba(245, 237, 228, 0.70);
  backdrop-filter: blur(16px) saturate(1.4);
  -webkit-backdrop-filter: blur(16px) saturate(1.4);
  border-top: 1px solid rgba(245, 237, 228, 0.4);
}

.igc-title {
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 300;
  font-style: italic;
  color: var(--color-slate);
  margin: 6px 0 0;
}
```

---

## Dark Mode Adaptation Guide

When applying Ethereal Abstract to a dark surface (night variant):

| Light Token | Dark Value | Notes |
|-------------|------------|-------|
| `--color-bg: #F5EDE4` | `--color-bg: #1C1814` | Very warm dark — never pure black |
| `--color-bg-deep: #EDE3D8` | `--color-bg-deep: #221E19` | Deeper warm dark for alt sections |
| `--color-slate: #2C3E50` | `--color-text: #EDE3D8` | Warm off-white for primary text |
| `--color-slate-muted: #5A6B75` | `--color-text-muted: #A09080` | Warm mid-tone for secondary text |
| `--color-amber: #D4A574` | `--color-amber: #D4A574` | Amber works on both — keep it |
| `--color-teal: #7BA3A8` | `--color-teal: #7BA3A8` | Teal works on both — keep it |
| `--color-terracotta: #C17F59` | `--color-terracotta: #D4956E` | Slightly lighter on dark |
| `--color-fog: rgba(245,237,228,.72)` | `--color-fog: rgba(28,24,20,.72)` | Dark glass |

```css
@media (prefers-color-scheme: dark) {
  :root {
    --color-bg:          #1C1814;
    --color-bg-deep:     #221E19;
    --color-slate:       #EDE3D8;
    --color-slate-muted: #A09080;
    --color-terracotta:  #D4956E;
    --color-fog:         rgba(28, 24, 20, 0.72);
    --color-fog-teal:    rgba(123, 163, 168, 0.10);
  }
}
```

---

## Anti-Patterns

| ❌ Pattern | Why It Fails |
|-----------|-------------|
| Bold or heavy type anywhere | Weight is incompatible with the ethereal register — everything must float |
| Pure black (`#000000`) text or backgrounds | This style lives in warm near-blacks and near-whites, never pure values |
| Hard horizontal rules between sections | Sections bleed into each other via gradient — hard rules break the atmospheric flow |
| Industrial sharp-cornered cards | No `border-radius: 0` — soft single-pixel radius or fully soft (4–8px) is appropriate |
| High-saturation accent colors | Vivid colors (pure red, pure blue) shatter the warm-toned atmosphere |
| Condensed or grotesque display type | This is a serif italic system; condensed sans is alien to the register |
| Tight line-height on body (< 1.7) | Ethereal text breathes widely — 1.8 is the standard |
| Large flat color section fills | Sections are gradient-to-gradient; flat fills look like a different design system |
| Glowing neon or electric colors | Warm light, not neon. No `#00FFFF`, no vivid violet |
| Drop shadows on text | Text reads through atmosphere; text shadows add digital harshness |
| Squared-off photography (hard crop) | Soft blur edges, circular masks, or image-into-gradient fades are preferred |
| No grain or texture | The grain layer is structural — removing it makes the design feel sterile |
