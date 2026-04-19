<!--
  design.md — Drop-in Design Context for American Industrial
  ────────────────────────────────────────────────────────────
  INSTRUCTIONS:
  1. Copy this file to {repo}/design.md in any repo adopting this pack.
  2. Fill in the "Product Context" section for the specific project.
  3. Do NOT edit the Anti-Patterns or Quality Bar sections — they are canonical.
  4. The Brand section describes the aesthetic commitment (this is a style pack, not brand-specific).

  Source of truth: knowledge/public/design-styles/packs/american-industrial/
-->

## Brand

**American Industrial** — structural-honesty industrial design inspired by Brass Hands / Kyle Anthony Miller. High-tech authority without decoration: condensed heavy type, shared-border grids, flat accent rules. Think factory floor, Wall Street terminal, military-spec data sheet.

This is NOT: rounded, soft, gradient-heavy, glassmorphic, or generic SaaS.

## Product Context

<!-- CUSTOMIZE THIS SECTION per repo — this is the only section that changes per-project -->

- **What this repo does:** [e.g., "Marketing site for an enterprise SaaS product"]
- **Primary users:** [e.g., "prospective customers in defense/fintech/AI, 25–45"]
- **Surface area:** [e.g., "desktop-first, 6 routes, SSR"]
- **Critical flows:** [list the 2–3 interactions that matter most for this repo]
- **Accent palette:** [choose one: Signal Orange / Warm Spectrum / Cold Technical / Warm Neutral / Soft Signal / Monochrome]

## Tone & Voice

- Authoritative and precise. No filler words, no enthusiasm inflation.
- Dense information as confidence — we show our work, we don't hide complexity.
- Labels over descriptions. "ACTIVE" not "currently running".
- Never: casual, playful, emoji-heavy, vague superlatives ("amazing", "powerful").
- Never: soft calls to action ("feel free to", "don't hesitate to").

## Design Direction — Commitment

This repo commits to the **American Industrial** design system. No other aesthetic is acceptable. Specifically:

- **style-pack: american-industrial**

- **Typography** — Condensed display type (Oswald / Bebas Neue) for ALL headlines. Always uppercase. Never italic for headlines. Never system fonts.
- **Tracking tiers** — Headlines 0.02em, labels 0.12–0.3em, body 0 (natural). This is non-negotiable.
- **Color** — High-contrast neutral foundation (black/cream). Single accent color per project from the approved palette. Accent used structurally only (bars, active states, numerals).
- **No gradients** — Flat fills only. No gradient text, no gradient backgrounds. Exception: subtle overlay gradients on images for text readability only.
- **Left-aligned by default** — Center alignment reserved for testimonial/review sections and stat dashboards only.
- **No glows, no blur** — `box-shadow: 0 0 Xpx rgba(accent)` = instant disqualification. No `backdrop-filter: blur()`.
- **Square corners** — `border-radius: 0` on all interactive elements (buttons, inputs, cards). Non-negotiable.

## Anti-Patterns (Hard Rules)

The following are **never** acceptable. The audit skill will flag each.

### Typography

- ❌ System fonts (Inter, Roboto, SF Pro) for any headline or display use
- ❌ Italic used for display headlines
- ❌ Centered headline text (left-align everything except testimonials and stat dashboards)
- ❌ Gradient text (`text-transparent bg-clip-text bg-gradient-to-*`)
- ❌ Thin/ultralight display weights — industrial type needs mass (min 600 for headlines)
- ❌ Monospace fonts for labels — use condensed display font instead

### Color

- ❌ Purple/violet gradients on dark background (generic AI dark theme)
- ❌ Neon cyan, neon green, or neon purple accents
- ❌ {company} accent (`#6366f1`) except in explicit dark-mode Command Center contexts
- ❌ Multiple accent colors in a single view — one accent per project
- ❌ Gradients as backgrounds (except pure text-readability overlays on images)

### Shape & Effects

- ❌ `border-radius` > 4px on interactive elements (buttons, cards, inputs)
- ❌ `box-shadow: 0 0 Xpx rgba(accent, Y)` — glows are sci-fi, not industrial
- ❌ `backdrop-filter: blur()` — glassmorphism is the antithesis of industrial honesty
- ❌ Floating cards with large drop shadows — use borders, not shadows
- ❌ Bounce or spring easing — motion is smooth and purposeful, never playful
- ❌ Background illustrations, blobs, or SVG artwork — industrial uses text and rules

### Layout & Copy

- ❌ Centered hero with centered headline — asymmetric left-stack only
- ❌ Generic SaaS template (Hero → Features grid → Testimonials → CTA)
- ❌ Soft CTAs ("Feel free to reach out", "Don't hesitate to contact us")
- ❌ Enthusiasm inflation ("powerful", "amazing", "game-changing")

## Quality Bar

Before shipping any visual change, apply the **AI Slop Test**:

> "If I showed this to someone and said 'AI made this,' would they believe me immediately?"

If yes, the work is not done.

Run the pack audit:

```
run frontend-dev audit
```

## References

- `knowledge/public/design-styles/packs/american-industrial/style-guide.md` — visual reference
- `knowledge/public/design-styles/packs/american-industrial/implementation.md` — code-level system
- `knowledge/public/design-styles/packs/american-industrial/design-tokens.css` — import these custom properties
- `knowledge/public/design-styles/packs/american-industrial/design-tokens.json` — DTCG format for tooling
- `knowledge/public/design-styles/packs/american-industrial/swipes/` — reference images (Brass Hands portfolio)
