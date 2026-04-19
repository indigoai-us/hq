---
name: liminal-portal
description: Liminal Portal design style pack — contemplative, atmospheric, threshold-crossing dark aesthetic. Warm peach portal glow against near-black, heavy film grain, architectural framing, slow entrance animations. Use for immersive brand experiences, conceptual portfolios, atmospheric product launches, and any experience that should feel like standing at the edge of something.
---

# Liminal Portal Design — Style Pack

A codified design language rooted in the aesthetics of liminal spaces, architectural minimalism, and atmospheric film photography. This guide provides a complete visual system — typography, color, layout, motion, texture, and component patterns — for experiences that need to feel transitional, contemplative, and mysterious.

**When to use:** Any time the design direction calls for "liminal", "portal", "threshold", "immersive", "atmospheric", "mysterious", "contemplative", "cinematic dark", "architectural", or "slow luxury" aesthetic. The surface is always dark — this is not an invertable light-mode style. A warm light variant is described at the end.

**Prerequisite:** Load `frontend-design` SKILL.md first for general design principles. This guide layers on top as a specific aesthetic direction.

---

## Core Philosophy

Liminal Portal design is about **standing at the edge of something**. The visitor is neither here nor there — they are in a threshold. The design holds them in that suspended state: dark surround, a single warm light source ahead, the invitation to step through.

**Three pillars:**
1. **Shadow majority** — 60% or more of every composition is in deep shadow. The light source earns its power by contrast
2. **The portal** — a single warm radial gradient simulates a glowing aperture. It anchors the composition and draws the eye
3. **Atmospheric grain** — heavy noise texture removes digital cleanness, adding weight and physical presence

**The feeling:** Standing in a long dark corridor with a door of warm light at the end. A film photograph of an empty theater. A room glimpsed through a keyhole. You're invited to cross, but the crossing has significance.

---

## Typography System

### Font Stack

| Role | Primary | Fallback | Notes |
|------|---------|----------|-------|
| Display | **Crimson Pro** ExtraLight/Light | Georgia, serif | Weight 200–300 only. Ultra-thin serif for atmospheric gravitas |
| Body | **Space Grotesk** Light | system-ui, sans-serif | Weight 300–400. Modern, a bit architectural |

**Google Fonts import:**
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Crimson+Pro:ital,wght@0,200;0,300;1,200;1,300&family=Space+Grotesk:wght@300;400&display=swap" rel="stylesheet">
```

```css
:root {
  --font-display: 'Crimson Pro', Georgia, serif;
  --font-body:    'Space Grotesk', system-ui, sans-serif;
}
```

### Type Scale

```
Display hero:  clamp(48px, 7vw, 96px)   — display, weight 200, line-height 0.95, letter-spacing 0.04em
Section title: clamp(28px, 4vw, 48px)   — display, weight 200, italic, line-height 1.05
Body:          15px                       — body, weight 300, line-height 1.85, color: var(--color-text-muted)
Label:         10px                       — body, uppercase, weight 400, tracking 0.22em, color: var(--color-portal)
Caption:       11px                       — body, weight 300, italic
```

### Type Rules

- **Weight 200 (ExtraLight) for display headlines** — ultra-thin type at dark scale creates the sensation of something carved out of shadow
- **Wide letter-spacing on display** — `0.04em` opens up the weight-200 type and makes it legible at dark scale
- **Labels use the portal color (`#F5D5C8`)** — warm peach labels signal that these text elements connect to the light source
- **Body text is muted (`#8A7F78`)** — warm gray, not light text. Primary content recedes slightly; the portal and section titles lead
- **Italic section titles** — italic at weight 200 is almost drawn, not printed. The cursive lean feels like motion
- **Text-transform: none on display** — no uppercase for headlines. The delicacy of lowercase at weight 200 is the whole point

### Typography Anti-Patterns

- ❌ Weight 400+ for display type — any weight above 300 in display looks bold and shatters the atmosphere
- ❌ Sans-serif display — this aesthetic requires the delicacy of a thin serif at scale
- ❌ Pure white text — warm off-white (`#E8DDD6`) only. Pure white is cold
- ❌ Tight body line-height (< 1.7) — liminal text needs space; claustrophobia belongs to the shadow zones, not the text
- ❌ Tight tracking on display (negative or zero) — the wide tracking (`0.04em`) is structural
- ❌ High-contrast bright accent colors — no neon, no vivid hues. Only warm peach, soft coral, muted teal

---

## Color Palettes

### Primary Liminal Palette

```css
:root {
  --font-display: 'Crimson Pro', Georgia, serif;
  --font-body:    'Space Grotesk', system-ui, sans-serif;

  --color-bg:          #1A1A1E;              /* near-black, slightly warm */
  --color-bg-mid:      #242428;              /* elevated surfaces — subtle lift */
  --color-portal:      #F5D5C8;              /* warm peach — the light source */
  --color-coral:       #E8A87C;              /* warm accent — portal outer glow */
  --color-teal-shadow: #3D5A5B;              /* cool shadow tones */
  --color-teal-mid:    #5C7A7D;              /* mid-tone teal-gray */
  --color-text:        #E8DDD6;              /* warm off-white — primary text */
  --color-text-muted:  #8A7F78;              /* warm gray — body text */
  --color-glow:        rgba(245, 213, 200, 0.15); /* portal ambient glow */
  --color-frame:       rgba(245, 213, 200, 0.08);  /* architectural frame lines */
}
```

### Color Rules

- **Near-black is always warm** — `#1A1A1E` has a very slight warm undertone. Never pure `#000000` or cold neutral black
- **Portal peach is the sole bright element** — it appears in labels, frame accents, and the radial gradient light source. Use it once per section maximum
- **Teal-shadow is the counterpoint** — the cool shadow tones balance the warm portal without competing with it
- **Body text is warm gray, not white** — `#8A7F78` recedes slightly, letting section titles and labels lead
- **No other accent colors** — there is no blue, no green, no purple. Only the warm-to-cool spectrum of peach → coral → teal shadow

---

## Layout Patterns

### Structural Grid

```
Max width:       1100px (centered composition), full-bleed for portal sections
Column system:   12 columns, 20px gutter
Page padding:    clamp(24px, 5vw, 72px) sides
Section padding: 120–160px vertical (desktop), 80px (mobile)
```

### Portal Section Layout

The signature full-screen portal — a radial warm light against the dark background.

```css
.portal-section {
  position: relative;
  width: 100%;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: radial-gradient(
    ellipse at 50% 60%,
    #F5D5C8 0%,
    #E8A87C 12%,
    #3D5A5B 45%,
    #1A1A1E 78%
  );
}

/* Vignette to deepen the outer darkness */
.portal-section::after {
  content: "";
  position: absolute;
  inset: 0;
  background: radial-gradient(
    ellipse at 50% 50%,
    transparent 35%,
    rgba(26, 26, 30, 0.4) 65%,
    rgba(26, 26, 30, 0.75) 100%
  );
  pointer-events: none;
}

.portal-content {
  position: relative;
  z-index: 2;
  text-align: center;
  padding-inline: clamp(24px, 5vw, 72px);
  max-width: 800px;
}
```

### Architectural Frame Layout

Inset border elements create visual "doorways" — the threshold motif.

```html
<section class="arch-frame-section">
  <div class="arch-frame" aria-hidden="true"></div>
  <div class="arch-content">
    <p class="label">Threshold</p>
    <h2 class="section-title"><em>The Space Between</em></h2>
    <p class="body-text">Not yet arrived. Not yet departed. This is where things change.</p>
  </div>
</section>
```

```css
.arch-frame-section {
  position: relative;
  padding: 120px clamp(24px, 5vw, 72px);
  background: var(--color-bg);
}

.arch-frame {
  position: absolute;
  inset: 40px;
  border: 1px solid var(--color-frame);
  pointer-events: none;
}

/* Inner frame accent — double border doorway effect */
.arch-frame::before {
  content: "";
  position: absolute;
  inset: 20px;
  border: 1px solid rgba(245, 213, 200, 0.04);
}

.arch-content {
  position: relative;
  z-index: 1;
  max-width: 640px;
  margin-inline: auto;
  text-align: center;
}
```

### Standard Content Section

```css
.content-section {
  max-width: 1100px;
  margin-inline: auto;
  padding: 120px clamp(24px, 5vw, 72px);
}

.section-header {
  margin-bottom: 64px;
}

.section-label {
  font-family: var(--font-body);
  font-size: 10px;
  font-weight: 400;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--color-portal);
  margin-bottom: 16px;
}

.section-title {
  font-family: var(--font-display);
  font-size: clamp(28px, 4vw, 48px);
  font-weight: 200;
  font-style: italic;
  line-height: 1.05;
  letter-spacing: 0.04em;
  color: var(--color-text);
}
```

---

## Structural Elements

### Portal Frame Lines

Thin lines radiating from the implied portal — like architectural perspective lines.

```css
.portal-frame-lines {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
}

.portal-frame-lines::before,
.portal-frame-lines::after {
  content: "";
  position: absolute;
  background: linear-gradient(
    to bottom,
    transparent,
    rgba(245, 213, 200, 0.06) 40%,
    rgba(245, 213, 200, 0.06) 60%,
    transparent
  );
}

.portal-frame-lines::before {
  left: 15%;
  top: 0;
  width: 1px;
  height: 100%;
}

.portal-frame-lines::after {
  right: 15%;
  top: 0;
  width: 1px;
  height: 100%;
}
```

### Section Divider

No horizontal rules — darkness transitions via gradient.

```css
.liminal-divider {
  width: 100%;
  height: 160px;
  background: linear-gradient(
    to bottom,
    var(--color-bg),
    var(--color-bg-mid),
    var(--color-bg)
  );
  position: relative;
}

.liminal-divider::after {
  content: "";
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 1px;
  height: 60px;
  background: linear-gradient(to bottom, transparent, var(--color-portal), transparent);
  opacity: 0.4;
}
```

### Architectural Caption / Label

```css
.arch-label {
  font-family: var(--font-body);
  font-size: 10px;
  font-weight: 400;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--color-portal);
  display: flex;
  align-items: center;
  gap: 12px;
}

.arch-label::before {
  content: "";
  display: block;
  width: 24px;
  height: 1px;
  background: var(--color-portal);
  opacity: 0.5;
}
```

---

## Button Patterns

### Primary (Portal Glow)

```css
.btn-primary {
  font-family: var(--font-body);
  font-size: 11px;
  font-weight: 400;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  padding: 14px 48px;
  background: transparent;
  border: 1px solid rgba(245, 213, 200, 0.3);
  color: var(--color-portal);
  cursor: pointer;
  display: inline-block;
  text-decoration: none;
  position: relative;
  transition: border-color 0.5s ease,
              box-shadow 0.5s ease,
              color 0.3s ease;
}

.btn-primary:hover {
  border-color: var(--color-portal);
  color: var(--color-portal);
  box-shadow: 0 0 24px rgba(245, 213, 200, 0.12),
              inset 0 0 24px rgba(245, 213, 200, 0.04);
}
```

### Secondary (Receding)

```css
.btn-secondary {
  font-family: var(--font-body);
  font-size: 11px;
  font-weight: 300;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  padding: 14px 48px;
  background: transparent;
  border: 1px solid rgba(140, 127, 120, 0.2);
  color: var(--color-text-muted);
  cursor: pointer;
  display: inline-block;
  text-decoration: none;
  transition: border-color 0.5s ease, color 0.5s ease;
}

.btn-secondary:hover {
  border-color: rgba(245, 213, 200, 0.2);
  color: var(--color-text);
}
```

### Button Rules

- **Both buttons are outline/ghost** — fills would block the atmospheric dark background
- **Portal color for primary** — the primary action uses `var(--color-portal)` to connect it to the light source
- **Slow transitions (0.5s)** — button responses mirror the atmospheric slowness of the whole system
- **Subtle inner glow on hover** — a very faint inset box-shadow completes the portal metaphor on primary hover
- **Never square-cornered industrial style** — no `border-radius: 0` here; flat (no radius) or 1px is fine
- **No background fills** — solid-fill buttons belong to assertive design systems, not liminal ones

---

## Motion Primitives

All motion is CSS + IntersectionObserver + requestAnimationFrame. Zero external libraries.

### Threshold Entrance — Primary Animation

Elements step through the portal: slow scale + opacity, suggesting emergence.

```css
[data-motion="threshold"] {
  opacity: 0;
  transform: scale(0.96) translateY(16px);
  transition: opacity 1.2s cubic-bezier(0.25, 0.46, 0.45, 0.94),
              transform 1.2s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}

[data-motion="threshold"].is-visible {
  opacity: 1;
  transform: scale(1) translateY(0);
}

@media (prefers-reduced-motion: reduce) {
  [data-motion="threshold"] {
    opacity: 1;
    transform: none;
    transition: none;
  }
}
```

```javascript
(function() {
  var els = document.querySelectorAll('[data-motion="threshold"]');
  if (!els.length) return;

  var observer = new IntersectionObserver(function(entries) {
    entries.forEach(function(entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

  els.forEach(function(el) { observer.observe(el); });
})();
```

### Portal Glow Pulse — Ambient Animation

The portal radiates softly, like breathing.

```css
.portal-glow-pulse {
  animation: portal-pulse 6s ease-in-out infinite;
  will-change: opacity;
}

@keyframes portal-pulse {
  0%   { opacity: 0.85; }
  50%  { opacity: 1.0; }
  100% { opacity: 0.85; }
}

@media (prefers-reduced-motion: reduce) {
  .portal-glow-pulse { animation: none; }
}
```

### Stagger Threshold — Grid Entrance

```css
[data-motion-liminal] {
  opacity: 0;
  transform: scale(0.97) translateY(20px);
  transition: opacity 1.0s cubic-bezier(0.25, 0.46, 0.45, 0.94),
              transform 1.0s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}

[data-motion-liminal].is-visible {
  opacity: 1;
  transform: scale(1) translateY(0);
}

@media (prefers-reduced-motion: reduce) {
  [data-motion-liminal] {
    opacity: 1;
    transform: none;
    transition: none;
  }
}
```

```javascript
(function() {
  var grids = document.querySelectorAll('[data-motion="stagger-liminal"]');
  if (!grids.length) return;

  grids.forEach(function(grid) {
    var items = grid.querySelectorAll('[data-motion-liminal]');
    items.forEach(function(item, i) {
      item.style.transitionDelay = (i * 140) + 'ms';
    });

    var observer = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting) {
          entry.target.querySelectorAll('[data-motion-liminal]').forEach(function(child) {
            child.classList.add('is-visible');
          });
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.06 });

    observer.observe(grid);
  });
})();
```

### Frame Reveal — Architectural Border Animation

Border lines grow outward from a central point, like a doorway appearing.

```css
.frame-reveal {
  position: relative;
}

.frame-reveal::before,
.frame-reveal::after {
  content: "";
  position: absolute;
  border: 1px solid var(--color-frame);
  transition: inset 1.4s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}

/* Start: collapsed to center */
.frame-reveal::before { inset: 50%; }
.frame-reveal::after  { inset: 50%; border-color: rgba(245, 213, 200, 0.04); }

/* Expanded: full frame */
.frame-reveal.is-visible::before { inset: 0; }
.frame-reveal.is-visible::after  { inset: 12px; }

@media (prefers-reduced-motion: reduce) {
  .frame-reveal::before { inset: 0; transition: none; }
  .frame-reveal.is-visible::before { inset: 0; }
  .frame-reveal::after  { inset: 12px; transition: none; }
}
```

```javascript
(function() {
  var frames = document.querySelectorAll('.frame-reveal');
  if (!frames.length) return;

  var observer = new IntersectionObserver(function(entries) {
    entries.forEach(function(entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15 });

  frames.forEach(function(el) { observer.observe(el); });
})();
```

---

## Texture & Grain

### Heavy Film Grain

This style uses grain at 2× the opacity of luxury — 0.065 vs 0.035. The grain is structural, creating physical weight.

```css
.liminal-grain {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 90;
}

/* Heavy grain layer */
.liminal-grain::before {
  content: "";
  position: absolute;
  inset: 0;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='grain'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.07' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='300' height='300' filter='url(%23grain)'/%3E%3C/svg%3E");
  background-repeat: repeat;
  background-size: 300px 300px;
  opacity: 0.065;
}

/* Deep vignette layer — draws eye to portal center */
.liminal-grain::after {
  content: "";
  position: absolute;
  inset: 0;
  background: radial-gradient(
    ellipse at 50% 50%,
    transparent 25%,
    rgba(26, 26, 30, 0.25) 55%,
    rgba(26, 26, 30, 0.60) 80%,
    rgba(26, 26, 30, 0.80) 100%
  );
}
```

### SVG Atmospheric Depth Filters

Place once in the document. Reference in CSS.

```html
<svg width="0" height="0" style="position:absolute;overflow:hidden;">
  <defs>
    <!-- Soft portal glow blur for background shapes -->
    <filter id="portal-glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="40" result="blur"/>
      <feColorMatrix in="blur" type="matrix"
        values="1 0.2 0.1 0 0
                0.8 0.7 0.6 0 0
                0.7 0.6 0.5 0 0
                0   0   0   0.8 0"/>
    </filter>
    <!-- Subtle depth blur for secondary background elements -->
    <filter id="depth-blur">
      <feGaussianBlur in="SourceGraphic" stdDeviation="16"/>
    </filter>
    <!-- Warm color grade for photography -->
    <filter id="warm-grade">
      <feColorMatrix type="matrix"
        values="1.05 0.05 0    0 0.02
                0.02 0.98 0.02 0 0.01
                0    0    0.90 0 0
                0    0    0    1 0"/>
    </filter>
  </defs>
</svg>
```

```css
.portal-bg-shape {
  filter: url(#portal-glow);
}

.depth-element {
  filter: url(#depth-blur);
}

.photo-warm {
  filter: url(#warm-grade);
}
```

### Radial Vignette on Photography

Images in this style receive a very heavy vignette to reinforce the portal-of-light concept.

```css
.liminal-photo {
  position: relative;
  display: block;
  overflow: hidden;
}

.liminal-photo img {
  width: 100%;
  display: block;
  filter: url(#warm-grade) grayscale(0.15) contrast(1.05);
}

.liminal-photo::after {
  content: "";
  position: absolute;
  inset: 0;
  background: radial-gradient(
    ellipse at 50% 50%,
    transparent 20%,
    rgba(26, 26, 30, 0.4) 55%,
    rgba(26, 26, 30, 0.80) 90%
  );
  pointer-events: none;
}
```

---

## Component Patterns

### Portal Hero

The primary landing pattern — full-screen portal gradient with centered headline and CTA.

```
┌──────────────────────────────────────────────────────┐
│   [deep shadow — dark corners]                       │
│                                                      │
│         [warm peach to coral to teal gradient]       │
│                                                      │
│              THRESHOLD  ←— label                     │
│                                                      │
│         something begins here                        │
│                                                      │
│         [  Enter  ]                                  │
│                                                      │
│   [deep shadow — dark corners]                       │
└──────────────────────────────────────────────────────┘
```

```html
<section class="portal-hero portal-glow-pulse">
  <div class="portal-frame-lines" aria-hidden="true"></div>
  <div class="portal-content" data-motion="threshold">
    <p class="section-label">Threshold</p>
    <h1 class="portal-headline">something begins here</h1>
    <p class="portal-subhead">A contemplative approach to what comes next.</p>
    <a href="#" class="btn-primary">Enter</a>
  </div>
</section>
```

```css
.portal-hero {
  position: relative;
  width: 100%;
  height: 100vh;
  min-height: 600px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: radial-gradient(
    ellipse at 50% 60%,
    #F5D5C8 0%,
    #E8A87C 14%,
    #3D5A5B 48%,
    #1A1A1E 80%
  );
}

/* Deep outer vignette */
.portal-hero::after {
  content: "";
  position: absolute;
  inset: 0;
  background: radial-gradient(
    ellipse at 50% 50%,
    transparent 32%,
    rgba(26, 26, 30, 0.45) 62%,
    rgba(26, 26, 30, 0.80) 100%
  );
  pointer-events: none;
}

.portal-content {
  position: relative;
  z-index: 2;
  text-align: center;
  padding-inline: clamp(24px, 5vw, 72px);
  max-width: 700px;
}

.portal-headline {
  font-family: var(--font-display);
  font-size: clamp(48px, 7vw, 96px);
  font-weight: 200;
  line-height: 0.95;
  letter-spacing: 0.04em;
  color: var(--color-text);
  margin-block: 16px 24px;
}

.portal-subhead {
  font-family: var(--font-body);
  font-size: 15px;
  font-weight: 300;
  line-height: 1.85;
  color: var(--color-text-muted);
  max-width: 440px;
  margin-inline: auto;
  margin-bottom: 40px;
}
```

### Liminal Feature Cards

Cards with architectural frame lines and portal glow on hover.

```
┌─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐   ┌─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐
 ┌─────────────────────────────┐       ┌─────────────────────────────┐ 
 │   [barely-there frame]      │       │   [barely-there frame]      │ 
 │                             │       │                             │ 
 │   — Label                   │       │   — Label                   │ 
 │                             │       │                             │ 
 │   Card Title                │       │   Card Title                │ 
 │   Body text that is         │       │   Body text that is         │ 
 │   muted and recedes.        │       │   muted and recedes.        │ 
 └─────────────────────────────┘       └─────────────────────────────┘ 
└─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘   └─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘
```

```html
<div class="liminal-cards" data-motion="stagger-liminal">
  <div class="liminal-card frame-reveal" data-motion-liminal>
    <p class="arch-label">01</p>
    <h3 class="card-title"><em>The Corridor</em></h3>
    <p class="card-body">Every entrance must first be a passage. The length of the corridor determines how much the destination means.</p>
  </div>
  <div class="liminal-card frame-reveal" data-motion-liminal>
    <p class="arch-label">02</p>
    <h3 class="card-title"><em>The Threshold</em></h3>
    <p class="card-body">A line on the floor separates two worlds. The act of crossing it cannot be undone.</p>
  </div>
  <div class="liminal-card frame-reveal" data-motion-liminal>
    <p class="arch-label">03</p>
    <h3 class="card-title"><em>The Portal</em></h3>
    <p class="card-body">Light ahead. Darkness behind. The moment of crossing suspended in amber and teal.</p>
  </div>
</div>
```

```css
.liminal-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 2px;
  max-width: 1100px;
  margin-inline: auto;
  padding-inline: clamp(24px, 5vw, 72px);
  background: rgba(245, 213, 200, 0.06);
}

.liminal-card {
  padding: 48px 36px;
  background: var(--color-bg);
  position: relative;
  transition: background 0.5s ease;
}

.liminal-card:hover {
  background: var(--color-bg-mid);
}

.liminal-card:hover::after {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 1px;
  background: linear-gradient(to right, transparent, var(--color-portal), transparent);
  opacity: 0.5;
}

.card-title {
  font-family: var(--font-display);
  font-size: clamp(22px, 2.8vw, 32px);
  font-weight: 200;
  font-style: italic;
  line-height: 1.1;
  letter-spacing: 0.04em;
  color: var(--color-text);
  margin-block: 12px 16px;
}

.card-body {
  font-family: var(--font-body);
  font-size: 14px;
  font-weight: 300;
  line-height: 1.85;
  color: var(--color-text-muted);
}
```

### Photography Section with Portal Vignette

```html
<section class="liminal-photo-section">
  <div class="liminal-photo-wrap liminal-photo" data-motion="threshold">
    <img src="corridor.jpg" alt="Long corridor with warm light at end">
    <div class="photo-caption-overlay">
      <p class="arch-label">Photography</p>
      <p class="photo-caption-text"><em>Light at the end, 2024</em></p>
    </div>
  </div>
</section>
```

```css
.liminal-photo-section {
  max-width: 1100px;
  margin-inline: auto;
  padding-inline: clamp(24px, 5vw, 72px);
  padding-block: 80px;
}

.liminal-photo-wrap {
  position: relative;
  overflow: hidden;
}

.photo-caption-overlay {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 32px 28px;
  background: linear-gradient(
    to top,
    rgba(26, 26, 30, 0.85) 0%,
    transparent 100%
  );
}

.photo-caption-text {
  font-family: var(--font-body);
  font-size: 11px;
  font-weight: 300;
  font-style: italic;
  letter-spacing: 0.1em;
  color: var(--color-text-muted);
  margin-top: 8px;
}
```

---

## Light / Warm Variant Adaptation Guide

When the liminal aesthetic must work on a light surface (print collateral, morning brand moments):

| Dark Token | Light / Warm Value | Notes |
|------------|-------------------|-------|
| `--color-bg: #1A1A1E` | `--color-bg: #F5EDE4` | Warm cream — never pure white |
| `--color-bg-mid: #242428` | `--color-bg-mid: #EDE3D8` | Deeper cream for surface lift |
| `--color-text: #E8DDD6` | `--color-text: #2C2828` | Very dark warm brown |
| `--color-text-muted: #8A7F78` | `--color-text-muted: #6A5E58` | Medium warm brown |
| `--color-portal: #F5D5C8` | `--color-portal: #C17F59` | Terracotta replaces peach on light |
| `--color-coral: #E8A87C` | `--color-coral: #A05C3A` | Deeper coral for contrast |
| `--color-glow: rgba(245,213,200,.15)` | `--color-glow: rgba(193,127,89,.10)` | Subtle terracotta ambient |
| Portal radial gradient | Reversed — peach in from edges | Light comes from outside, not within |

```css
/* Light variant — class-toggled or media-query-driven */
.liminal-light {
  --color-bg:          #F5EDE4;
  --color-bg-mid:      #EDE3D8;
  --color-text:        #2C2828;
  --color-text-muted:  #6A5E58;
  --color-portal:      #C17F59;
  --color-coral:       #A05C3A;
  --color-glow:        rgba(193, 127, 89, 0.10);
  --color-frame:       rgba(44, 40, 40, 0.08);
}

/* Portal gradient inverted for light mode */
.liminal-light .portal-section {
  background: radial-gradient(
    ellipse at 50% 50%,
    #EDE3D8 0%,
    #E8C9B4 30%,
    #C17F59 65%,
    #F5EDE4 100%
  );
}
```

---

## Anti-Patterns

| ❌ Pattern | Why It Fails |
|-----------|-------------|
| Pure black (`#000000`) background | Cold, digital. The near-black must be warm — `#1A1A1E`, not `#000000` |
| Any weight above 300 for display | Thin type is the whole point — heaviness grounds something that must feel weightless |
| Multiple bright accent colors | There is one light source (the portal). Multiple accents create chaos instead of focus |
| White text (pure `#FFFFFF`) | Warm off-white (`#E8DDD6`) only. White is cold; this aesthetic is warm |
| Flat dark sections without gradient variation | Pure flat dark reads as an app, not an atmosphere |
| No grain texture | Grain is structural here — its absence makes the design feel sterile and digital |
| Sans-serif display at hero scale | The thin serif is the architecture. Sans-serif reads as generic dark SaaS |
| Rounded corners (`border-radius > 2px`) | Architectural framing requires sharp edges — doorways have corners, not curves |
| Filled buttons | Solid-fill buttons are assertive; this aesthetic is invitational and receding |
| Fast transitions (< 0.8s) | Everything moves slowly. Fast transitions shatter the contemplative atmosphere |
| Neon or vivid accent colors | No `#00FFFF`, no vivid `#FF3366`. The palette is warm + muted teal only |
| Centered body text | Body text is left-aligned or left-offset — centering only at hero/portal moments |
| Drop shadows (box-shadow: 0 8px) | Elevation shadows are a product UI pattern. Use border lines and vignette instead |
| Backdrop-filter glass on dark backgrounds | Glass works on light/gradient surfaces — on dark `#1A1A1E`, it reads as nothing |
