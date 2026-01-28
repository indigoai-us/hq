---
description: Generate minimalist abstract white line SVG graphics
allowed-tools: Write, Read
argument-hint: <description> [--size WxH] [--output path]
---

# /svg - Minimalist SVG Generation

Generate clean, abstract white line art SVGs for web interfaces.

**Prompt:** $ARGUMENTS

## Style Guidelines

- **Strokes only**: No fills, or very subtle fills at low opacity
- **White on dark**: `stroke="white"` with `strokeWidth="1"` or thinner
- **Opacity for depth**: Use 1, 0.7, 0.4, 0.2 for layering
- **Geometric**: Circles, arcs, lines, grids, nodes
- **Minimal**: Remove all unnecessary elements

## Pattern Library

### Neural/AI (for AI assistants, ML products)
```svg
<!-- Interconnected nodes with radiating lines -->
<circle cx="200" cy="200" r="80" stroke="white" stroke-width="0.5" opacity="0.6"/>
<circle cx="200" cy="200" r="120" stroke="white" stroke-width="0.5" opacity="0.4"/>
<circle cx="200" cy="200" r="160" stroke="white" stroke-width="0.5" opacity="0.2"/>
<!-- Add small circles as nodes at intersections -->
```

### Data Flow (for infrastructure, pipelines)
```svg
<!-- Horizontal lines with varying opacity -->
<line x1="50" y1="100" x2="350" y2="100" stroke="white" stroke-width="1" opacity="0.8"/>
<!-- Connected nodes -->
<circle cx="100" cy="100" r="4" fill="white" opacity="0.6"/>
```

### Grid/Matrix (for platforms, systems)
```svg
<!-- Subtle grid with highlight points -->
<pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
  <path d="M 40 0 L 0 0 0 40" fill="none" stroke="white" stroke-width="0.3" opacity="0.2"/>
</pattern>
```

### Radial (for processing, compute)
```svg
<!-- Radiating lines from center -->
<line x1="200" y1="200" x2="200" y2="50" stroke="white" stroke-width="0.5" opacity="0.4"/>
<!-- Rotate and repeat -->
```

### Shield/Security
```svg
<!-- Shield outline -->
<path d="M200 50 L350 120 L350 250 Q350 350 200 380 Q50 350 50 250 L50 120 Z"
      stroke="white" stroke-width="1" fill="none" opacity="0.6"/>
```

## Default Template

```svg
<svg width="400" height="400" viewBox="0 0 400 400" fill="none" xmlns="http://www.w3.org/2000/svg">
  <!-- Content here -->
</svg>
```

## Process

1. Parse description for concept (AI, data, security, etc.)
2. Select appropriate geometric patterns
3. Compose SVG with proper opacity layering
4. Output clean, optimized SVG code

## Output

If `--output` specified, write to that path. Otherwise, output the SVG code to copy.

Example: `/svg neural network pattern for AI assistant --size 600x400 --output /path/to/file.svg`
