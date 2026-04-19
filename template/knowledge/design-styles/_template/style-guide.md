---
# YAML frontmatter — fill in before publishing
type: brand                      # brand | reference | canonical
domain: [brand]                  # keep [brand] for style packs
status: draft                    # draft | canonical
tags: [design-style, <pack-id>, <aesthetic-tag>, <medium-tag>]
                                 # e.g., [design-style, american-industrial, typography, web-aesthetic]
relates_to: []                   # list related pack ids or style slugs if this pack extends another
---

# <Pack Display Name>

<!-- Replace this block with the original designer / studio credit if attributed.
     For original packs, describe the aesthetic origin / inspiration. -->

Designer: <Designer Name>
Studio: <Studio Name> (<url>)
Location: <City, Country>
Tagline: "<designer's tagline or a one-line aesthetic statement>"

---

## Core Aesthetic

<!-- List 5–8 bullet points that define the soul of this aesthetic.
     These are the "what makes this style immediately recognizable" descriptors.
     Be specific — avoid generic terms like "modern" or "clean" without qualification.

     Examples from american-industrial.md:
     - High-tech industrial design language
     - Aerospace/defense/manufacturing influence
     - Precision-engineered visual systems
-->

- <Core aesthetic quality 1>
- <Core aesthetic quality 2>
- <Core aesthetic quality 3>
- <Core aesthetic quality 4>
- <Core aesthetic quality 5>

---

## Color Palette

### Palette Principle

<!-- Explain the philosophy behind this aesthetic's use of color.
     Answer: What role does color play? Is it structural, emotional, decorative, or restrained?
     Is there a signature color relationship or rule?

     Example: "Color is secondary to structure. The American Industrial aesthetic is defined by
     typography, layout, and industrial language — not by any single hue."
-->

<Explain the role of color in this aesthetic. 2–4 sentences.>

### Foundation (Always Present)

<!-- The base palette that never changes. Usually neutrals + 1–2 structural colors.
     Replace all hex values and roles. Add or remove rows as needed. -->

| Role | Color | Hex |
|------|-------|-----|
| Background (light) | <color name> | `#XXXXXX` |
| Background (dark) | <color name> | `#XXXXXX` |
| Surface | <color name> | `#XXXXXX` |
| Text primary | <color name> | `#XXXXXX` |
| Text secondary / muted | <color name> | `#XXXXXX` |
| Structural / border | <color name> | `#XXXXXX` |

### Accent Palettes (Project-Specific)

<!-- Describe the accent color system. Some aesthetics use a single fixed accent;
     others rotate palettes per project. Document all options here.
     Delete this section if the aesthetic uses a single fixed accent only.

     Format: one row per named palette option. -->

| Palette | Accent Colors | Hex Reference | Example Projects / Use Cases |
|---------|--------------|---------------|------------------------------|
| <Palette Name 1> | <color description> | `#XXXXXX` | <when to use> |
| <Palette Name 2> | <color description> | `#XXXXXX` | <when to use> |
| Monochrome | No accent — black, white, structural gray only | n/a | <when to use> |

---

## Typography

### Headlines

<!-- Describe the display typeface(s) used for headlines.
     Include: font name(s), weight(s), case treatment, tracking, and the "feeling" it creates. -->

- <Primary display font name> — <weight range> — <case treatment>
- <Fallback display font if primary unavailable>
- <Key typographic quality: e.g., "condensed for density", "expanded for authority">
- <Letter-spacing or tracking notes>

### Body Text

<!-- Describe the body typeface and its usage rules.
     Include: font name, weight, line-height preference, and readability notes. -->

- <Body font name> — <weight> — <line-height range>
- <Usage note: e.g., "never use as display face", "generous line-height is essential">

### Technical / Specs / Labels

<!-- Document any third typeface used for data, specs, UI labels, or monospace needs.
     Delete this section if the aesthetic uses only two typefaces. -->

- <Technical font name or "none"> — <weight> — <use cases>
- <Usage rule: e.g., "uppercase only", "11–13px only">

### Hierarchy

<!-- Explain the typographic hierarchy system.
     How do the sizes contrast? What's the relationship between headline and body?
     Include any signature rules about mixing typefaces. -->

- <Rule 1 about scale contrast or hierarchy>
- <Rule 2 about pairing typefaces or size relationships>
- <Rule 3 about weight contrast or case treatment>

---

## Layout Patterns

<!-- List the signature layout patterns of this aesthetic.
     Be specific — "asymmetric grid" is less useful than "two-column split: 380px sidebar + 1fr content".
     List 4–8 patterns. -->

- <Layout pattern 1>
- <Layout pattern 2>
- <Layout pattern 3>
- <Layout pattern 4>
- <Layout pattern 5>

---

## Signature Elements

<!-- List the visual elements that make this aesthetic instantly recognizable.
     These are the "if you see this, you know what pack it is" details.
     Examples: corner brackets, diagonal stripes, accent bars, orbital diagrams, pill shapes, etc. -->

- <Signature element 1>
- <Signature element 2>
- <Signature element 3>
- <Signature element 4>
- <Signature element 5>

---

## Textures & Effects

<!-- Describe any textures, overlays, or visual effects that are part of the aesthetic.
     For each: describe what it is, how it's used, and at what opacity/scale.
     Delete this section if the aesthetic is clean/flat with no texture. -->

- <Texture or effect 1: e.g., "Subtle film grain overlay at 0.3 opacity on backgrounds">
- <Texture or effect 2>
- <Texture or effect 3>

---

## Patterns to Copy

<!-- Provide 2–4 concrete copy-paste examples of signature patterns from this aesthetic.
     These could be: typographic treatments, document chrome, UI copy patterns, code labels, etc.
     Use code blocks so they're easy to copy. -->

### <Pattern Name 1>

```
<!-- Replace with a literal example of this pattern -->
<EXAMPLE LINE 1>
<EXAMPLE LINE 2>
<EXAMPLE LINE 3>
```

### <Pattern Name 2>

```
<!-- Replace with a literal example of this pattern -->
<EXAMPLE LINE 1>
<EXAMPLE LINE 2>
```

---

## When to Use

<!-- List the industries, product types, and contexts where this aesthetic excels.
     Be honest about fit — a good style guide knows its lane. -->

- <Industry or context 1>
- <Industry or context 2>
- <Industry or context 3>
- <Industry or context 4>
- <Industry or context 5>

---

## When NOT to Use

<!-- List the contexts where this aesthetic does NOT fit.
     This section is as important as "When to Use" — it prevents misapplication. -->

- <Context where this aesthetic fails 1>
- <Context where this aesthetic fails 2>
- <Context where this aesthetic fails 3>
- <Context where this aesthetic fails 4>

---

## Reference Projects

<!-- List 4–8 real-world examples that embody this aesthetic.
     These help pack authors calibrate "am I doing this right?"
     Include: project name, brief note about what it demonstrates. -->

- <Project Name 1> — <what it demonstrates>
- <Project Name 2> — <what it demonstrates>
- <Project Name 3> — <what it demonstrates>
- <Project Name 4> — <what it demonstrates>

---

## Swipes

<!-- Point to the swipes directory for reference images.
     Update the path to match your pack id. -->

See: `knowledge/public/design-styles/packs/<pack-id>/swipes/`

<!-- Describe the reference images briefly so workers know what to expect. -->
<N> reference images demonstrating key patterns: <brief description>.
