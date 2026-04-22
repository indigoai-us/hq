---
type: reference
domain: [design-system, moonflow]
status: canonical
tags: [implementation, moonflow-editorial-v2, react-native, expo]
---

# Moonflow Editorial V2 — Implementation Reference

Code-level system for the Moonflow iOS app (Expo SDK 54 + React Native 0.81).

**Token files (source of truth):**
- `constants/colors.ts` — full color palette + phase colors
- `constants/typography.ts` — Fraunces + Inter font families + scale
- `constants/spacing.ts` — spacing, border radius, icon sizes
- `tailwind.config.js` — Tailwind extensions mirroring the above

---

## Color Usage

Always import from `constants/colors.ts`. Never hardcode hex values.

```ts
import { Colors } from '@/constants/colors';

// Primary action
backgroundColor: Colors.terra.DEFAULT    // #b95b34

// Background surface
backgroundColor: Colors.cream.DEFAULT    // #fbf6f2

// Phase accent (Ovulation example)
borderColor: Colors.phase.ovulation.accent   // #bc99ff

// Glass surface
backgroundColor: Colors.glass.bg            // rgba(255,255,255,0.09)
borderColor: Colors.glass.border            // rgba(255,255,255,0.3)
```

### Phase Color Pattern
```ts
const PHASE_COLORS = {
  menstrual: { bg: Colors.phase.menstrual.bg, accent: Colors.phase.menstrual.accent },
  follicular: { bg: Colors.phase.follicular.bg, accent: Colors.phase.follicular.accent },
  ovulation:  { bg: Colors.phase.ovulation.bg,  accent: Colors.phase.ovulation.accent },
  luteal:     { bg: Colors.phase.luteal.bg,     accent: Colors.phase.luteal.accent },
};
```

---

## Typography Usage

```ts
import { Typography } from '@/constants/typography';

// Display heading (Fraunces)
fontFamily: Typography.fontFamily.display         // Fraunces_400Regular
fontSize: Typography.fontSize.h1                  // 32

// Editorial affirmation (Fraunces Light)
fontFamily: Typography.fontFamily.displayLight    // Fraunces_300Light
fontSize: Typography.fontSize.xl                  // 20

// Body text (Inter)
fontFamily: Typography.fontFamily.regular         // Inter_400Regular
fontSize: Typography.fontSize.base                // 16

// CTA button (Inter SemiBold)
fontFamily: Typography.fontFamily.semibold        // Inter_600SemiBold

// Italic editorial quote (Fraunces Italic)
fontFamily: Typography.fontFamily.displayItalic   // Fraunces_400Regular_Italic
```

### Typography Decision Rules
- ALL screen/section headings → Fraunces (any weight)
- ALL body copy, labels, form inputs → Inter
- NEVER use Cormorant Garamond (removed)
- Affirmations and InsightCallout quotes → Fraunces Light Italic

---

## Spacing Usage

```ts
import { Spacing, BorderRadius, IconSize } from '@/constants/spacing';

padding: Spacing.base          // 16
margin: Spacing.xl             // 24
borderRadius: BorderRadius.lg  // 16  (standard card)
borderRadius: BorderRadius.xl  // 24  (modal, large card)
borderRadius: BorderRadius.full // 9999 (pill/FAB)
```

---

## Component Patterns

### Button
```tsx
<Button variant="primary" size="md" onPress={...}>
  Label
</Button>
```
Variants: `primary` (terra fill) | `secondary` (outline) | `ghost` | `destructive`
Sizes: `sm` | `md` | `lg`

### Card
```tsx
<Card>
  {/* content */}
</Card>
```
Corner radius `lg` (16), soft shadow, cream tint or glass surface.

### GlassCard
```tsx
<GlassCard>
  {/* content */}
</GlassCard>
```
`Colors.glass.bg` background, `Colors.glass.border` border.

### Phase-Aware Color
```ts
const phaseColor = Colors.phase[currentPhase]; // { bg, accent }
```

---

## Icon System

- 98+ SVG icon components under `components/icons/`
- Import by name: `import { MoonIcon } from '@/components/icons/MoonIcon'`
- Standard size: `IconSize.md` (20) for inline, `IconSize.lg` (24) for standalone
- Stroke weight: 1.5px consistent across set

---

## Navigation / Layout

- Tab bar: `app/(tabs)/_layout.tsx` — 4 tabs (Cycle | Oracle | Community | Profile) + FAB cutout
- FAB: `components/FAB.tsx` — bottom-center, terra, haptic press, routes to `/log-cards`
- Stack transitions: slide-up for modals, fade for tabs
- Safe area insets: always account for iOS bottom inset + debugger banner (`moonflow-ios-debugger-banner-tab-bar` policy)

---

## Figma Reference

File key: `fpkOz8VuhR80oc8mp0Tov3`
URL: https://www.figma.com/design/fpkOz8VuhR80oc8mp0Tov3/Moonflow
Local dump: `companies/moonflow/data/figma/file-full.json`
Screen renders: `companies/moonflow/data/figma/screens/`

---

## Quality Gates

```bash
bun tsc --noEmit          # 0 errors required
bun lint                  # ≤ 55 issues (6 errors, 49 warnings) baseline
```

No new `@ts-ignore` or `eslint-disable` additions.
