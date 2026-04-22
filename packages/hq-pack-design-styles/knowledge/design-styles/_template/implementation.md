---
# YAML frontmatter — fill in before publishing
name: <pack-id>
description: <Pack Display Name> design style pack — <one-line description of aesthetic and source>. Use this when applying a <adjective> aesthetic to any frontend project.
---

# <Pack Display Name> Design — Style Pack

A codified design language inspired by [<source url>](<source url>). This guide provides a complete visual system — typography, color, layout, motion, and interaction patterns — that can be applied to any frontend project.

**When to use:** Any time the design direction calls for <comma-separated aesthetic keywords: e.g., "industrial", "editorial", "command center">. Works for both light and dark palettes.

**Prerequisite:** Load `frontend-design` SKILL.md first for general design principles. This guide layers on top as a specific aesthetic direction.

---

## Core Philosophy

<!-- Describe the soul of this aesthetic in 2–3 short paragraphs.
     Answer: What is the underlying idea? What does every design decision serve?
     Keep it concrete — replace general claims with specific ones. -->

<Pack Display Name> design is about **<core principle>**. <2–3 sentences expanding the principle. What does it mean in practice?>

**Three pillars:**
1. **<Pillar 1 name>** — <one sentence describing this pillar and how it manifests visually>
2. **<Pillar 2 name>** — <one sentence describing this pillar and how it manifests visually>
3. **<Pillar 3 name>** — <one sentence describing this pillar and how it manifests visually>

**The feeling:** <2–4 evocative comparisons. E.g., "A factory floor, a newspaper front page, a military-spec data sheet." These help workers calibrate gut-check instincts.>

---

## Typography System

### Font Stack

<!-- Document the full font stack. Three roles is the standard; adjust if this aesthetic uses more or fewer.
     For each: identify the primary font, acceptable fallbacks, and usage constraints. -->

| Role | Primary | Fallback | Notes |
|------|---------|----------|-------|
| Display | **<Font Name>** | <Fallback1>, sans-serif | <!-- CUSTOMIZE: describe case treatment, weight, tracking --> |
| Body | **<Font Name>** | <Fallback1>, system-ui | <!-- CUSTOMIZE: describe reading size, line-height preference --> |
| Data / Mono | **<Font Name>** (optional) | monospace | <!-- CUSTOMIZE: describe when to use — counters, timestamps, status labels, etc. --> |

### Type Scale

```
<!-- CUSTOMIZE: Replace all values with the scale for this aesthetic.
     Include the role name, size (as clamp() where responsive), and key typographic treatment. -->

Hero headline:     clamp(Xpx, Yvw, Zpx)   — <font role>, <case>, line-height <N>
Section title:     clamp(Xpx, Yvw, Zpx)   — <font role>, <case>, line-height <N>
Card heading:      <N>–<N>px               — <font role>, <case>
Body text:         <N>px                   — <font role>, line-height <N>
Label:             <N>–<N>px               — <font role>, <case>, letter-spacing <N>em
Caption / data:    <N>–<N>px              — <font role>, <case>
```

### Type Rules

<!-- List 5–8 hard rules about typography in this aesthetic.
     Bold the rule name; follow with a one-line explanation of why.
     Rules should be specific enough to catch violations. -->

- **<Rule 1>** — <why this rule exists>
- **<Rule 2>** — <why this rule exists>
- **<Rule 3>** — <why this rule exists>
- **<Rule 4>** — <why this rule exists>
- **<Rule 5>** — <why this rule exists>

### Anti-Patterns

<!-- List 4–6 typographic mistakes that look superficially similar but break the aesthetic.
     Each entry should be something a developer or AI might accidentally do. -->

- ❌ <Anti-pattern 1> — <why it fails>
- ❌ <Anti-pattern 2> — <why it fails>
- ❌ <Anti-pattern 3> — <why it fails>
- ❌ <Anti-pattern 4> — <why it fails>
- ❌ <Anti-pattern 5> — <why it fails>

---

## Color Palettes

### Light Mode — "<Palette Name>"

```css
:root {
  /* CUSTOMIZE: Replace all values with the light-mode palette for this aesthetic.
     Comment each variable with its semantic role. */
  --bg: #XXXXXX;           /* main background */
  --surface: #XXXXXX;      /* elevated surfaces (cards, nav) */
  --border: #XXXXXX;       /* structural lines, dividers */
  --accent: #XXXXXX;       /* primary accent — use sparingly */
  --accent-secondary: #XXXXXX; /* secondary accent — data, numerals */
  --dark: #XXXXXX;         /* dark sections, footer */
  --text: #XXXXXX;         /* primary body text */
  --text-muted: #XXXXXX;   /* secondary text, labels */
  --text-on-dark: #XXXXXX; /* text on dark/accent backgrounds */
}
```

### Dark Mode — "<Palette Name>"

```css
:root {
  /* CUSTOMIZE: Replace all values with the dark-mode palette.
     Mirror the semantic roles from the light palette above.
     Delete this block if this aesthetic is light-only. */
  --bg: #XXXXXX;           /* deep background */
  --bg-elevated: #XXXXXX;  /* card / surface */
  --bg-card: #XXXXXX;      /* nested surfaces */
  --border: #XXXXXX;       /* structural lines */
  --text: #XXXXXX;         /* primary text */
  --text-dim: #XXXXXX;     /* secondary text */
  --accent: #XXXXXX;       /* primary accent */
  --accent-hover: #XXXXXX; /* accent interaction state */
  --success: #XXXXXX;      /* status: good */
  --error: #XXXXXX;        /* status: bad */
}
```

### Color Rules

<!-- List 4–6 rules about how color is used in this aesthetic.
     Focus on structural vs. decorative use, accent restraint, and anti-patterns. -->

- **<Color rule 1>** — <explanation>
- **<Color rule 2>** — <explanation>
- **<Color rule 3>** — <explanation>
- **<Color rule 4>** — <explanation>
- **<No gradients / No X rule>** — <why this aesthetic avoids certain treatments>

---

## Layout Patterns

### Structural Grid

```
<!-- CUSTOMIZE: Replace with the grid specifications for this aesthetic. -->
Max width: <N>px (<label: e.g., "tight" or "spacious">)
Padding: <N>px sides (mobile), scales to content max-width
Section padding: <N>px vertical (desktop), <N>–<N>px (mobile)
```

### <Signature Grid Technique Name>

<!-- Describe the most distinctive layout pattern of this aesthetic.
     Include: what it is, when to use it, and the CSS to implement it. -->

<Describe the signature grid technique. What does it look like? What visual problem does it solve?>

```css
/* CUSTOMIZE: Replace with CSS for the signature grid technique */
.<grid-class> {
  display: grid;
  /* grid properties */
}

.<grid-class> > * {
  /* child properties */
}
```

### Asymmetric Layouts

<!-- List 3–4 specific asymmetric layout patterns used in this aesthetic.
     Format: one-liner description + the CSS grid-template or flex configuration. -->

- **<Layout 1>:** `grid-template-columns: <Npx> <Nfr>` — <when to use>
- **<Layout 2>:** `grid-row: span <N>` — <when to use>
- **<Layout 3>:** `grid-template-columns: [<N>rem] [<N>rem] [<N>fr]` — <when to use>

### Alignment

<!-- State the default alignment philosophy and any exceptions.
     Left vs. center vs. right is often a defining characteristic of an aesthetic. -->

- **<Default alignment rule>** — <why>
- Exception: <specific context where alignment breaks the rule> — <why this exception exists>
- Exception: <second exception if needed>

---

## Structural Elements

### Rules (Dividers)

<!-- Document the divider/rule system. Typically 2–4 types.
     Each type should have: a name, the CSS, and when to use it. -->

The backbone of the visual system. <N> types:

| Element | CSS | When |
|---------|-----|------|
| <Rule type 1> | `<!-- CUSTOMIZE: e.g., height: 3px; background: var(--accent) -->` | <when to use> |
| <Rule type 2> | `<!-- CUSTOMIZE: e.g., height: 1px; background: var(--border) -->` | <when to use> |
| <Rule type 3> | `<!-- CUSTOMIZE -->` | <when to use> |

### <Signature Structural Element>

<!-- Describe the single most recognizable structural element of this aesthetic.
     This is the "if you copy nothing else, copy this" pattern.
     Include HTML and CSS. -->

<Describe what this element is, why it's signature, and how it's used.>

```html
<!-- CUSTOMIZE: Replace with the HTML for the signature structural element -->
<div class="<!-- element class -->">
  <!-- element content -->
</div>
```

### Border Treatments

<!-- List 3–5 specific border treatments used in this aesthetic.
     Each should have a name and the CSS. -->

- **<Border treatment 1>:** `<!-- CUSTOMIZE: e.g., border-left: 3px solid var(--accent) -->` — <when to use>
- **<Border treatment 2>:** `<!-- CUSTOMIZE -->` — <when to use>
- **<Border treatment 3>:** `<!-- CUSTOMIZE -->` — <when to use>

### Labels

<!-- Describe the label/caption system. In most aesthetics, labels are a distinct typographic treatment
     placed above section titles. Include the CSS class and the semantic pattern. -->

<Describe the label style — font, size, case, tracking, color. What visual role do labels play?>

```css
/* CUSTOMIZE: Replace with the label CSS for this aesthetic */
.section-label {
  font-family: var(--font-display); /* CUSTOMIZE: font role */
  font-size: 11px;                  /* CUSTOMIZE: size */
  font-weight: 300;                 /* CUSTOMIZE: weight */
  letter-spacing: 0.2em;            /* CUSTOMIZE: tracking */
  text-transform: uppercase;        /* CUSTOMIZE: case */
  color: var(--accent);             /* CUSTOMIZE: color */
}
```

Pattern: `<!-- CUSTOMIZE: e.g., LABEL → TITLE → RULE → CONTENT -->`

---

## Button Patterns

### Primary (Filled)

```css
/* CUSTOMIZE: Replace all values with button styles for this aesthetic.
   Pay special attention to: border-radius (0 = hard; 50% = pill; 6–12px = standard),
   font treatment, and padding rhythm. */
.btn-primary {
  font-family: var(--font-display);  /* CUSTOMIZE */
  font-size: 13px;                   /* CUSTOMIZE */
  font-weight: 500;                  /* CUSTOMIZE */
  letter-spacing: 0.12em;            /* CUSTOMIZE */
  text-transform: uppercase;         /* CUSTOMIZE: remove if lowercase */
  padding: 14px 36px;                /* CUSTOMIZE */
  background: var(--accent);         /* CUSTOMIZE */
  border: 2px solid var(--accent);   /* CUSTOMIZE */
  border-radius: 0;                  /* CUSTOMIZE: 0 = industrial, 6px = standard, 50% = pill */
  color: var(--text-on-dark);        /* CUSTOMIZE */
}
```

### Secondary (Outline)

```css
/* CUSTOMIZE: Replace with secondary/ghost button style */
.btn-secondary {
  /* Same typography as primary */
  padding: 14px 36px;                /* CUSTOMIZE */
  background: transparent;
  border: 2px solid var(--border);   /* CUSTOMIZE: use accent or border color */
  border-radius: 0;                  /* CUSTOMIZE: match primary */
  color: var(--text-muted);          /* CUSTOMIZE */
}

.btn-secondary:hover {
  background: var(--border);         /* CUSTOMIZE: fill on hover */
  color: var(--text);                /* CUSTOMIZE */
}
```

### Button Rules

<!-- List 4–6 rules about buttons in this aesthetic.
     Be explicit about border-radius, shadows, hover states, and font treatment. -->

- **<Button rule 1>** — <why>
- **<Button rule 2>** — <why>
- **<Button rule 3>** — <why>
- **<Button rule 4: hover behavior>** — <why>
- **<Button rule 5: shadow / depth>** — <why>

---

## Motion Primitives

<!-- Document the motion system. All motion should be CSS + IntersectionObserver where possible.
     List each named animation with its CSS. -->

All motion is CSS + IntersectionObserver + requestAnimationFrame. **Zero external libraries.** Always respect `prefers-reduced-motion`.

### Scroll Reveal

```css
/* CUSTOMIZE: Replace duration, transform distance, and easing with values for this aesthetic */
[data-motion="scroll-reveal"] {
  opacity: 0;
  transform: translateY(24px);          /* CUSTOMIZE: distance (0 = fade only) */
  transition: opacity 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94),
              transform 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}

[data-motion="scroll-reveal"].is-visible {
  opacity: 1;
  transform: translateY(0);
}
```

### Stagger Children

```javascript
// CUSTOMIZE: Replace interval with the stagger timing for this aesthetic (60–150ms typical)
children.forEach((child, i) => {
  child.style.transitionDelay = (i * 80) + 'ms'; // CUSTOMIZE: interval in ms
});
```

### Text Reveal (Clip)

```css
/* CUSTOMIZE: Replace easing and duration. Keep overflow: hidden on parent. */
[data-motion="text-reveal"] { overflow: hidden; }
[data-motion="text-reveal"] > * {
  transform: translateY(100%);
  transition: transform 0.7s cubic-bezier(0.16, 1, 0.3, 1); /* CUSTOMIZE */
}

[data-motion="text-reveal"].is-visible > * {
  transform: translateY(0);
}
```

### Hover Lift

```css
/* CUSTOMIZE: Replace lift distance, shadow depth, and duration */
[data-motion="hover-lift"] {
  transition: transform 0.3s ease, box-shadow 0.3s ease; /* CUSTOMIZE */
}

[data-motion="hover-lift"]:hover {
  transform: translateY(-4px);                             /* CUSTOMIZE: lift distance */
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);             /* CUSTOMIZE: or remove if no shadows */
}
```

### Motion Rules

<!-- List 4–6 rules about motion in this aesthetic.
     Address: reduced-motion compliance, easing character, which elements animate, and what's forbidden. -->

- **Always respect `prefers-reduced-motion`** — disable all transforms and transitions when set
- **<Easing character rule>** — <e.g., "No bounce or spring physics — easing is smooth, not playful">
- **<Stagger use rule>** — <e.g., "Stagger reveals sparingly — use for grids and lists, not every element">
- **<Forbidden animation rule>** — <e.g., "No glow/pulse animations — this aesthetic is static until interacted with">

---

## Texture & Grain

<!-- Document any texture/overlay system. Delete this section if the aesthetic is flat. -->

### <Texture Type 1 — e.g., "Film Grain Overlay">

```css
/* CUSTOMIZE: Replace with the texture implementation for this aesthetic */
.grain::after {
  content: "";
  position: fixed;
  inset: 0;
  /* CUSTOMIZE: SVG fractalNoise or image URL */
  background-image: url("data:image/svg+xml,...");
  background-repeat: repeat;
  background-size: 256px;     /* CUSTOMIZE */
  pointer-events: none;
  z-index: 50;
  opacity: 0.3;               /* CUSTOMIZE: 0.2–0.5 typical */
}
```

### <Texture Type 2 — e.g., "Diagonal Stripes">

```css
/* CUSTOMIZE: Replace angle, color, and opacity with values for this aesthetic */
.diagonal-stripes {
  background: repeating-linear-gradient(
    -45deg,                                        /* CUSTOMIZE: angle */
    transparent, transparent 20px,                 /* CUSTOMIZE: stripe gap */
    rgba(200, 168, 76, 0.02) 20px,                 /* CUSTOMIZE: color + opacity */
    rgba(200, 168, 76, 0.02) 22px                  /* CUSTOMIZE: stripe width */
  );
}
```

---

## Component Patterns

### Stats Display

<!-- Document the signature stats/metrics component.
     This is almost always a useful pattern — adapt numbers and labels to the aesthetic. -->

Large numerals with condensed labels:

```
<!-- CUSTOMIZE: Replace with the visual layout for stats in this aesthetic -->
┌──────────────────────────────────────┐
│  <VALUE>     <VALUE>      <VALUE>    │
│  <LABEL>     <LABEL>      <LABEL>    │
└──────────────────────────────────────┘
```

- Numbers: <font role>, <size range>, <color>
- Labels: <font role>, <size>, <tracking>, <case>, <color>
- Layout: `flex` with gap `<N>–<N>px` or `grid-template-columns: repeat(<N>, 1fr)`

### Numbered Step Rows

<!-- Document a numbered list / ordered step component. -->

```
<!-- CUSTOMIZE: Replace with the visual layout for numbered rows in this aesthetic -->
┌──────┬──────────────┬──────────────────────────────┐
│  01  │ Step Title   │ Description text              │
├──────┼──────────────┼──────────────────────────────┤
│   02  │ Step Title   │ Description text              │
└──────┴──────────────┴──────────────────────────────┘
```

- Number: <font role>, <size>, <color> at <N>% opacity → full on hover
- Grid: `grid-template-columns: [<N>rem] [<N>rem] [1fr]`
- Rows separated by `border-top: 1px solid var(--border)`

### <Third Component — e.g., "Feature Items", "Tag Pills", "Nav Bar">

<!-- Document one more component that's distinctive to this aesthetic. -->

<Describe the component: what it does, when it's used, what makes it characteristic of this aesthetic.>

```css
/* CUSTOMIZE: Replace with CSS for this component */
.<component-class> {
  /* key properties */
}
```

---

## Dark Mode Adaptation Guide

<!-- Provide a mapping table from light-mode values to dark-mode equivalents.
     This helps developers switch palettes without guessing.
     Add a note about which rules carry over unchanged. -->

When applying <Pack Display Name> to a dark palette:

| Light Mode | Dark Equivalent | Notes |
|-----------|-----------------|-------|
| <Light role> `#XXXXXX` | <Dark role> `#XXXXXX` | <!-- CUSTOMIZE: brief note --> |
| <Light role> `#XXXXXX` | <Dark role> `#XXXXXX` | <!-- CUSTOMIZE --> |
| <Light role> `#XXXXXX` | <Dark role> `#XXXXXX` | <!-- CUSTOMIZE --> |
| <Light role> `#XXXXXX` | <Dark role> `#XXXXXX` | <!-- CUSTOMIZE --> |
| <Light role> `#XXXXXX` | <Dark role> `#XXXXXX` | <!-- CUSTOMIZE --> |

**Same rules apply in dark mode:** <list the 2–3 rules that carry over unchanged — e.g., no gradients, square corners, structural rules>.

---

## Anti-Patterns (What This Is NOT)

<!-- This section is critical. List 8–12 common mistakes that superficially resemble this aesthetic
     but actually violate it. Format: ❌ Pattern | Why It Fails.
     Focus on patterns that AI or developers commonly reach for when imitating this style. -->

| ❌ Pattern | Why It Fails |
|-----------|-------------|
| <!-- CUSTOMIZE: e.g., Purple/violet gradients on dark bg --> | <!-- CUSTOMIZE: why it fails --> |
| <!-- CUSTOMIZE --> | <!-- CUSTOMIZE --> |
| <!-- CUSTOMIZE --> | <!-- CUSTOMIZE --> |
| <!-- CUSTOMIZE --> | <!-- CUSTOMIZE --> |
| <!-- CUSTOMIZE --> | <!-- CUSTOMIZE --> |
| <!-- CUSTOMIZE --> | <!-- CUSTOMIZE --> |
| <!-- CUSTOMIZE --> | <!-- CUSTOMIZE --> |
| <!-- CUSTOMIZE --> | <!-- CUSTOMIZE --> |

---

## Reference Implementation

<!-- Point to a concrete HTML/code template that demonstrates every pattern.
     Update the path to the actual template file. -->

A complete HTML template demonstrating every pattern is available at:
`<!-- CUSTOMIZE: path to reference template, e.g., repos/private/my-site/src/templates/<pack-id>.html -->`

This template implements: <!-- CUSTOMIZE: list the patterns the template demonstrates, e.g.,
"nav, hero with display type, stats, grid (shared borders), dark review section, motion primitives, responsive breakpoints." -->

## Project References

<!-- List 2–4 real projects that use this pack. Helps calibrate application. -->

| Project | Palette | Key Patterns |
|---------|---------|-------------|
| <!-- CUSTOMIZE: project slug --> | <!-- palette --> | <!-- key patterns used --> |
| <!-- CUSTOMIZE: project slug --> | <!-- palette --> | <!-- key patterns used --> |
