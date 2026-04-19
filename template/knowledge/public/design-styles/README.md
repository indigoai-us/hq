# Design Styles

Curated design library — styles, formulas, and OSS resources for web, app, print, slides, and social design.

## Sections

| Section | What | Path |
|---------|------|------|
| [Packs](packs/) | Full style packs — manifest, tokens, implementation, swipes, design template | `packs/` |
| [Styles](styles/) | Flat style files — stubs for packs not yet promoted | `styles/` |
| [Formulas](formulas/) | Repeatable recipes for specific design types | `formulas/` |
| [Resources](resources/) | OSS tools, fonts, icons, component libraries | `resources/` |
| [Foundations](foundations/) | Design reference docs — typography, color, spatial, motion, interaction, responsive, UX writing, AI Slop Test | `foundations/` |
| [Examples](examples/) | Worked examples of formula application | `examples/` |
| [PACK-SCHEMA.md](PACK-SCHEMA.md) | Schema documentation for `pack.yaml` manifests | root |
| [registry.yaml](registry.yaml) | Source of truth index of all packs and stubs | root |
| [_template/](_template/) | Scaffold template for creating new packs | `_template/` |

## Directory Structure

```
design-styles/
├── packs/                    ← full style packs (self-contained)
│   └── american-industrial/  ← first active pack
│       ├── pack.yaml         ← manifest (schema: PACK-SCHEMA.md)
│       ├── style-guide.md
│       ├── implementation.md
│       ├── design-tokens.css
│       ├── design-tokens.json (DTCG)
│       ├── design-template.md
│       └── swipes/           ← reference images
├── styles/                   ← flat .md stubs (8 styles awaiting promotion)
├── formulas/web/             ← repeatable design recipes
├── resources/                ← OSS tools, fonts, icons
├── foundations/              ← design quality reference docs
├── examples/                 ← worked formula examples
├── _template/                ← scaffold for new packs
├── registry.yaml             ← pack index (source of truth)
├── PACK-SCHEMA.md            ← pack.yaml schema docs
└── swipes/                   ← legacy (migrated into packs/)
```

> **Note:** `swipes/` at root is legacy — swipe images now live inside their respective pack directory (e.g. `packs/american-industrial/swipes/`). The root `swipes/` directory will be removed once all styles are promoted to full packs.

## Quick Reference

### Packs

Style packs are self-contained directories with a `pack.yaml` manifest, design tokens (CSS + JSON), implementation guide, swipes, and a drop-in `design-template.md` for repos. The registry (`registry.yaml`) is the source of truth — it lists all packs and their status.

| Pack | Type | Status | Path |
|------|------|--------|------|
| [American Industrial](packs/american-industrial/) | style | active | `packs/american-industrial/` |
| Brutalist Raw | style | stub | `styles/brutalist-raw.md` |
| Corporate Clean | style | stub | `styles/corporate-clean.md` |
| Dark Luxury | style | stub | `styles/dark-luxury.md` |
| Editorial Magazine | style | stub | `styles/editorial-magazine.md` |
| Ethereal Abstract | style | stub | `styles/ethereal-abstract.md` |
| Liminal Portal | style | stub | `styles/liminal-portal.md` |
| Minimalist Swiss | style | stub | `styles/minimalist-swiss.md` |
| Retro Analog | style | stub | `styles/retro-analog.md` |
| HPO Brand | brand | active | `companies/hpo/knowledge/brand/` |

**Active packs** include: `pack.yaml`, `style-guide.md`, `implementation.md`, `design-tokens.css`, `design-tokens.json`, `design-template.md`, `swipes/`.  
**Stubs** are flat `.md` files — workers can load the style guide for reference, but no tokens or templates are available yet.

### Styles (Stubs)

These 8 styles have flat `.md` files only. Workers can use them for reference; no tokens or design templates are available until promoted to full packs.

| Style | Vibe | Best For |
|-------|------|----------|
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

### Foundations

| Doc | Topic |
|-----|-------|
| [Typography](foundations/typography.md) | Scales, pairing, fluid type, loading strategies |
| [Color & Contrast](foundations/color-and-contrast.md) | OKLCH, palettes, dark mode, accessibility |
| [Spatial Design](foundations/spatial-design.md) | Grids, rhythm, container queries, hierarchy |
| [Motion Design](foundations/motion-design.md) | Timing, easing, reduced motion, perceived performance |
| [Interaction Design](foundations/interaction-design.md) | States, focus, forms, modals, keyboard patterns |
| [Responsive Design](foundations/responsive-design.md) | Mobile-first, fluid design, input detection |
| [UX Writing](foundations/ux-writing.md) | Labels, errors, empty states, translation |
| [AI Slop Test](foundations/ai-slop-test.md) | Quality gate checklist for AI-generated interfaces |

## Usage

### Workers

Design-aware workers load packs via `context.base`. Pack-aware setup (for workers that resolve `style-pack:` from a repo's `design.md`):

```yaml
context:
  base:
    - knowledge/public/design-styles/packs/          # full packs (active)
    - knowledge/public/design-styles/styles/          # stubs (flat .md)
    - knowledge/public/design-styles/formulas/web/
    - knowledge/public/design-styles/resources/
    - knowledge/public/design-quality/               # typography, color, spatial, motion, interaction, responsive, UX writing
```

Workers resolve packs by reading `design.md` in the target repo for `style-pack: <pack-id>`, then looking up `registry.yaml` to get the pack path and `context_paths.required`.

**Three-layer design architecture:**
- `dev-team/frontend-dev` — UI implementation + design quality skills (audit, polish, typeset, harden)
- `dev-team/motion-designer` — animation + transitions with style-coherent motion
- `impeccable-designer` — deprecated (2026-04-15); use frontend-dev + design-styles instead

### Per-Repo Design Context

Each repo that uses a design system has a `design.md` file (formerly `.impeccable.md`) at the repo root. The `Design Direction` section declares `style-pack: <pack-id>` which workers resolve via `registry.yaml`.

### Manual
Browse the registry (`registry.yaml`), pick a pack or stub, load the pack resources for context. Active packs have `implementation.md` + tokens; stubs have style-guide only.

### Adding New Packs

**Full pack** (preferred for new work):
1. Create `packs/{style-name}/` directory
2. Add `pack.yaml` using `_template/pack.yaml` as the scaffold
3. Add `style-guide.md`, `implementation.md`, `design-tokens.css`, `design-tokens.json`, `design-template.md`
4. Add `swipes/{style-name}/` with reference images
5. Register in `registry.yaml` with `status: active`
6. Update this index

**Stub only** (quick registration):
1. Create `styles/{style-name}.md`
2. Register in `registry.yaml` with `status: stub`
3. Promote to full pack when needed
