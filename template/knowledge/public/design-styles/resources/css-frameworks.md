---
type: reference
domain: [engineering, brand]
status: canonical
tags: [css, frameworks, tailwind, utility-first, styling]
relates_to: []
---

# CSS Frameworks

Curated CSS framework recommendations — from utility-first to zero-runtime TypeScript styling.

## Recommended

| Name | Type | License | Best For | URL |
|------|------|---------|----------|-----|
| Tailwind CSS | Utility-first | MIT | Default recommendation — all project types | tailwindcss.com |
| Open Props | CSS custom properties | MIT | Progressive enhancement, any framework or vanilla | open-props.style |
| UnoCSS | Atomic CSS engine | MIT | Tailwind-compatible but faster, highly configurable | unocss.dev |
| Panda CSS | CSS-in-JS (zero runtime) | MIT | Type-safe tokens, complex design systems | panda-css.com |
| Vanilla Extract | CSS-in-TypeScript | MIT | Zero-runtime, TypeScript, good for libraries | vanilla-extract.style |
| CSS Modules | Scoped CSS | Free (built-in) | Simple projects, Next.js built-in, zero config | (built into Next.js/Vite) |

## Pairings

**Tailwind + shadcn/ui (recommended default)**
- Tailwind for all utility styling
- shadcn/ui components already use Tailwind classes
- Tailwind CSS variables for theming (`--background`, `--primary`, etc.)
- Install: `npx tailwindcss init`, enable JIT (default in v3+)

**Tailwind + Radix (custom system)**
- Tailwind for layout, spacing, and base utilities
- Radix Colors CSS variables for the color system
- Headless Radix components styled via Tailwind `className`

**Open Props (progressive enhancement / vanilla)**
- Import the subset you need (colors, fonts, sizes, easing)
- Works in any context including no-framework static sites
- Pairs with CSS nesting and custom properties for a modern vanilla approach

**Panda CSS (large design system, type safety priority)**
- Define tokens and recipes in `panda.config.ts`
- Generates static CSS at build time — zero runtime
- Works well for component libraries where token consistency matters
- Strong with Ark UI for fully typed component + styling

**Vanilla Extract (library/package authors)**
- Write CSS in TypeScript files (`.css.ts`)
- Statically extracted at build time — no runtime
- Excellent for publishing component libraries where consumers control their own bundler
- Sprinkles addon gives Tailwind-like utility props

**UnoCSS (Tailwind replacement for speed-sensitive setups)**
- Drop-in Tailwind compatible preset (`@unocss/preset-wind`)
- Significantly faster HMR than Tailwind in large projects
- Add custom rules with simple regex patterns — more flexible than Tailwind plugins
- Good for Nuxt/Vue projects where Tailwind's ecosystem is thinner

**CSS Modules (simple projects, mixed teams)**
- Zero config in Next.js: create `Component.module.css`, import styles
- Good for teams not bought into Tailwind
- Scoped by default — no global conflicts
- Combine with CSS custom properties for theming

## Anti-Recommendations

- **Bootstrap**: Usable but you're fighting its defaults on every component. Everything looks like Bootstrap until you've overridden enough to wish you'd started from scratch. Reserve for internal tools where aesthetics don't matter.
- **Bulma**: Declining maintenance and community. Similar utility-class approach to Tailwind but without the ecosystem, JIT performance, or Tailwind plugin ecosystem.
- **styled-components**: Runtime CSS-in-JS incurs bundle and render cost. React Server Components don't support context-based runtime CSS-in-JS — styled-components is fundamentally incompatible with the RSC model. Moving away from it is a migration project.
- **Emotion**: Same runtime limitation as styled-components. Still viable for client-only React apps but blocked by RSC incompatibility on Next.js App Router.
- **CSS-in-JS with runtime (general)**: Server components require static CSS. Any CSS-in-JS library that generates styles at runtime (reads context, theme, props) cannot work in RSC. Use zero-runtime alternatives (Panda, Vanilla Extract) or Tailwind.
- **LESS / Sass (heavy use)**: CSS has caught up — nesting, custom properties, color functions are now native. Sass is still fine for large teams with existing infrastructure, but new projects shouldn't require it.

## Decision Guide

```
New project → use Tailwind CSS
  ↓
Needs shadcn/ui components? → yes: Tailwind + shadcn
  ↓
Publishing a component library? → Vanilla Extract or Panda CSS
  ↓
Need type-safe token system? → Panda CSS
  ↓
Multi-framework (Vue/Svelte)? → UnoCSS or Open Props
  ↓
Simple / no-framework project? → CSS Modules or Open Props
  ↓
No JS build step? → Open Props (CDN import)
```

## Worker Integration

**Tailwind installation**
```bash
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```
```js
// tailwind.config.js
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
  theme: { extend: {} },
  plugins: [],
}
```
```css
/* globals.css */
@tailwind base;
@tailwind components;
@tailwind utilities;
```

**Tailwind v4 (new config format)**
```css
/* No tailwind.config.js needed — configure in CSS */
@import "tailwindcss";

@theme {
  --color-primary: oklch(55% 0.2 250);
  --font-sans: Inter, system-ui, sans-serif;
}
```

**Open Props CDN**
```css
@import "https://unpkg.com/open-props";
@import "https://unpkg.com/open-props/normalize.min.css";

.card {
  padding: var(--size-4);
  border-radius: var(--radius-2);
  box-shadow: var(--shadow-2);
}
```

**Panda CSS setup**
```bash
npm install -D @pandacss/dev
npx panda init
```
```ts
// panda.config.ts
import { defineConfig } from '@pandacss/dev'

export default defineConfig({
  preflight: true,
  include: ['./src/**/*.{ts,tsx}'],
  theme: {
    tokens: {
      colors: {
        primary: { value: 'oklch(55% 0.2 250)' },
      }
    }
  },
  outdir: 'styled-system',
})
```
```tsx
import { css } from '../styled-system/css'

<div className={css({ color: 'primary', padding: '4' })} />
```

**Vanilla Extract**
```bash
npm install @vanilla-extract/css @vanilla-extract/vite-plugin
```
```ts
// button.css.ts
import { style } from '@vanilla-extract/css'

export const button = style({
  background: 'oklch(55% 0.2 250)',
  padding: '0.5rem 1rem',
  borderRadius: '0.375rem',
})
```
```tsx
import { button } from './button.css'
<button className={button}>Click</button>
```

**CSS Modules (Next.js, zero config)**
```css
/* Button.module.css */
.button {
  background: var(--primary);
  padding: 0.5rem 1rem;
}
```
```tsx
import styles from './Button.module.css'
<button className={styles.button}>Click</button>
```
