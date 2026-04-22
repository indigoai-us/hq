---
type: reference
domain: [brand, engineering]
status: canonical
tags: [color, palette, design-system, contrast, accessibility]
relates_to: []
---

# Color Tools & Systems

Curated color resources — palette generators, design-system-ready color scales, and contrast tools.

## Recommended

| Name | Type | License | Best For | URL |
|------|------|---------|----------|-----|
| Tailwind Colors | Color palette | MIT | Starting point — well-tested scales, 11 steps per hue | tailwindcss.com/docs/customizing-colors |
| Radix Colors | Color system | MIT | Dark/light mode with guaranteed WCAG contrast ratios | radix-ui.com/colors |
| Open Color | Color palette | MIT | Minimal clean system, 13 hues × 10 steps | yeun.github.io/open-color |
| Realtime Colors | Web tool | Free | Live preview on real UI components while you adjust | realtimecolors.com |
| Coolors | Web tool | Freemium | Fast palette generation, export to CSS/Sass | coolors.co |
| Oklch.com | Web tool | Free | oklch() color picker with chroma/hue visualization | oklch.com |
| Huemint | Web tool | Free | AI-driven palette generation from brand descriptions | huemint.com |
| WebAIM Contrast Checker | Web tool | Free | Quick WCAG AA/AAA contrast ratio checking | webaim.org/resources/contrastchecker |
| Polypane Color Contrast | Web tool | Paid (Polypane) | In-browser contrast checking across design states | polypane.app |

## Pairings

**Tailwind + shadcn/ui projects**
- Use Tailwind Colors as base palette
- Map to shadcn CSS variable names: `--background`, `--foreground`, `--primary`, `--muted`, `--accent`, `--destructive`
- shadcn provides HSL-based CSS variables by default — swap to oklch() for better dark mode accuracy

**Radix + custom design system**
- Radix Colors for all interactive UI — backgrounds, text, borders across light/dark
- Each Radix scale has 12 steps with defined semantic meaning (step 1–2: bg, 3–5: interactive bg, 6–8: borders, 9–10: solid, 11–12: text)
- Guarantees pass WCAG AA at steps 11/12 on steps 1/2 — contrast built in

**Brand palette → design system**
1. Use Realtime Colors to explore palette on a real UI layout
2. Use Coolors to refine and export
3. Map to semantic tokens (see token structure below)
4. Use oklch() for defining custom scales — better perceptual uniformity than HSL

**Accessibility-first**
- Start with Radix Colors or APCA-based palette
- Use WebAIM or Polypane for spot-checking specific text/bg combos
- Design system rule: text always uses scale steps 11–12, backgrounds steps 1–2, never the reverse

## Anti-Recommendations

- **Random hex values without a scale**: Single brand hex values don't give you hover states, borders, or muted variants. Always build or adopt a systematic scale.
- **Pure black (#000) or pure white (#fff) for backgrounds**: Too much contrast causes halation on screens. Use near-blacks (gray-950) and off-whites (gray-50) from a scale.
- **HSL for design tokens**: HSL lightness is perceptually non-uniform — a 50% lightness in blue looks darker than 50% in yellow. Use oklch() instead for perceptually consistent tints.
- **Color pickers in Figma without contrast check**: A color that looks right in Figma may fail WCAG AA in browser. Always run contrast check after selecting text colors.

## Color System Structure

Define colors in two layers: palette (raw values) and semantic tokens (meaning).

**Layer 1: Palette (raw scale)**
```css
/* Define your raw color scale — 12 steps minimum */
:root {
  --blue-1: oklch(98% 0.01 250);
  --blue-2: oklch(96% 0.02 250);
  /* ... */
  --blue-11: oklch(40% 0.15 250);
  --blue-12: oklch(20% 0.12 250);
}
```

**Layer 2: Semantic tokens**
```css
:root {
  /* Light mode */
  --background: var(--gray-1);
  --foreground: var(--gray-12);
  --primary: var(--blue-9);
  --primary-foreground: white;
  --muted: var(--gray-3);
  --muted-foreground: var(--gray-11);
  --accent: var(--blue-3);
  --accent-foreground: var(--blue-11);
  --border: var(--gray-6);
  --destructive: var(--red-9);
  --destructive-foreground: white;
}

.dark {
  /* Dark mode: reassign semantic tokens, NOT palette values */
  --background: var(--gray-12);
  --foreground: var(--gray-1);
  --primary: var(--blue-9);  /* Radix step 9 is light/dark invariant */
  --muted: var(--gray-3);
  --border: var(--gray-6);
}
```

**Dark mode strategy**: Radix Colors provides separate light and dark palettes per hue. Step 9 (solid background) is consistent across modes — use it for primary actions. Never just invert the light palette; dark mode needs its own decisions about contrast and saturation.

## Worker Integration

**oklch() color definition**
```css
/* oklch(lightness chroma hue) */
/* Lightness: 0%–100%, Chroma: 0–0.4, Hue: 0–360 */
color: oklch(55% 0.2 250);  /* Vivid blue */
color: oklch(55% 0 250);    /* Same hue, desaturated (gray) */
```

**Radix Colors CDN**
```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@radix-ui/colors/blue.css">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@radix-ui/colors/blue-dark.css">
```
```css
/* Usage: Radix generates --blue-1 through --blue-12 */
/* Dark mode: automatically uses dark variants if using @media prefers-color-scheme */
background: var(--blue-2);
color: var(--blue-11);
```

**Radix Colors npm**
```bash
npm install @radix-ui/colors
```
```css
@import '@radix-ui/colors/blue.css';
@import '@radix-ui/colors/blue-dark.css';
```

**Tailwind Colors reference**
```js
// tailwind.config.js — extend with custom tokens
const colors = require('tailwindcss/colors')

module.exports = {
  theme: {
    extend: {
      colors: {
        primary: colors.blue,
        destructive: colors.red,
      }
    }
  }
}
```

**Contrast ratio check (quick formula)**
- WCAG AA: 4.5:1 minimum for normal text, 3:1 for large text (18px+ or 14px+ bold)
- WCAG AAA: 7:1 for normal text
- Check at webaim.org/resources/contrastchecker — paste hex values
