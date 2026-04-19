"use client";

import type { CSSProperties } from "react";

export interface CrtVignetteProps {
  /**
   * Vignette intensity in [0, 1]. Controls the alpha of the outer fade.
   * Default: 0.7.
   */
  intensity?: number;
  /**
   * Vignette inner stop as a percentage of the radius. Smaller values
   * pull the darkening closer to the center. Default: 40.
   */
  innerStop?: number;
  /** Optional className passthrough. */
  className?: string;
  /** Optional inline style passthrough. */
  style?: CSSProperties;
  /** Container positioning. Default: fixed. */
  position?: "fixed" | "absolute";
}

/**
 * CrtVignette
 * A deep-navy radial edge fade. The name is historical — the primitive
 * intentionally renders NO CRT grain, NO scanlines, and NO analog noise.
 * It is strictly a radial vignette that sinks the viewport edges into the
 * `--bg-navy-900` void.
 *
 * Reduced-motion: no motion by design — no keyframes, no transitions.
 * The static render IS the hard-cut fallback (satisfies AC #11). Any future
 * revision that adds motion MUST honor @media (prefers-reduced-motion:
 * reduce) at the CSS level and `usePrefersReducedMotion()` at the JS level.
 */
export function CrtVignette(props: CrtVignetteProps) {
  const {
    intensity = 0.7,
    innerStop = 40,
    className,
    style,
    position = "fixed",
  } = props;

  const clampedIntensity = Math.min(1, Math.max(0, intensity));
  const clampedInnerStop = Math.min(95, Math.max(0, innerStop));

  const vignetteStyle: CSSProperties = {
    position,
    inset: 0,
    pointerEvents: "none",
    // zIndex 1 so it sits above the beam but below content layers.
    zIndex: 1,
    // Radial gradient: transparent center → deep-navy void at the edge.
    backgroundImage: `radial-gradient(ellipse at center, transparent ${clampedInnerStop}%, var(--bg-navy-900) 100%)`,
    // Second pass bakes a subtle inner lift using navy-500 so the vignette
    // doesn't feel like a flat black mask — keeps the scene cinematic.
    backgroundColor: "transparent",
    opacity: clampedIntensity,
    ...style,
  };

  return (
    <div
      aria-hidden="true"
      className={className}
      data-vignette-inner-stop={clampedInnerStop}
      style={vignetteStyle}
    />
  );
}

export default CrtVignette;
