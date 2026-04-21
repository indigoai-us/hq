"use client";

import type { CSSProperties } from "react";
import { usePrefersReducedMotion } from "../hooks/usePrefersReducedMotion";

export interface PrismBeamProps {
  /** Beam tilt in degrees. 0 = horizontal. Default: -18. */
  angle?: number;
  /** Beam thickness in viewport-width units (vw). Default: 22. */
  width?: number;
  /** Drift loop duration in ms. Falls back to --motion-duration-drift. */
  speed?: number;
  /** Peak opacity in [0, 1]. Default: 0.65. */
  opacity?: number;
  /** Optional className passthrough. */
  className?: string;
  /** Optional inline style passthrough. Merged over defaults. */
  style?: CSSProperties;
  /**
   * Absolute container positioning. Primitive defaults to fixed full-bleed
   * so it can sit behind the app shell. Set to "absolute" to scope it to a
   * positioned parent instead.
   */
  position?: "fixed" | "absolute";
  /**
   * Optional id for the beam region — consumers (e.g. LightDust) can read
   * this via data-beam-id to intersect with the beam.
   */
  beamId?: string;
}

/**
 * PrismBeam
 * A volumetric spectrum streak rendered via a gradient band + stacked
 * box-shadow bloom. Uses `mix-blend-mode: screen` so it layers additively
 * over the navy ground.
 *
 * Under `prefers-reduced-motion: reduce` the beam renders as a static
 * gradient at mid-opacity — no drift, no keyframes. CSS-level hard-cuts in
 * `keyframes.css` cover the case where JS state is not available (SSR).
 */
export function PrismBeam(props: PrismBeamProps) {
  const {
    angle = -18,
    width = 22,
    speed,
    opacity = 0.65,
    className,
    style,
    position = "fixed",
    beamId = "prism-beam",
  } = props;

  const reduced = usePrefersReducedMotion();

  // Compose base style. The drift animation reads its duration from the
  // `--motion-duration-drift` token unless `speed` is explicitly passed.
  const durationMs = typeof speed === "number" ? `${speed}ms` : undefined;

  const containerStyle: CSSProperties = {
    position,
    inset: 0,
    pointerEvents: "none",
    overflow: "hidden",
    // Stay below UI (step-wizard content) but above page background.
    zIndex: 0,
    ...style,
  };

  // The beam itself is a rotated band. `mix-blend-mode: screen` provides
  // additive blending; stacked box-shadow provides the bloom halo without
  // needing a blur filter (cheaper on low-end GPUs).
  const beamStyle: CSSProperties = {
    position: "absolute",
    top: "-20%",
    left: "-20%",
    width: `${width}vw`,
    height: "140%",
    transform: `rotate(${angle}deg)`,
    transformOrigin: "center",
    backgroundImage: "var(--gradient-spectrum-linear)",
    backgroundSize: "200% 100%",
    backgroundRepeat: "no-repeat",
    mixBlendMode: "screen",
    opacity: reduced ? Math.min(opacity, 0.45) : opacity,
    // Stacked bloom — three concentric shadows fan out the spectrum glow.
    boxShadow: [
      "0 0 40px 8px rgba(125, 227, 244, 0.25)",
      "0 0 120px 32px rgba(139, 109, 240, 0.22)",
      "0 0 240px 80px rgba(229, 106, 179, 0.16)",
    ].join(", "),
    // Drift animation — hard-cut to end state when reduced motion is on.
    animation: reduced
      ? "none"
      : `beam-drift ${durationMs ?? "var(--motion-duration-drift)"} var(--motion-ease-drift) infinite alternate`,
    willChange: reduced ? undefined : "transform, opacity",
  };

  return (
    <div
      aria-hidden="true"
      className={className}
      data-beam-id={beamId}
      data-prefers-reduced-motion={reduced ? "reduce" : "no-preference"}
      style={containerStyle}
    >
      <div style={beamStyle} />
    </div>
  );
}

export default PrismBeam;
