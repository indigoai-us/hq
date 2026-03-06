---
type: brand
domain: [brand]
status: canonical
tags: [design-style, corporate, saas, clean, web-aesthetic, b2b]
relates_to: []
---

# Corporate Clean

Designer: Composite B2B SaaS design language
Origin: Evolved from 2015–2025 SaaS design convergence — Stripe, Notion, Linear, Figma as canonical references
Practitioners: Most well-funded B2B SaaS companies; design teams at Stripe, Intercom, HubSpot, Notion, Figma
Tagline: "Trustworthy, capable, and frictionless. The design language of software that means business."

## Core Aesthetic

- Professional without being stiff — approachable authority, not corporate coldness
- Clean sans-serif type system built around Inter, DM Sans, or Geist
- Subtle depth through soft shadows, layered cards, and micro-gradients
- Section-based page rhythm with alternating backgrounds for scannable structure
- Rounded corners everywhere (8–16px) — edge-softness signals modern and safe
- Trust signals woven into the layout: logos, metrics, testimonials, security badges

## Color Palette

| Role | Color | Hex |
|------|-------|-----|
| Background primary | White | `#FFFFFF` |
| Background secondary | Light gray | `#F8F9FA` |
| Background tertiary | Slightly warmer gray | `#F1F3F5` |
| Text primary | Dark slate | `#0F172A` |
| Text secondary | Medium slate | `#475569` |
| Text tertiary | Light slate | `#94A3B8` |
| Brand / CTA | Indigo blue | `#4F46E5` |
| Brand hover | Deep indigo | `#4338CA` |
| Border | Hairline gray | `#E2E8F0` |
| Success | Soft green | `#22C55E` |

## Typography

### Headlines
- Inter, DM Sans, or Geist — the canonical corporate-clean family
- 48–72px on desktop for hero; 32–40px for section headers
- Semibold to Bold (600–700); black/900 reserved for single-word impact moments
- Sentence case; gradient text on hero headline is acceptable as single accent
- Letter-spacing: -0.02em to -0.03em at display sizes for modern polish

### Body Text
- Same sans-serif family, Regular (400)
- 16–18px body, 1.6 line-height
- Slate-500 (`#64748B`) for supporting body copy — softened, not harsh black

### Technical/Accent
- Monospace (Geist Mono, JetBrains Mono) for code snippets, pricing tiers, or feature specs
- Pill badges and tag labels in semibold 12–13px — key trust-signal component
- Metric callouts: extra-bold number + regular-weight descriptor below

### Hierarchy
- Four clear levels: Hero → Section Header → Sub-header → Body
- Color shift from dark to medium slate signals descending importance
- Never use decorative fonts — system stays within 1–2 typefaces maximum

## Layout Patterns

- Full-width sections stacked vertically with alternating `#FFFFFF` / `#F8F9FA` backgrounds for rhythm
- Center-aligned hero with headline, sub-copy, and 1–2 CTA buttons; feature grid or screenshot below the fold
- 3-column feature grids with icon, bold label, and 2-line descriptor per card
- Logo bar ("Trusted by") immediately below hero — horizontal scrolling strip on mobile
- Two-column alternating feature sections: screenshot left / copy right, then flip
- Testimonial grid (2–3 columns) or single large pull-quote with avatar for social proof
- Sticky header with logo, nav, and CTA button — collapses cleanly on scroll

## Signature Elements

- Soft card shadows: `box-shadow: 0 1px 3px rgba(0,0,0,0.08), 0 4px 16px rgba(0,0,0,0.06)`
- Rounded pill CTA buttons (9999px border-radius) in brand color
- Subtle gradient hero backgrounds — `linear-gradient(135deg, #EEF2FF 0%, #FFFFFF 60%)`
- Metric callout blocks: oversized bold number + small descriptor label below
- Feature icon treatment: 48×48px rounded square with brand-tinted background + centered icon
- Horizontal logo strip in gray (logos desaturated to slate-400 for visual unity)
- Testimonial card with avatar, quote, name, role, and company — constrained to ~400px width
- Thin top-border accent on feature cards: `border-top: 2px solid #4F46E5`
- "Badge" pill above hero headline: `New · Feature name →` in brand color
- Pricing tier cards with highlighted "Most Popular" card elevated via border or shadow

## Textures & Effects

- Subtle radial gradient on hero section — brand color at 8–12% opacity emanating from center-top
- Mesh gradient or noise-texture background on select sections (used sparingly — one per page max)
- Screenshot/UI mockup dropped in a browser chrome frame or device mockup for context
- Soft inner-glow on focused input fields and CTA buttons on hover
- Micro-animations on scroll: fade-up with 30px translate, 0.4s ease — never distracting

## Patterns to Copy

### Hero Badge + Headline + CTA
```
[ New · Announcing our Series B → ]

The platform teams use
to ship faster.

Sub-copy line here in medium slate.

[ Get started free ]  [ Book a demo ]
```

### Feature Card
```
[ Icon ]
Feature Name
Short two-line description of what this
does and why it matters to the user.
```

### Metric Callout Row
```
10,000+          99.9%           $2.4B
Companies        Uptime SLA      Processed
```

## When to Use

- B2B SaaS product landing pages and marketing sites
- Developer tools that need to signal reliability alongside capability
- Startup pitch sites and investor-facing pages requiring immediate credibility
- Enterprise product tiers where trust and clarity drive conversion
- Internal tools and dashboards that need to feel "professional product" not "internal hack"
- Documentation sites and help centers for software products
- Pricing pages where clarity and confidence drive purchase decisions
- Agency or consultancy sites targeting corporate clients

## When NOT to Use

- Consumer brands, lifestyle products, or anything where "corporate" reads as a negative
- Creative studios, artists, or designers whose differentiation depends on a distinct visual voice
- High-energy, entertainment, or gaming contexts where clean reads as cold and lifeless
- Early-stage products without social proof to fill testimonial and logo sections
- Brands needing a strong emotional or cultural identity — clean erases personality

## Reference Projects

Canonical references to study:
- stripe.com — the gold standard; masterclass in spacing, hierarchy, and gradient use
- linear.app — Swiss restraint applied inside the Corporate Clean framework
- notion.so — warm variant; proves the palette works with personality
- figma.com — product-first storytelling within the system
- vercel.com — monochrome extreme of the spectrum, still fits the pattern

Secondary references:
- loom.com — testimonial and metric section execution
- intercom.com — feature grid and logo-bar implementation

## Swipes

See: `knowledge/design-styles/swipes/corporate-clean/`
