/**
 * hq-cinematic — primitive + hook barrel
 *
 * Consumer apps import from this barrel (or re-export it via their own
 * `components/effects/index.ts` — see Story 3 integration shell).
 *
 * Every primitive is tree-shakeable and ships a hard-cut fallback under
 * `prefers-reduced-motion: reduce`. See `keyframes.css` for CSS-level
 * overrides and `hooks/usePrefersReducedMotion.ts` for JS-level gating.
 */

export { PrismBeam } from "./components/PrismBeam";
export type { PrismBeamProps } from "./components/PrismBeam";

export { LightDust } from "./components/LightDust";
export type { LightDustProps } from "./components/LightDust";

export { CrtVignette } from "./components/CrtVignette";
export type { CrtVignetteProps } from "./components/CrtVignette";

export { CornerBrackets } from "./components/CornerBrackets";
export type { CornerBracketsProps } from "./components/CornerBrackets";

export { SpectrumText } from "./components/SpectrumText";
export type { SpectrumTextProps } from "./components/SpectrumText";

export { PrismReveal } from "./components/PrismReveal";
export type { PrismRevealProps } from "./components/PrismReveal";

export { PhaseMachine } from "./components/PhaseMachine";
export type {
  PhaseMachineProps,
  PhaseSpec,
  PhaseStatus,
} from "./components/PhaseMachine";

export { WebGLStage } from "./components/WebGLStage";
export type { WebGLStageProps } from "./components/WebGLStage";

export { usePrefersReducedMotion } from "./hooks/usePrefersReducedMotion";
export { useGlobalMouse } from "./hooks/useGlobalMouse";
export type {
  GlobalMouseState,
  UseGlobalMouseOptions,
} from "./hooks/useGlobalMouse";
