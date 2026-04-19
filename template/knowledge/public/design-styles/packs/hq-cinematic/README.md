---
type: reference
domain: [design-system]
status: canonical
tags: [style-pack, hq-cinematic, design-styles, cinematic, prism]
relates_to: [../american-industrial/]
---

# hq-cinematic — Style Pack

**Version:** 0.1.0
**Type:** style
**Status:** active
**Primary consumer:** `hq-onboarding`

A cinematic navy-void aesthetic with prismatic light, refracted spectrum beams, floating dust motes, and warm neutral counterweights. Built for the HQ onboarding experience — the authority of a film colorist's timing suite, not a synthwave arcade.

---

## Palette

### Navy scale (page and surface backgrounds)

| Token | Hex | Role |
|-------|-----|------|
| `--bg-navy-000` | `#0E1733` | Hairline lift above the lightest anchor |
| `--bg-navy-100` | `#0A1228` | **PRD anchor** — lightest navy |
| `--bg-navy-500` | `#080F24` | **PRD anchor** — default page background |
| `--bg-navy-900` | `#050817` | **PRD anchor** — deepest void |

Intermediate stops (200/300/400/600/700/800) interpolate between the three anchors for surface elevation and gradient stops.

### Spectrum (prism dispersion)

Five physical-order stops — short wavelength to long — used for beams, reveal sweeps, and text masks:

| Token | Hex |
|-------|-----|
| `--spectrum-cyan` | `#7DE3F4` |
| `--spectrum-violet` | `#8B6DF0` |
| `--spectrum-magenta` | `#E56AB3` |
| `--spectrum-orange` | `#F28A4B` |
| `--spectrum-gold` | `#E8C77A` |

Combined gradients:
- `--gradient-spectrum-linear` — horizontal 5-stop sweep (beams, headline masks)
- `--gradient-spectrum-radial` — radial 5-stop bloom (WebGL stages, glow origins)

### Warm neutrals (counterweights)

Each shipped at 20 / 40 / 60 / 80 tints (interpolated toward `--bg-navy-900`) for hairline rules, warm shadows, foreground glyphs over navy:

| Base token | Hex | Tints |
|------------|-----|-------|
| `--warm-brown` | `#7C5B3A` | `-20`, `-40`, `-60`, `-80` |
| `--warm-yellow` | `#E8C77A` | `-20`, `-40`, `-60`, `-80` |
| `--warm-pink` | `#A97791` | `-20`, `-40`, `-60`, `-80` |

### Typography

Display type is **Inter 800/900 only**. No new font dependencies, no `@font-face` declarations — consumers rely on whatever already loads Inter in their app shell.

- `--font-display: "Inter", system-ui, -apple-system, sans-serif`
- `--font-display-weight-bold: 800`
- `--font-display-weight-black: 900`

---

## Motion vocabulary

Five keyframes live in `keyframes.css`. Each has a hard-cut override under `@media (prefers-reduced-motion: reduce)` — reduced-motion users land on the end-state frame instantly, no transforms, no easing.

| Keyframe | Intent | Default duration |
|----------|--------|------------------|
| `prism-sweep` | Refracted spectrum band travels across a surface — headline reveals, section transitions | `--motion-duration-sweep` (1400ms) |
| `beam-drift` | Slow vertical beam translation with subtle sway — background element | `--motion-duration-drift` (8000ms) |
| `spectrum-dispersion` | Chromatic aberration fan-out — hover/focus on headline words | `--motion-duration-bloom` (900ms) |
| `light-dust-float` | Particle drift upward with fade in/out — LightDust primitive | 6–12s, randomized per sprite |
| `bloom-pulse` | Single-shot radial glow breath — CTA focus, phase-machine transitions | `--motion-duration-bloom` (900ms) |

Easing tokens: `--motion-ease-cinematic` (hero reveals), `--motion-ease-drift` (background loops).

---

## Exported primitives

The pack exports **9 primitives** for consumer apps (shipped separately via the `hq-onboarding` repo):

1. **PrismBeam** — animated refracted light beam with configurable angle and intensity
2. **LightDust** — particle layer of drifting dust motes over navy
3. **CrtVignette** — soft navy-to-void radial vignette (no scanlines, no grain)
4. **CornerBrackets** — hairline L-shaped corner markers for framing
5. **SpectrumText** — text with gradient-masked spectrum fill, supports dispersion hover
6. **PrismReveal** — entrance animation wrapper using `prism-sweep`
7. **PhaseMachine** — staged transition controller for multi-phase reveals
8. **WebGLStage** — Three.js/WebGL canvas host pre-wired to spectrum tokens
9. **usePrefersReducedMotion** — React hook that mirrors the media query for JS-driven motion gating

---

## Do / Don't

### Do

- Use navy-500 or navy-900 as the default page background. Let the spectrum carry chroma, not surfaces.
- Reserve the full spectrum gradient for one or two "hero" moments per screen — beams, headline reveals. Otherwise use a single accent hue.
- Pair spectrum accents with warm-neutral hairlines and glyphs for counterweight.
- Always honor `prefers-reduced-motion` — the hard-cut overrides in `keyframes.css` are the floor, not a ceiling; skip auto-play entirely when the query matches.
- Keep type on Inter 800/900 for display. Body copy inherits the host app's stack.

### Don't

- **No scanlines.** This is a colorist's suite, not a CRT monitor.
- **No CRT grain.** No analog noise textures, no VHS artifacts, no chromatic TV static overlays.
- **No cyan-cyberpunk.** This is not Tron, not synthwave, not Blade Runner neon. The spectrum is physical (prism dispersion), not digital (glitch / neon signage).
- Don't stack more than one spectrum beam plus one dust layer per viewport — the aesthetic collapses to noise when over-layered.
- Don't redeclare token names in consumer code — always reference via `var(--...)`.
- Don't introduce new display fonts. Inter 800/900 only.

---

## Files in this pack

| File | Role |
|------|------|
| `pack.yaml` | Manifest (id, version, context_paths, consumers) |
| `tokens.css` | CSS custom properties — palette, gradients, motion primitives |
| `keyframes.css` | Five cinematic keyframes with reduced-motion overrides |
| `README.md` | This document — palette, motion, primitives, do/don't |

---

## Registry entry

Declared in `knowledge/public/design-styles/registry.yaml`:

```yaml
- id: hq-cinematic
  name: HQ Cinematic
  version: "0.1.0"
  type: style
  status: active
  path: packs/hq-cinematic/
  consumers:
    - hq-onboarding
  aesthetic: "Cinematic navy-void with prismatic light..."
```
