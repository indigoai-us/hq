# Design Styles

Curated design library — styles, formulas, and OSS resources for web, app, print, slides, and social design.

## Sections

| Section | What | Path |
|---------|------|------|
| [Styles](styles/) | Visual aesthetics with palettes, typography, layout rules | `styles/` |
| [Formulas](formulas/) | Repeatable recipes for specific design types | `formulas/` |
| [Resources](resources/) | OSS tools, fonts, icons, component libraries | `resources/` |
| [Swipes](swipes/) | Reference images organized by style | `swipes/` |

## Quick Reference

### Styles

| Style | Vibe | Best For |
|-------|------|----------|
| [American Industrial](styles/american-industrial.md) | Precision-engineered, aerospace, bold | AI/ML, defense, enterprise |
| [Ethereal Abstract](styles/ethereal-abstract.md) | Dreamy, atmospheric, warm light | Social imagery, thought leadership |
| [Liminal Portal](styles/liminal-portal.md) | Threshold spaces, mysterious, contemplative | Transformation themes, philosophical |
| [Minimalist Swiss](styles/minimalist-swiss.md) | Clean grid, functional, typographic | SaaS, portfolios, professional |
| [Corporate Clean](styles/corporate-clean.md) | Trustworthy, structured, approachable | Enterprise, B2B, fintech |
| [Editorial Magazine](styles/editorial-magazine.md) | Expressive type, bold layout, storytelling | Blogs, agencies, media |
| [Dark Luxury](styles/dark-luxury.md) | Rich, premium, moody | Premium brands, fintech, fashion |
| [Brutalist Raw](styles/brutalist-raw.md) | Exposed structure, raw, confrontational | Dev tools, creative studios, standout |
| [Retro Analog](styles/retro-analog.md) | Warm nostalgia, tactile, crafted | Local biz, cafes, artisan brands |

### Formulas

| Formula | Category |
|---------|----------|
| [Landing Page](formulas/web/landing-page.md) | Web |
| [SaaS Marketing](formulas/web/saas-marketing.md) | Web |
| [Portfolio](formulas/web/portfolio.md) | Web |
| [Local Business](formulas/web/local-business.md) | Web |

## Usage

### Workers
Workers reference this knowledge via `context.base`:
```yaml
context:
  base:
    - knowledge/public/design-styles/styles/
    - knowledge/public/design-styles/formulas/web/
    - knowledge/public/design-styles/resources/
```

### Manual
Browse styles, pick one, apply its rules. Cross-reference with a formula for the page type you're building.

### Adding New Styles
1. Create `styles/{style-name}.md` following existing template
2. Add swipes folder: `swipes/{style-name}/`
3. Update this index
