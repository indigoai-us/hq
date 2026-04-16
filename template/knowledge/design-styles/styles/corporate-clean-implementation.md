---
name: corporate-clean
description: Corporate Clean design style pack — Inter/DM Sans type system, {company} CTA palette, soft shadows, alternating section rhythm. The canonical B2B SaaS design language (Stripe, Linear, Notion). Use for product landing pages, developer tools, and enterprise software marketing.
---

# Corporate Clean Design — Style Pack

A codified design language practiced by Stripe, Linear, Notion, Figma, Vercel, and Intercom. This skill provides a complete visual system — typography, color, layout, motion, and component patterns — that can be applied to any B2B SaaS or developer-tool product.

**When to use:** Any time the design direction calls for "professional", "modern SaaS", "developer tool", "product-led growth", "B2B landing page", or "enterprise software marketing". Works for both light (white/gray) and dark (deep slate) palettes.

**Prerequisite:** Load `frontend-design` SKILL.md first for general design principles. This skill layers on top as a specific aesthetic direction.

---

## Core Philosophy

Corporate Clean is about **approachable authority**. Every element projects competence without coldness. Whitespace does structural work. Rounded forms signal safety. Type carries weight through hierarchy, not loudness.

**Three pillars:**
1. **Trust** — metrics, logos, testimonials, and security signals woven into the layout as load-bearing elements
2. **Clarity** — section-based page rhythm with alternating backgrounds, scannable feature grids, and generous whitespace
3. **Polish** — soft shadows, micro-gradients, and precise rounded corners signal craft at every scale

**The feeling:** A Stripe dashboard, a Linear changelog, a Notion product page. Capable, calm, and just opinionated enough to feel like someone made real decisions.

---

## Typography System

### Font Stack

| Role | Primary | Fallback | Notes |
|------|---------|----------|-------|
| Display / Headlines | **Inter** or **DM Sans** | system-ui, sans-serif | Semibold–Bold, tight tracking at large sizes |
| Body | **Inter** | system-ui, sans-serif | Regular 400, 16–18px, 1.6 line-height |
| Code / Data | **Geist Mono** or **JetBrains Mono** | monospace | Pricing tiers, code snippets, metric callouts |

### Type Scale

```
Hero headline:     clamp(44px, 6vw, 72px)    — semibold 600, line-height 1.05, tracking -0.03em
Section title:     clamp(28px, 3.5vw, 40px)  — semibold 600, line-height 1.15, tracking -0.02em
Card heading:      18–22px                    — semibold 600, line-height 1.3
Body text:         16–18px                    — regular 400, line-height 1.65
Label / Eyebrow:   12–13px                    — semibold 600, letter-spacing 0.05em, uppercase
Caption / Meta:    13–14px                    — regular 400, slate-500
Metric number:     clamp(32px, 4vw, 56px)     — bold 700 or extrabold 800, tracking -0.02em
```

### Type Rules

- **Headlines use sentence case** — only the first word and proper nouns capitalized. All-caps is reserved for eyebrow labels only
- **Tight tracking at display sizes:** -0.02em at 28–40px, -0.03em at 44px+. Never apply negative tracking below 16px
- **Line-height contrast:** display type tight (1.0–1.15), body generous (1.6–1.7). The rhythm difference creates scannable hierarchy
- **Gradient text is acceptable once per page** — hero headline only, using the brand {company} to violet range. Never apply to body copy or labels
- **Metric callouts:** oversized bold/extrabold number paired with a small regular-weight descriptor label beneath — always mono-font for the number

### Typography Anti-Patterns

- ❌ Condensed or display fonts — Inter's neutrality is load-bearing; personality comes from layout and color, not type novelty
- ❌ All-caps body copy or section titles — reserved for 12px eyebrow labels only
- ❌ Thin/ultralight weights (100–300) — insufficient contrast; minimum usable weight is 400 for body, 600 for headings
- ❌ Mixed serif and sans-serif within the same section — pick one and commit
- ❌ Tracking adjustments on body text — never add or subtract letter-spacing from 14–18px copy
- ❌ Gradient text on anything below the hero — devalues the accent; use it once and stop

---

## Color Palettes

### Light Palette (Primary)

```css
:root {
  /* Backgrounds */
  --bg-primary:    #FFFFFF;   /* page base, cards */
  --bg-secondary:  #F8F9FA;   /* alternating sections, subtle cards */
  --bg-tertiary:   #F1F3F5;   /* input fills, hover states, nested surfaces */

  /* Text */
  --text-primary:   #0F172A;  /* headings, high-emphasis body */
  --text-secondary: #475569;  /* supporting body copy */
  --text-tertiary:  #94A3B8;  /* captions, placeholders, meta */

  /* Brand */
  --brand:          #4F46E5;  /* CTA buttons, active states, links */
  --brand-hover:    #4338CA;  /* button hover, link hover */
  --brand-subtle:   #EEF2FF;  /* brand-tinted bg on hero, icon bg */
  --brand-border:   #C7D2FE;  /* soft brand-adjacent borders */

  /* Structural */
  --border:         #E2E8F0;  /* hairline dividers, card borders, inputs */
  --border-strong:  #CBD5E1;  /* more visible separators, focused states */

  /* Status */
  --success:        #22C55E;  /* badges, checkmarks, positive metrics */
  --success-subtle: #DCFCE7;  /* success badge background */

  /* Typography (CSS custom props for convenience) */
  --font-sans: 'Inter', system-ui, -apple-system, sans-serif;
  --font-mono: 'Geist Mono', 'JetBrains Mono', monospace;
}
```

### Dark Palette

```css
:root[data-theme="dark"] {
  /* Backgrounds */
  --bg-primary:    #0B1120;  /* deep navy-slate page base */
  --bg-secondary:  #131C2E;  /* alternating sections */
  --bg-tertiary:   #1A2540;  /* cards, elevated surfaces */

  /* Text */
  --text-primary:   #F1F5F9;  /* headings */
  --text-secondary: #94A3B8;  /* supporting body */
  --text-tertiary:  #475569;  /* captions, placeholders */

  /* Brand */
  --brand:          #6366F1;  /* slightly lighter for dark-bg legibility */
  --brand-hover:    #818CF8;  /* hover — even lighter */
  --brand-subtle:   #1E1B4B;  /* brand-tinted dark surface */
  --brand-border:   #3730A3;  /* brand-adjacent border on dark */

  /* Structural */
  --border:         #1E293B;  /* card borders, hairlines */
  --border-strong:  #334155;  /* more visible separators */

  /* Status */
  --success:        #22C55E;
  --success-subtle: #052E16;

  --font-sans: 'Inter', system-ui, -apple-system, sans-serif;
  --font-mono: 'Geist Mono', 'JetBrains Mono', monospace;
}
```

### Color Rules

- **Brand color is reserved for action and emphasis** — CTA buttons, active nav indicators, links, icon backgrounds. Never use it as a section background fill
- **Alternating section backgrounds create free scannable rhythm** — every other full-width section uses `--bg-secondary`. Never use more than two background tones on the same page (plus pure white)
- **{company} gradient on hero is allowed** — `linear-gradient(135deg, #EEF2FF 0%, #FFFFFF 60%)` as a light wash. Keep opacity below 30% on the color stop
- **Shadow system uses slate opacity, not black** — `rgba(15, 23, 42, 0.08)` not `rgba(0,0,0,0.08)` — integrates warmer with the slate text palette
- **Desaturate partner logos** — logo bar logos at `filter: grayscale(100%) opacity(0.45)`. On hover: `grayscale(0%) opacity(1)`

---

## Layout Patterns

### Structural Grid

```
Max width:        1200px (content), 1400px (full-bleed sections)
Side padding:     24px (mobile), 40px (tablet), 80px (desktop)
Section padding:  96px vertical (desktop), 64px (tablet), 48px (mobile)
Column gutter:    24px (default), 32px (feature grids)
```

### Hero Section (Center-Aligned)

```css
.hero {
  padding: 96px 80px 80px;
  text-align: center;
  background: linear-gradient(180deg, #EEF2FF 0%, #FFFFFF 55%);
  position: relative;
}

.hero__inner {
  max-width: 720px;
  margin: 0 auto;
}

/* Radial brand glow behind hero copy — subtle */
.hero::before {
  content: '';
  position: absolute;
  top: 0; left: 50%;
  transform: translateX(-50%);
  width: 800px;
  height: 400px;
  background: radial-gradient(ellipse at center top, rgba(79, 70, 229, 0.10) 0%, transparent 70%);
  pointer-events: none;
}
```

### Alternating Feature Sections (Two-Column)

```css
.feature-split {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 80px;
  align-items: center;
  padding: 96px 80px;
  max-width: 1200px;
  margin: 0 auto;
}

/* Flip direction on alternate rows */
.feature-split--reversed {
  direction: rtl;
}
.feature-split--reversed > * {
  direction: ltr;
}
```

### Three-Column Feature Grid

```css
.feature-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 24px;
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 80px;
}

@media (max-width: 900px) {
  .feature-grid { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 560px) {
  .feature-grid { grid-template-columns: 1fr; }
}
```

---

## Structural Elements

### Rules / Dividers

| Element | CSS | When |
|---------|-----|------|
| Section hairline | `border-top: 1px solid var(--border)` | Between full-width sections |
| Card top accent | `border-top: 2px solid var(--brand)` | Feature card emphasis treatment |
| Eyebrow underline | `width: 32px; height: 2px; background: var(--brand); margin-bottom: 12px` | Below eyebrow label, above section title |

### Badges / Trust Signals

The "pill badge" above the hero headline — single most recognizable Corporate Clean pattern:

```css
.hero-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px 6px 8px;
  background: var(--brand-subtle);      /* #EEF2FF */
  border: 1px solid var(--brand-border); /* #C7D2FE */
  border-radius: 9999px;
  font-family: var(--font-sans);
  font-size: 13px;
  font-weight: 600;
  color: var(--brand);                   /* #4F46E5 */
  margin-bottom: 20px;
}

.hero-badge__dot {
  width: 6px; height: 6px;
  border-radius: 9999px;
  background: var(--brand);
}
```

HTML: `<div class="hero-badge"><span class="hero-badge__dot"></span> New · Changelog →</div>`

### Feature Icon Treatment

48×48px rounded square with brand-tinted background and centered icon:

```css
.feature-icon {
  width: 48px;
  height: 48px;
  border-radius: 10px;
  background: var(--brand-subtle);   /* #EEF2FF */
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 16px;
  flex-shrink: 0;
}

.feature-icon svg {
  width: 22px;
  height: 22px;
  color: var(--brand);              /* #4F46E5 */
}
```

### Card Shadow System

Three shadow tiers. Use one per component — never combine:

```css
/* Tier 1: Resting card (feature cards, pricing cards) */
.shadow-sm {
  box-shadow:
    0 1px 3px rgba(15, 23, 42, 0.08),
    0 4px 16px rgba(15, 23, 42, 0.06);
}

/* Tier 2: Elevated card (testimonial, highlighted pricing) */
.shadow-md {
  box-shadow:
    0 2px 8px rgba(15, 23, 42, 0.08),
    0 8px 32px rgba(15, 23, 42, 0.10);
}

/* Tier 3: Lifted state (hover, modal, dropdown) */
.shadow-lg {
  box-shadow:
    0 4px 16px rgba(15, 23, 42, 0.10),
    0 16px 48px rgba(15, 23, 42, 0.14);
}
```

### Labels (Eyebrow Text)

Section eyebrow labels — always above the title:

```css
.eyebrow {
  font-family: var(--font-sans);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--brand);          /* #4F46E5 */
  margin-bottom: 12px;
}
```

Pattern: `EYEBROW → TITLE → SUB-COPY → CONTENT`

---

## Button Patterns

### Primary Pill CTA

```css
.btn-primary {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 12px 24px;
  background: var(--brand);       /* #4F46E5 */
  color: #FFFFFF;
  border: none;
  border-radius: 9999px;          /* full pill */
  font-family: var(--font-sans);
  font-size: 15px;
  font-weight: 600;
  line-height: 1;
  cursor: pointer;
  transition: background 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease;
}

.btn-primary:hover {
  background: var(--brand-hover); /* #4338CA */
  box-shadow: 0 4px 12px rgba(79, 70, 229, 0.30);
  transform: translateY(-1px);
}

.btn-primary:active {
  transform: translateY(0);
  box-shadow: none;
}
```

### Secondary Outline

```css
.btn-secondary {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 12px 24px;
  background: transparent;
  color: var(--text-primary);     /* #0F172A */
  border: 1.5px solid var(--border-strong); /* #CBD5E1 */
  border-radius: 9999px;
  font-family: var(--font-sans);
  font-size: 15px;
  font-weight: 600;
  line-height: 1;
  cursor: pointer;
  transition: border-color 0.15s ease, color 0.15s ease, background 0.15s ease;
}

.btn-secondary:hover {
  border-color: var(--brand);     /* #4F46E5 */
  color: var(--brand);
  background: var(--brand-subtle); /* #EEF2FF */
}
```

### Button Rules

- **Always pill-shaped** — `border-radius: 9999px`. Square or slightly-rounded buttons break the Corporate Clean language
- **Font weight 600** — medium-weight feels weak; semibold minimum for button labels
- **Generous padding** — 12px vertical, 24px horizontal minimum. Tall buttons feel cheap
- **Hover shift:** primary darkens + adds a brand-colored shadow; secondary gains a brand-colored border + tinted bg
- **Never use uppercase for button labels** — sentence case preserves the approachable register
- **Icon-in-button:** arrow or chevron trailing icon at 16px, with 8px gap — acceptable; leading icons at 18px for icon-first buttons

---

## Motion Primitives

All motion is CSS + IntersectionObserver. Zero external libraries.

### Scroll Reveal (Fade Up)

```css
[data-motion="fade-up"] {
  opacity: 0;
  transform: translateY(30px);
  transition:
    opacity 0.4s ease,
    transform 0.4s ease;
}

[data-motion="fade-up"].is-visible {
  opacity: 1;
  transform: translateY(0);
}

@media (prefers-reduced-motion: reduce) {
  [data-motion="fade-up"] {
    opacity: 1;
    transform: none;
    transition: none;
  }
  .card:hover {
    transform: none;
  }
  .btn-primary--pulse {
    animation: none;
  }
  input:focus, textarea:focus {
    transition: none;
  }
}
```

### Stagger Children

```javascript
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (!entry.isIntersecting) return;
    const children = entry.target.querySelectorAll('[data-motion="fade-up"]');
    children.forEach((el, i) => {
      el.style.transitionDelay = `${i * 80}ms`;
      el.classList.add('is-visible');
    });
    observer.unobserve(entry.target);
  });
}, { threshold: 0.1 });

document.querySelectorAll('[data-stagger]').forEach(el => observer.observe(el));
```

### Micro-animations

```css
/* Card hover lift */
.card {
  transition: box-shadow 0.2s ease, transform 0.2s ease;
}
.card:hover {
  transform: translateY(-3px);
  box-shadow:
    0 4px 16px rgba(15, 23, 42, 0.10),
    0 16px 48px rgba(15, 23, 42, 0.14);
}

/* Button glow pulse (CTA only — use sparingly) */
@keyframes cta-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(79, 70, 229, 0); }
  50%       { box-shadow: 0 0 0 8px rgba(79, 70, 229, 0.12); }
}
.btn-primary--pulse {
  animation: cta-pulse 2.5s ease infinite;
}

/* Input focus ring */
input:focus, textarea:focus {
  outline: none;
  border-color: var(--brand);
  box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.15);
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
```

### Motion Rules

- **Always respect `prefers-reduced-motion`** — disable all transforms and transitions; opacity-only fades are acceptable as fallback
- **No bounce, spring, or elastic easing** — `ease` or `cubic-bezier(0.4, 0, 0.2, 1)` (Material standard) only
- **Stagger at 60–80ms intervals** — faster feels rushed, slower feels sluggish; 80ms is the sweet spot for 3-column grids
- **Fade-up distance: 30px** — not 60px (too dramatic), not 10px (imperceptible). 30px is the Corporate Clean signature
- **Duration cap: 0.4s** — anything longer breaks the "snappy" quality; interactions (hover, focus) use 0.15–0.2s

---

## Texture & Grain

### Gradient Hero Background

```css
.hero {
  background:
    radial-gradient(ellipse 800px 400px at 50% 0%, rgba(79, 70, 229, 0.09) 0%, transparent 70%),
    linear-gradient(180deg, #EEF2FF 0%, #FFFFFF 55%);
}
```

### Mesh Gradient (Section Accent — Sparingly)

For one high-emphasis section (e.g., pricing or testimonials on dark background):

```css
.section-mesh {
  background:
    radial-gradient(ellipse 600px 600px at 20% 50%, rgba(99, 102, 241, 0.12) 0%, transparent 65%),
    radial-gradient(ellipse 500px 500px at 80% 20%, rgba(139, 92, 246, 0.08) 0%, transparent 65%),
    #0B1120;
}
```

### Noise Texture (Optional)

Subtle SVG noise over hero or dark sections — adds analog warmth at very low opacity:

```css
.noise::after {
  content: '';
  position: absolute;
  inset: 0;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='1'/%3E%3C/svg%3E");
  background-size: 200px 200px;
  opacity: 0.03;
  pointer-events: none;
  mix-blend-mode: overlay;
}
```

---

## Component Patterns

### Feature Card Grid

```
┌────────────────────┐  ┌────────────────────┐  ┌────────────────────┐
│  [icon bg 48×48]   │  │  [icon bg 48×48]   │  │  [icon bg 48×48]   │
│                    │  │                    │  │                    │
│  Card Heading      │  │  Card Heading      │  │  Card Heading      │
│  Two lines of      │  │  Two lines of      │  │  Two lines of      │
│  descriptor copy   │  │  descriptor copy   │  │  descriptor copy   │
└────────────────────┘  └────────────────────┘  └────────────────────┘
```

```css
.feature-card {
  background: var(--bg-primary);          /* #FFFFFF */
  border: 1px solid var(--border);        /* #E2E8F0 */
  border-top: 2px solid var(--brand);     /* #4F46E5 accent */
  border-radius: 12px;
  padding: 28px 24px;
  box-shadow:
    0 1px 3px rgba(15, 23, 42, 0.08),
    0 4px 16px rgba(15, 23, 42, 0.06);
  transition: box-shadow 0.2s ease, transform 0.2s ease;
}

.feature-card:hover {
  transform: translateY(-3px);
  box-shadow:
    0 4px 16px rgba(15, 23, 42, 0.10),
    0 16px 48px rgba(15, 23, 42, 0.14);
}

.feature-card__heading {
  font-family: var(--font-sans);
  font-size: 17px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 8px;
  letter-spacing: -0.01em;
}

.feature-card__body {
  font-size: 15px;
  color: var(--text-secondary);           /* #475569 */
  line-height: 1.6;
  margin: 0;
}
```

### Metric Callout Row

```
┌──────────────────────────────────────────────────────────────────────┐
│    10M+              99.99%              < 50ms              $0       │
│    Requests/day      Uptime SLA          P99 Latency         Setup    │
└──────────────────────────────────────────────────────────────────────┘
```

```css
.metric-row {
  display: flex;
  justify-content: center;
  gap: 64px;
  padding: 48px 80px;
  background: var(--bg-secondary);        /* #F8F9FA */
  border-top: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
}

.metric-item {
  text-align: center;
}

.metric-item__number {
  font-family: var(--font-mono);
  font-size: clamp(32px, 4vw, 48px);
  font-weight: 700;
  color: var(--text-primary);             /* #0F172A */
  letter-spacing: -0.02em;
  line-height: 1;
  display: block;
  margin-bottom: 6px;
}

.metric-item__label {
  font-family: var(--font-sans);
  font-size: 13px;
  font-weight: 400;
  color: var(--text-tertiary);            /* #94A3B8 */
  display: block;
}

@media (max-width: 680px) {
  .metric-row {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 32px;
  }
}
```

### Testimonial Card

```
┌──────────────────────────────────────────────┐
│  ★★★★★                                        │
│                                              │
│  "The best tool we've used. Reduced our      │
│   onboarding time by 60% in the first week." │
│                                              │
│  ○ Name Surname                              │
│    Role, Company                             │
└──────────────────────────────────────────────┘
```

```css
.testimonial-card {
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 32px;
  box-shadow:
    0 2px 8px rgba(15, 23, 42, 0.08),
    0 8px 32px rgba(15, 23, 42, 0.10);
}

.testimonial-card__stars {
  font-size: 14px;
  color: #F59E0B;                         /* amber — universal 5-star color */
  letter-spacing: 2px;
  margin-bottom: 16px;
}

.testimonial-card__quote {
  font-family: var(--font-sans);
  font-size: 16px;
  font-weight: 400;
  color: var(--text-primary);
  line-height: 1.65;
  margin: 0 0 24px;
}

.testimonial-card__author {
  display: flex;
  align-items: center;
  gap: 12px;
}

.testimonial-card__avatar {
  width: 40px;
  height: 40px;
  border-radius: 9999px;
  object-fit: cover;
  flex-shrink: 0;
}

.testimonial-card__name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  display: block;
}

.testimonial-card__role {
  font-size: 13px;
  color: var(--text-tertiary);
  display: block;
}
```

### Logo Strip (Trust Bar)

```
┌────────────────────────────────────────────────────────────────────────────┐
│  Trusted by teams at                                                       │
│  [Logo]    [Logo]    [Logo]    [Logo]    [Logo]    [Logo]                  │
└────────────────────────────────────────────────────────────────────────────┘
```

```css
.logo-strip {
  padding: 48px 80px;
  text-align: center;
  border-top: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
}

.logo-strip__label {
  font-family: var(--font-sans);
  font-size: 13px;
  color: var(--text-tertiary);            /* #94A3B8 */
  margin-bottom: 28px;
  font-weight: 500;
}

.logo-strip__logos {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 48px;
  flex-wrap: wrap;
}

.logo-strip__logo {
  height: 24px;
  width: auto;
  filter: grayscale(100%) opacity(0.4);
  transition: filter 0.2s ease;
}

.logo-strip__logo:hover {
  filter: grayscale(0%) opacity(1);
}
```

### Nav Bar with CTA

```
┌────────────────────────────────────────────────────────────────────────────┐
│  ◈ Product           Features   Pricing   Docs   Blog      [ Start free ] │
└────────────────────────────────────────────────────────────────────────────┘
```

```css
.nav {
  position: sticky;
  top: 0;
  z-index: 100;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 40px;
  height: 60px;
}

.nav__logo {
  font-family: var(--font-sans);
  font-size: 17px;
  font-weight: 700;
  color: var(--text-primary);
  text-decoration: none;
  letter-spacing: -0.02em;
  display: flex;
  align-items: center;
  gap: 8px;
}

.nav__links {
  display: flex;
  align-items: center;
  gap: 32px;
  list-style: none;
  margin: 0;
  padding: 0;
}

.nav__link {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-secondary);           /* #475569 */
  text-decoration: none;
  transition: color 0.15s ease;
}

.nav__link:hover {
  color: var(--text-primary);
}

.nav__cta {
  /* Reuse .btn-primary, smaller */
  padding: 8px 18px;
  font-size: 14px;
  background: var(--brand);
  color: #FFFFFF;
  border-radius: 9999px;
  font-weight: 600;
  text-decoration: none;
  transition: background 0.15s ease;
}

.nav__cta:hover {
  background: var(--brand-hover);
}
```

---

## Dark Mode Adaptation Guide

| Light Value | Variable | Dark Value | Notes |
|-------------|----------|------------|-------|
| `#FFFFFF` | `--bg-primary` | `#0B1120` | Deep navy-slate — not pure black |
| `#F8F9FA` | `--bg-secondary` | `#131C2E` | Slightly lighter section bg |
| `#F1F3F5` | `--bg-tertiary` | `#1A2540` | Cards, inputs, elevated surfaces |
| `#0F172A` | `--text-primary` | `#F1F5F9` | Near-white, not pure white |
| `#475569` | `--text-secondary` | `#94A3B8` | Slate-400 reads well on dark |
| `#94A3B8` | `--text-tertiary` | `#475569` | Inverted — captions go dimmer |
| `#4F46E5` | `--brand` | `#6366F1` | Slightly lighter for dark-bg legibility |
| `#4338CA` | `--brand-hover` | `#818CF8` | Hover goes lighter on dark (not darker) |
| `#EEF2FF` | `--brand-subtle` | `#1E1B4B` | Dark brand-tinted surface |
| `#C7D2FE` | `--brand-border` | `#3730A3` | Deep {company} border |
| `#E2E8F0` | `--border` | `#1E293B` | Subtle structural lines |
| `#CBD5E1` | `--border-strong` | `#334155` | More visible separators |

**Same logo strip rule applies:** in dark mode, logos use `filter: grayscale(100%) brightness(0) invert(1) opacity(0.35)` to appear as white-faded marks.

---

## Anti-Patterns

| ❌ Pattern | Why It Fails |
|-----------|-------------|
| Square or sharp-corner buttons | Signals old-web or Bootstrap defaults — Corporate Clean is pill-shaped by design |
| Rainbow gradient backgrounds on sections | Looks consumer/playful, not enterprise-grade; breaks the "trustworthy" register |
| Excessive `box-shadow` depth (30px+ blur) | Heavy shadows feel dated; Corporate Clean shadows are subtle (max 16–48px, low opacity) |
| All-caps section headlines | Reduces readability at 28px+; reserve uppercase for 12px eyebrow labels only |
| Generic stock photography in hero | Real product screenshots in browser frames are the Corporate Clean signal; stock breaks trust |
| Solid colored section backgrounds (red, orange, purple fills) | Alternating white/light-gray is the rhythm. Color blocks feel like a different design system |
| Logo bar with colored, full-saturation logos | Must be desaturated — colored logos look chaotic and imply endorsement level they may not have |
| Bounce or spring easing on any transition | Playful physics feel consumer; stick to `ease` or `cubic-bezier(0.4, 0, 0.2, 1)` |
| Feature icon with no rounded container | Bare icon at 24px feels lightweight; always wrap in the 48×48 rounded-square brand-tinted bg |
| Mixing Inter with a decorative serif in the same section | Breaks system coherence; Inter is the complete system — supplement with mono only |
