---
type: reference
domain: [engineering, brand]
status: canonical
tags: [icons, icon-library, tree-shakable, accessibility, svg]
relates_to: []
---

# Icon Libraries

Curated icon library recommendations for web and app projects — accessibility-first, tree-shakable, framework-ready.

## Recommended

| Name | Type | License | Best For | URL |
|------|------|---------|----------|-----|
| Lucide | SVG icon lib | MIT | Default recommendation — React-ready, 1400+ consistent icons | lucide.dev |
| Phosphor Icons | SVG icon lib | MIT | Best variety — 7000+ icons across 6 weights | phosphoricons.com |
| Heroicons | SVG icon lib | MIT | Tailwind projects, official Tailwind team icons | heroicons.com |
| Radix Icons | SVG icon lib | MIT | Radix UI component projects, minimal 15×15 icons | radix-ui.com/icons |
| Tabler Icons | SVG icon lib | MIT | Large consistent stroke-based set, 5000+ | tabler.io/icons |
| Simple Icons | SVG icon lib | CC0 | Brand/logo icons — tech companies, social platforms | simpleicons.org |
| Iconify | Multi-library | MIT | Access 200k+ icons from unified API, any framework | iconify.design |

## Pairings

**shadcn/ui + Radix projects**
- Default to Lucide — `lucide-react` is already a dependency in shadcn/ui projects
- Use Radix Icons for 15×15 inline UI elements (close buttons, chevrons) where Lucide reads too large

**Tailwind projects**
- Heroicons for semantic UI icons (nav, actions, alerts)
- Lucide as overflow for icons Heroicons lacks
- Heroicons v2 ships as outline and solid weights — use outline at 24px, solid at 20px

**App with dense UI (tables, sidebars, data grids)**
- Phosphor at `regular` weight (1px stroke) reads well at 16–18px
- Phosphor's `bold` weight (2.5px stroke) for emphasis icons and empty states

**Brand/marketing sites**
- Phosphor for illustrative variety — supports fills, duotone, and light weights
- Avoid highly opinionated sets (Heroicons reads "SaaS dashboard")

**Dev tools or technical products**
- Tabler Icons for technical icon variety (network, terminal, database icons)
- Pair with JetBrains Mono or Geist Mono typefaces for consistent technical aesthetic

**Multi-framework projects (Vue, Solid, Svelte)**
- Ark UI or Iconify — both work across frameworks
- Phosphor supports Vue, React, and Svelte official packages

## Anti-Recommendations

- **Font Awesome**: Massive bundle if not carefully tree-shaken, paywall on 2000+ premium icons, SVG quality inconsistent across the set. The free tier is fine but there are better options.
- **Material Icons**: Looks like a Google product. Hard to escape the Android/Material association unless that's intentional.
- **Bootstrap Icons**: Fine standalone, but carries Bootstrap's aesthetic baggage. If you're not using Bootstrap, use anything else.
- **Feather Icons**: Lucide is its direct successor with active maintenance and 3x the icons. Use Lucide.
- **React Icons**: Convenient but pulls in multiple icon sets unsanitized. Use the source library directly for better tree-shaking and consistency.

## Worker Integration

**Lucide (React)**
```bash
npm install lucide-react
```
```tsx
import { Search, ArrowRight, X } from 'lucide-react'

// Size and stroke via props
<Search size={20} strokeWidth={1.5} className="text-muted-foreground" />
```

**Phosphor (React)**
```bash
npm install @phosphor-icons/react
```
```tsx
import { MagnifyingGlass, ArrowRight } from '@phosphor-icons/react'

// Six weights: thin, light, regular, bold, fill, duotone
<MagnifyingGlass size={20} weight="regular" />
```

**Heroicons (React)**
```bash
npm install @heroicons/react
```
```tsx
// Outline: 24px optical size
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline'
// Solid: 20px optical size
import { MagnifyingGlassIcon } from '@heroicons/react/20/solid'
```

**Radix Icons**
```bash
npm install @radix-ui/react-icons
```
```tsx
import { Cross2Icon, ChevronDownIcon } from '@radix-ui/react-icons'
// Fixed 15×15 — always used at this size
```

**SVG sprite approach (performance for large icon counts)**
```html
<!-- icons.svg (concatenated) -->
<svg xmlns="http://www.w3.org/2000/svg" style="display:none">
  <symbol id="icon-search" viewBox="0 0 24 24">...</symbol>
</svg>

<!-- Usage -->
<svg width="20" height="20" aria-hidden="true">
  <use href="/icons.svg#icon-search" />
</svg>
```

**Tree-shaking note**: All named exports (Lucide, Phosphor, Heroicons) tree-shake correctly with any modern bundler. Named imports — `import { Search }` — not barrel imports — `import * as Icons` — are required for tree-shaking to work.

**Accessibility**: Always pair decorative icons with `aria-hidden="true"`. Standalone icon buttons need `aria-label` on the button element, not the SVG.
```tsx
<button aria-label="Close dialog">
  <X size={16} aria-hidden="true" />
</button>
```

**Iconify (framework-agnostic, on-demand)**
```bash
npm install @iconify/react
```
```tsx
import { Icon } from '@iconify/react'
<Icon icon="lucide:search" width="20" />
// Loads icon JSON on demand — zero bundle for unused icons
```
