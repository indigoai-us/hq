---
type: reference
domain: [brand, engineering]
status: canonical
tags: [fonts, typography, pairings, web-fonts, variable-fonts]
relates_to: []
---

# Font Stacks & Pairings

Curated font recommendations for web projects — zero-cost to premium, organized by use case and aesthetic.

## Recommended

| Name | Type | License | Best For | URL |
|------|------|---------|----------|-----|
| System UI stack | CSS | Free | Zero-cost, native feel, fastest performance | (CSS only) |
| Inter | Sans-serif | OFL (free) | UI, apps, dashboards, body text | fonts.google.com/specimen/Inter |
| DM Sans | Sans-serif | OFL (free) | Clean SaaS, modern marketing | fonts.google.com/specimen/DM+Sans |
| Plus Jakarta Sans | Sans-serif | OFL (free) | Friendly SaaS, startup sites | fonts.google.com/specimen/Plus+Jakarta+Sans |
| Geist | Sans-serif | OFL (free) | Dev tools, Vercel-adjacent projects | vercel.com/font |
| Space Grotesk | Sans-serif | OFL (free) | Tech brands, editorial UI | fonts.google.com/specimen/Space+Grotesk |
| Outfit | Sans-serif | OFL (free) | Consumer apps, approachable brands | fonts.google.com/specimen/Outfit |
| Playfair Display | Serif | OFL (free) | Editorial headers, luxury, fashion | fonts.google.com/specimen/Playfair+Display |
| DM Serif Display | Serif | OFL (free) | Pairs with DM Sans, editorial contrast | fonts.google.com/specimen/DM+Serif+Display |
| Lora | Serif | OFL (free) | Long-form reading, blog body | fonts.google.com/specimen/Lora |
| Source Serif 4 | Serif | OFL (free) | Variable, excellent readability | fonts.google.com/specimen/Source+Serif+4 |
| Fraunces | Serif | OFL (free) | Expressive display, soft luxury | fonts.google.com/specimen/Fraunces |
| JetBrains Mono | Mono | OFL (free) | Code editors, dev-focused UI | fonts.google.com/specimen/JetBrains+Mono |
| Fira Code | Mono | OFL (free) | Ligatures, code display blocks | fonts.google.com/specimen/Fira+Code |
| IBM Plex Mono | Mono | OFL (free) | Technical docs, IBM-adjacent brands | fonts.google.com/specimen/IBM+Plex+Mono |
| Geist Mono | Mono | OFL (free) | Pairs with Geist, terminal aesthetic | vercel.com/font |
| Syne | Display | OFL (free) | Bold editorial, creative portfolios | fonts.google.com/specimen/Syne |
| Cabinet Grotesk | Display | Free (self-hosted) | Strong headlines, modern grotesque | fontshare.com/fonts/cabinet-grotesk |
| Clash Display | Display | Free (self-hosted) | High-impact headers, bold branding | fontshare.com/fonts/clash-display |
| Satoshi | Sans-serif | Free (self-hosted) | Versatile, clean, similar to Inter | fontshare.com/fonts/satoshi |
| General Sans | Sans-serif | Free (self-hosted) | Geometric, approachable | fontshare.com/fonts/general-sans |

## Pairings

**Minimalist Swiss**
- Headlines: Inter (700) or Space Grotesk (600)
- Body: Inter (400)
- Mono accents: JetBrains Mono or Geist Mono
- Character: tight tracking on headlines, generous line-height on body

**Corporate Clean**
- Headlines: DM Serif Display
- Body: DM Sans
- Notes: The DM family is designed to pair — size contrast does the work

**Editorial**
- Headlines: Playfair Display
- Body: Inter or Lora
- Notes: Use Playfair sparingly (display sizes only); Lora for long-form, Inter for UI

**Developer Tool / Technical**
- Headlines: Geist or IBM Plex Sans
- Body: Geist or Inter
- Mono: Geist Mono or JetBrains Mono
- Notes: Mono accents in headers signal technical product

**Startup / SaaS**
- Headlines: Plus Jakarta Sans (700) or Outfit (700)
- Body: Plus Jakarta Sans (400) or DM Sans (400)
- Notes: Round geometry reads friendly and modern

**Bold Creative / Portfolio**
- Headlines: Syne or Clash Display (self-hosted)
- Body: Inter or Satoshi
- Notes: High contrast in weight and scale; body must be very readable to offset expressive headers

**Soft Luxury / Premium Consumer**
- Headlines: Fraunces or Playfair Display
- Body: Source Serif 4 or Lora
- Notes: All-serif pairings work here; avoid geometric sans for body

## Anti-Recommendations

- **Roboto**: Overused, permanently associated with Google's Material era and cheap templates. Inter does everything Roboto does, better.
- **Open Sans**: Dated, was the default for everything 2012–2018. Looks like an old corporate site.
- **Montserrat**: Ubiquitous on Squarespace and Wix templates. Strong font but carries heavy template baggage.
- **Raleway**: Thin weights look elegant but collapse at small sizes; medium weights look like a 2016 landing page.
- **Nunito**: Overly rounded, reads as children's app or low-budget startup.
- **Lato**: Competent but personality-free. Inter replaced it.

## Worker Integration

**Loading via Google Fonts (CDN)**
```html
<!-- Preconnect first -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>

<!-- Example: Inter + Playfair Display -->
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Playfair+Display:wght@700&display=swap" rel="stylesheet">
```

**Self-hosting from Fontshare (Cabinet Grotesk, Clash Display, Satoshi)**
```css
@font-face {
  font-family: 'Cabinet Grotesk';
  src: url('/fonts/CabinetGrotesk-Variable.woff2') format('woff2');
  font-weight: 100 900;
  font-display: swap;
}
```

**System font stack (zero-cost baseline)**
```css
font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
```

**Responsive type with clamp()**
```css
/* Fluid: 18px at 320px viewport → 20px at 1280px */
font-size: clamp(1.125rem, 1rem + 0.5vw, 1.25rem);

/* Display heading: 32px → 64px */
font-size: clamp(2rem, 1.5rem + 2.5vw, 4rem);
```

**Variable font axis control**
```css
/* Inter supports wght axis — single file for all weights */
font-variation-settings: 'wght' 450;
```

**Next.js (recommended for self-hosted)**
```ts
import { Inter, Playfair_Display } from 'next/font/google'

const inter = Inter({ subsets: ['latin'], display: 'swap' })
const playfair = Playfair_Display({ subsets: ['latin'], weight: ['700'] })
```

**Always include `font-display: swap`** — prevents invisible text during font load. Non-negotiable for Google Fonts projects.

**Fontshare download**: fonts at fontshare.com come as zip files with `.woff2` variants. Download, place in `public/fonts/`, define `@font-face` as above.
