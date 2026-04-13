# Impeccable Design Reference

Deep technical guides for building distinctive, production-quality frontend interfaces. Part of the [impeccable.style](https://impeccable.style) library.

These docs are the reference layer behind the impeccable skills on `frontend-designer` and `ux-auditor`. Workers load them via `context.base: [knowledge/public/impeccable/]`.

## Reference Docs

| Doc | Topics |
|-----|--------|
| [typography.md](typography.md) | Vertical rhythm, modular scales, font pairing, fluid type with `clamp()`, OpenType features, token architecture |
| [color-and-contrast.md](color-and-contrast.md) | OKLCH color space, tinted neutrals, palette structure, 60-30-10 rule, WCAG contrast, dark mode, two-layer tokens |
| [motion-design.md](motion-design.md) | 100/300/500ms duration rules, easing curves, staggered animations, `prefers-reduced-motion`, perceived performance |
| [interaction-design.md](interaction-design.md) | 8 interactive states, focus rings, form design, loading states, modal focus management, Popover API, roving tabindex |
| [spatial-design.md](spatial-design.md) | 4pt base spacing, semantic token naming, self-adjusting grids, squint test, container queries, optical adjustments |
| [responsive-design.md](responsive-design.md) | Mobile-first, content-driven breakpoints, pointer/hover queries, safe area insets, responsive images, layout patterns |
| [ux-writing.md](ux-writing.md) | Button labels, error message formula, empty states, voice vs tone, accessibility writing, i18n expansion budgets |

## Worker Usage

```yaml
context:
  base:
    - knowledge/public/impeccable/
```

Used by: `frontend-designer`, `ux-auditor`
