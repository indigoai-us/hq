"use client";

import { useEffect, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { usePrefersReducedMotion } from "../hooks/usePrefersReducedMotion";

export interface PrismRevealProps {
  /** Child content to reveal after the beam sweeps across. */
  children: ReactNode;
  /**
   * Sweep duration in ms. Falls back to the pack's sweep token
   * (--motion-duration-sweep, ~1400ms).
   */
  durationMs?: number;
  /**
   * Delay before the sweep starts, in ms. Default: 0.
   */
  delayMs?: number;
  /**
   * If true, wrap the reveal in a bordered frame so the sweep reads as a
   * hairline travel. Default: false (children's own styling applies).
   */
  bordered?: boolean;
  /** Optional className passthrough. */
  className?: string;
  /** Optional inline style passthrough. */
  style?: CSSProperties;
  /** Fires when the reveal completes (or instantly under reduced motion). */
  onComplete?: () => void;
}

/**
 * PrismReveal
 * Wraps children and plays a `prism-sweep` beam across the surface before
 * the content fades in. Under reduced motion, children render instantly
 * with no sweep overlay.
 *
 * Usage:
 *   <PrismReveal><SpectrumText>HQ</SpectrumText></PrismReveal>
 */
export function PrismReveal(props: PrismRevealProps) {
  const {
    children,
    durationMs,
    delayMs = 0,
    bordered = false,
    className,
    style,
    onComplete,
  } = props;

  const reduced = usePrefersReducedMotion();
  const [revealed, setRevealed] = useState<boolean>(reduced);

  useEffect(() => {
    if (reduced) {
      setRevealed(true);
      onComplete?.();
      return;
    }

    const effectiveDuration = durationMs ?? 1400;
    const timer = window.setTimeout(() => {
      setRevealed(true);
      onComplete?.();
    }, delayMs + effectiveDuration);
    return () => window.clearTimeout(timer);
  }, [delayMs, durationMs, onComplete, reduced]);

  const containerStyle: CSSProperties = {
    position: "relative",
    display: "inline-block",
    border: bordered ? "1px solid var(--warm-pink-40, #443039)" : undefined,
    ...style,
  };

  const sweepStyle: CSSProperties = {
    position: "absolute",
    inset: 0,
    pointerEvents: "none",
    backgroundImage: "var(--gradient-spectrum-linear)",
    backgroundSize: "200% 100%",
    mixBlendMode: "screen",
    opacity: 0,
    animation: reduced
      ? "none"
      : `prism-sweep ${durationMs ?? "var(--motion-duration-sweep)"} var(--motion-ease-cinematic) ${delayMs}ms both`,
    willChange: reduced ? undefined : "background-position, opacity",
  };

  const contentStyle: CSSProperties = {
    opacity: revealed || reduced ? 1 : 0,
    transition: reduced
      ? "none"
      : "opacity 240ms var(--motion-ease-cinematic)",
    transitionDelay: reduced ? undefined : `${delayMs + (durationMs ?? 1400) * 0.6}ms`,
  };

  return (
    <span
      aria-hidden={revealed ? undefined : "true"}
      className={className}
      data-prism-reveal={revealed ? "done" : "pending"}
      data-prefers-reduced-motion={reduced ? "reduce" : "no-preference"}
      style={containerStyle}
    >
      <span style={sweepStyle} />
      <span style={contentStyle}>{children}</span>
    </span>
  );
}

export default PrismReveal;
