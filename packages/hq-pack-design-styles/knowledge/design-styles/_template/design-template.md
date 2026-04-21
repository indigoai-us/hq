<!--
  design.md — Drop-in Design Context for <Pack Display Name>
  ────────────────────────────────────────────────────────────
  INSTRUCTIONS FOR PACK AUTHORS:
  1. Copy this file to {repo}/design.md in any repo adopting this pack.
  2. Fill in the "Product Context" section for the specific project.
  3. Fill in the "Brand" section if this is a brand pack (replace placeholder text).
  4. Do NOT edit the Anti-Patterns or Quality Bar sections — they are canonical for this pack.
  5. Update the style-pack field in "Design Direction" to match the actual pack id.

  Source of truth for this pack: knowledge/public/design-styles/packs/<pack-id>/
-->

## Brand

<!--
  CUSTOMIZE THIS SECTION for the brand using this pack.
  Describe the brand in 1–3 sentences: what it is, what it stands for, and the tone.
  If this is a style pack (not a brand pack), describe the aesthetic commitment instead.

  Example (brand pack): "HPO — sparkling protein water. Functional nutrition meets elevated lifestyle.
  Think Aesop or Le Labo, not Gatorade or Quest. Editorial, warm, quietly confident."

  Example (style pack): "This repo adopts the <Pack Display Name> aesthetic — [one-line description].
  All visual decisions should reinforce this system."
-->

**<Brand or Product Name>** — <one-sentence brand or aesthetic description>. <2–3 sentences on positioning, tone, and who it is NOT.>

## Product Context

<!-- CUSTOMIZE THIS SECTION per repo — this is the only section that changes per-project -->

- **What this repo does:** [e.g., "Marketing site for the Acme dashboard product" or "Internal reporting tool"]
- **Primary users:** [e.g., "prospective customers, 25–40" or "internal team, growth analysts"]
- **Surface area:** [e.g., "desktop-first, 8 routes, SSR" or "mobile-first, SPA, PWA"]
- **Critical flows:** [list the 2–3 interactions that matter most for this specific repo]

## Tone & Voice

<!--
  CUSTOMIZE: Replace placeholder items with the voice rules for this brand/pack.
  Keep this list to 5–7 items. The first 2–3 should be positive ("sound like X").
  The last 2–3 should be negative ("never sound like Y").
-->

- <Positive voice rule 1 — e.g., "Quiet confidence. Never shouting.">
- <Positive voice rule 2 — e.g., "Sensorial — language evokes texture, weight, craft.">
- <Positive voice rule 3 — e.g., "Knowing, grounded. Assume the reader is intelligent.">
- Never: <negative voice rule 1>
- Never: <negative voice rule 2>

## Design Direction — Commitment

This repo commits to the **<Pack Display Name>** design system. No other aesthetic is acceptable. Specifically:

- **style-pack: <pack-id>**

<!--
  CUSTOMIZE: Replace each bullet with a specific commitment from this pack's implementation guide.
  These are the "this is what we've agreed to" statements — not aspirational, but binding.
  Pull directly from implementation.md Core Philosophy / Type Rules / Color Rules.
  Keep to 6–8 bullets — enough to be specific, not so many it becomes a full spec doc.
-->

- **<Typography commitment 1>** — <e.g., "Condensed display type (Oswald) for all headlines. All-caps. Never rounded or script.">
- **<Typography commitment 2>** — <e.g., "Letter-spacing tiers: headlines 0.02em, labels 0.12–0.3em, body 0 (natural).">
- **<Color commitment 1>** — <e.g., "High-contrast neutral foundation (black/cream). Single accent color per project.">
- **<Color commitment 2>** — <e.g., "Accent used structurally only — accent bars, active states, data numerals. Never as background fills.">
- **<Layout commitment>** — <e.g., "Left-aligned by default. Industrial grid with shared borders. No centered hero.">
- **<Effects commitment>** — <e.g., "No gradients, no glows, no glassmorphism. Flat fills only.">
- **<Shape commitment>** — <e.g., "Square corners only. border-radius: 0 on all interactive elements.">

## Anti-Patterns (Hard Rules)

The following are **never** acceptable in work using this pack. The audit skill will flag each.

### Typography

<!--
  CUSTOMIZE: List 4–6 typographic anti-patterns for this aesthetic.
  Be specific — "don't use the wrong font" is less useful than "❌ Inter used as a display face".
-->

- ❌ <Typographic anti-pattern 1 — e.g., "System fonts (Inter, Roboto) for headlines">
- ❌ <Typographic anti-pattern 2 — e.g., "Italic for display headlines">
- ❌ <Typographic anti-pattern 3 — e.g., "Centered headline text (left-align everything)">
- ❌ <Typographic anti-pattern 4 — e.g., "Gradient text">

### Color

<!--
  CUSTOMIZE: List 4–6 color anti-patterns. Include specific hex values where possible —
  the audit skill can grep for them.
-->

- ❌ <Color anti-pattern 1 — e.g., "Legacy red #XXXXXX">
- ❌ <Color anti-pattern 2 — e.g., "Cyan/purple AI-slop gradients">
- ❌ <Color anti-pattern 3 — e.g., "Neon accents">
- ❌ <Color anti-pattern 4 — e.g., "Gradient text on metrics or headlines">

### Shape & Effects

<!--
  CUSTOMIZE: List 4–6 shape/effect anti-patterns. Focus on the decorative effects
  that would make this aesthetic "look AI-generated" or "look generic".
-->

- ❌ <Shape anti-pattern 1 — e.g., "border-radius > 12px on interactive elements">
- ❌ <Effect anti-pattern 1 — e.g., "Drop shadows (flat design only)">
- ❌ <Effect anti-pattern 2 — e.g., "Glassmorphism / backdrop-blur">
- ❌ <Effect anti-pattern 3 — e.g., "Glow / box-shadow: 0 0 30px rgba(accent, 0.3)">
- ❌ <Effect anti-pattern 4 — e.g., "Bounce easing — motion is smooth, never playful">

### Layout & Copy

<!--
  CUSTOMIZE: List 4–6 layout and copy anti-patterns. These are the lazy defaults
  that make a site look like "any AI made this".
-->

- ❌ <Layout anti-pattern 1 — e.g., "Hero → features-grid → testimonials → CTA stack (generic SaaS template)">
- ❌ <Layout anti-pattern 2 — e.g., "Card grids everywhere — reserve for modular content, not layout">
- ❌ <Copy anti-pattern 1 — e.g., "'Loading your experience...' copy">
- ❌ <Copy anti-pattern 2 — e.g., "CTA shouting ('BUY NOW!', 'LIMITED TIME!')">

## Quality Bar

Before shipping any visual change from this repo, apply the **AI Slop Test**:

> "If I showed this to someone and said 'AI made this,' would they believe me immediately?"

If yes, the work is not done.

<!--
  CUSTOMIZE: Replace the audit command with the actual worker command for this pack.
  If no audit worker exists yet, use a placeholder comment.
-->

Run the pack audit to get specific violations:

```
<!-- CUSTOMIZE: replace with actual audit command, e.g.:
run frontend-dev audit
run hpo-designer audit
-->
<audit command here>
```

## References

<!--
  CUSTOMIZE: Update all paths to point to the actual pack files.
-->

- `knowledge/public/design-styles/packs/<pack-id>/style-guide.md` — visual reference
- `knowledge/public/design-styles/packs/<pack-id>/implementation.md` — code-level system
- `knowledge/public/design-styles/packs/<pack-id>/design-tokens.css` — import these custom properties directly
- `knowledge/public/design-styles/packs/<pack-id>/design-tokens.json` — DTCG format for tooling
