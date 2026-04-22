---
type: reference
domain: [engineering, brand]
status: canonical
tags: [components, ui-library, headless, accessibility, design-system]
relates_to: []
---

# Component Libraries

Curated component library recommendations — from full-featured styled systems to headless accessible primitives.

## Recommended

| Name | Type | License | Best For | URL |
|------|------|---------|----------|-----|
| shadcn/ui | Copy-paste components | MIT | Default for new React/Next.js projects — Radix + Tailwind | ui.shadcn.com |
| Radix Primitives | Headless lib | MIT | Accessible unstyled primitives, base for custom design systems | radix-ui.com/primitives |
| Ark UI | Headless lib | MIT | Headless like Radix but supports React, Vue, and Solid | ark-ui.com |
| Headless UI | Headless lib | MIT | Simpler than Radix, fewer components, Tailwind team | headlessui.com |
| React Aria | Headless lib | Apache 2.0 | Strongest accessibility — ARIA, keyboard, internationalization | react-spectrum.adobe.com/react-aria |
| Aceternity UI | Animated components | MIT | Landing page hero sections, scroll effects, visual polish | ui.aceternity.com |
| Magic UI | Animated components | MIT | Marketing site animations, text effects, beam/particle effects | magicui.design |
| Catalyst | Styled components | MIT | Tailwind team's styled kit (built on Headless UI) | tailwindui.com/templates/catalyst |
| Park UI | Styled kit | MIT | Ark UI + styled themes, production-ready | park-ui.com |

## Pairings

**Standard SaaS / app project**
- shadcn/ui for all UI components — Dialog, Sheet, Table, Form, Combobox
- Lucide for icons (already a dep)
- Tailwind for utility classes around shadcn components
- Add Aceternity or Magic UI components selectively for hero/marketing sections

**Custom design system (tight brand control)**
- Radix Primitives as the accessible base
- Tailwind or Vanilla Extract for styling
- Build wrappers around Radix components with your own tokens
- Don't use shadcn/ui — you'll spend more time overriding than building from Radix directly

**Multi-framework (Vue/Solid support needed)**
- Ark UI instead of Radix — identical API, supports all three frameworks
- Park UI for a styled starting point if you want to skip raw Ark setup
- Avoid shadcn/ui and Radix (React-only)

**Accessibility-critical product (gov, healthcare, finance)**
- React Aria for interaction layer — strongest ARIA implementation, handles RTL, international keyboards
- Style with Tailwind on top of React Aria hooks
- Radix is good; React Aria is better when WCAG compliance is non-negotiable

**Landing page / marketing site**
- shadcn/ui for nav, forms, and structural components
- Aceternity UI for hero, feature sections, bento grids
- Magic UI for text animations, counters, beam effects
- Compose: don't use either animated library for core app UI

## Anti-Recommendations

- **Material UI (MUI)**: Extensive, well-maintained — but you're fighting the Google look on every component. Custom theming is possible but tedious. Reserve for internal tools where visual polish doesn't matter.
- **Ant Design**: Designed for Chinese enterprise products. Dense, opinionated, requires significant overriding to not look like Ant Design. Difficult to customize without diving into Less variables.
- **Chakra UI**: Was popular 2020–2022, now losing momentum. Slow updates, performance issues with runtime CSS-in-JS, increasingly behind shadcn/ui in DX.
- **Mantine**: Good library, but competes with shadcn/ui and loses on ecosystem size and copy-paste flexibility. Fine choice if you prefer it, but not the default recommendation.
- **React Bootstrap**: Bootstrap in React clothing. Carries Bootstrap's visual baggage and adds React overhead. Use Headless UI instead.
- **Semantic UI React**: Largely unmaintained. Avoid.

## Notes

**When to go headless vs. styled**

Use a headless library (Radix, Ark, React Aria) when:
- You have a custom design system with strict brand tokens
- The styled default would require more overriding than building fresh
- Accessibility requirements are high and you need full control over ARIA implementation

Use shadcn/ui (Radix + pre-styled) when:
- Starting a new product and want to ship fast
- The Tailwind utility aesthetic is acceptable (it is for most SaaS)
- You want to own the code — shadcn copies components into your repo, no dependency update risk

Use Aceternity/Magic UI when:
- Building landing pages or marketing sections
- You need scroll-triggered animations, particle effects, gradient beams
- Never use for app UI (poor accessibility, performance overhead)

**shadcn/ui is not a dependency** — it generates component source files into your `components/ui/` folder. You own them. This means no upstream breaking changes, but also no automatic updates.

**Accessibility baseline**: Radix and Ark ship with WAI-ARIA patterns implemented. React Aria goes further with full internationalization and platform-specific keyboard behavior. Headless UI covers common patterns but has fewer components.
