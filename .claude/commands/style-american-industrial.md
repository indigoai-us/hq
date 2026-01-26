# American Industrial Style

Default UI style for personal projects. Monochrome variant.

Style inspired by Kyle Anthony Miller (@kyleanthony / brasshands.com)

## Instructions

1. Read the full style guide: `knowledge/design-styles/american-industrial.md`
2. Review swipe images in: `knowledge/design-styles/swipes/american-industrial/`
3. Apply these principles to the current design task

## Quick Reference

### Colors (MONOCHROME - Corey's preference)
- **Primary**: Pure black `#000000`
- **Accent**: Pure white `#FFFFFF`
- **Grays**: `#0A0A0A`, `#1A1A1A`, `#333333`, `#666666`, `#F0F0F0`
- **NO colors** - strictly black/white/gray only

### Typography
- Headlines: Bold geometric sans-serif, all-caps (Inter 900)
- Body: Clean sans-serif (Inter)
- Specs/data: Monospace (JetBrains Mono)

### Key Elements
- Corner brackets `[ ]` as framing devices
- Section labels with `+` prefix
- Unit IDs and serial numbers
- Status indicators (dots + uppercase labels)
- Technical callouts
- Left-border accent on cards

### Layout
- Asymmetric grids
- Generous whitespace
- Modular card systems
- Header with status block

### CSS Variables
```css
:root {
    --accent: #FFFFFF;
    --black: #000000;
    --charcoal: #0A0A0A;
    --gray-dark: #1A1A1A;
    --gray-mid: #333333;
    --gray-light: #666666;
    --cream: #F0F0F0;
    --white: #FFFFFF;
}
```

## Reference Implementation
See: `repos/private/social-drafts/index.html`

## Best For
Personal UIs, dashboards, admin tools, command centers
