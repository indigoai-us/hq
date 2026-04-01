---
type: brand
domain: [brand]
status: canonical
tags: [design-style, brutalist, punk, raw, web-aesthetic, avant-garde]
relates_to: []
---

# Brutalist Raw

Origin: Web brutalism movement
Influenced by: Béton brut architecture (Le Corbusier), punk zines, early internet, avant-garde print
Modern practitioners: Bloomberg.com, Balenciaga (2021 era site), Craigslist (unintentionally), award-winning portfolio sites on Awwwards
Typography influence: David Rudnick
Tagline: "Honesty is the aesthetic"

## Core Aesthetic

- Exposed structure — visible grids, raw HTML-like layouts, nothing hidden
- Rejection of polish as a deliberate creative stance
- Dense information with no hierarchy softening
- Harsh, uncompromising contrast as the primary design tool
- System fonts or aggressively unusual typefaces; nothing "neutral"
- Anti-establishment: rejects Figma-clean, Swiss-grid, startup-beautiful conventions

## Color Palette

| Role | Color | Hex |
|------|-------|-----|
| Default background | Pure white or pure black | `#FFFFFF` / `#000000` |
| Primary accent | Acid green | `#00FF00` |
| Alert accent | Hot pink / magenta | `#FF00FF` |
| Warning accent | Traffic yellow | `#FFFF00` |
| Raw red | Pure primary red | `#FF0000` |
| Text | Opposite of background | `#000000` / `#FFFFFF` |

## Typography

### Headlines
- System fonts used deliberately (Arial, Times New Roman, Courier) OR extreme display faces (Druk, Knockout, custom grotesques)
- All-caps or aggressively mixed case
- Oversized — often 10vw or larger
- No letter-spacing adjustments; raw default or extreme tracking

### Body Text
- System fonts preferred (Courier New, Georgia, Helvetica, Times)
- Dense leading, no generous spacing
- Left-aligned; ragged right or justified with visible breaks

### Technical/Accent
- Pre-formatted code blocks used for non-code content
- Monospace for data and annotation
- Timestamps, file paths, error codes as design elements

### Hierarchy
- Hierarchy through scale extremes only — no weight or color softening
- Headers may be smaller than body if it violates expectation interestingly

## Layout Patterns

- Exposed grid lines left visible as design elements
- Overlapping elements without z-index resolution — intentional collision
- Full-bleed text with no padding or max-width constraints
- Horizontal scrolling used where vertical scroll is expected
- Tables used as primary layout device, not just for data
- No hero section — content starts at the top with zero ceremony

## Signature Elements

- Visible `<hr>` or `border: 1px solid black` used as decoration
- Underlines on everything — links styled like old HTML defaults
- Cursor replaced with custom crosshair, text cursor, or image
- Hover states that are jarring — color inversion, movement, blinking
- Right-click disabled or customized
- Background images that tile visibly (no `cover`, no `center`)
- Scrolling marquees or ticker text (`<marquee>` or CSS equivalent)
- Timestamps, IP addresses, or counter text in corner positions
- 404-style error messages used as actual UI labels
- Columns rendered with `column-count` visible gaps intact

## Textures & Effects

- No gradients; no blur; no box-shadow with spread — all banned
- Flat solid fills only, or literal image textures (concrete, newsprint, static)
- GIF-era animation: no easing curves, hard cuts or looping frames
- CSS `mix-blend-mode: multiply` on images against colored backgrounds
- Noise/grain added deliberately at maximum visible opacity

## Patterns to Copy

### Navigation Bar
```
[HOME] [WORK] [ABOUT] [CONTACT]
—————————————————————————————————
```

### Error-Style Label
```
ERROR 404: BEAUTY NOT FOUND
RENDERING: RAW HTML
COOKIES: NONE
JAVASCRIPT: OPTIONAL
```

### CSS Brutalist Reset
```css
* {
  font-family: Arial, sans-serif;
  border-radius: 0 !important;
  box-shadow: none !important;
  transition: none !important;
}
a { color: blue; text-decoration: underline; }
button { border: 2px solid black; background: white; cursor: crosshair; }
```

## When to Use

- Personal portfolios that want to signal anti-agency, anti-trend positioning
- Art/design publications and literary magazines
- Fashion brands in provocation mode (underground, avant-garde)
- Music artists, labels, and venues in punk/industrial/experimental genres
- Political or activist projects requiring urgency over beauty
- Developer tools and hacker-culture products
- Award-circuit web experiments prioritizing concept over usability
- Agencies pitching "we think differently" to sophisticated clients

## When NOT to Use

- Consumer SaaS with mainstream adoption goals
- Healthcare, finance, or legal services (trust requires legibility and calm)
- E-commerce with conversion as primary metric
- Brands targeting users over 50 or non-design-literate audiences
- Any brief using the word "premium" sincerely

## Reference Projects

- Bloomberg.com — dense information brutalism at editorial scale
- Balenciaga 2021 site — fashion brutalism, intentional ugliness as luxury signal
- Craigslist — accidental brutalism; study why it still works at scale
- Awwwards.com/awards — filter by "Brutalist" for annual award-winning examples
- davidrudnick.com — typography-led brutalism; text as the only visual element
- Minimalissimo (minimalissimo.com) — adjacent reference for anti-decoration logic

## Swipes

See: `swipes/brutalist-raw/`
