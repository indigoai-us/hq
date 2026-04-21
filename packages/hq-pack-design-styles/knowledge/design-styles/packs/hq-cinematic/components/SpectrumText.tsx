"use client";

import { useEffect, useState } from "react";
import type { CSSProperties, ElementType, ReactNode } from "react";
import { usePrefersReducedMotion } from "../hooks/usePrefersReducedMotion";

export interface SpectrumTextProps {
  /** Text content (string or inline ReactNode). */
  children: ReactNode;
  /**
   * If true, plays a one-shot dispersion reveal on mount (spectrum-dispersion
   * keyframe). If false, renders a static gradient fill. Default: false.
   */
  dispersionReveal?: boolean;
  /**
   * Dispersion duration in ms. Falls back to the pack default bloom token.
   */
  revealDurationMs?: number;
  /**
   * Element to render as. Default: "span".
   */
  as?: ElementType;
  /** Optional className passthrough. */
  className?: string;
  /** Optional inline style passthrough. */
  style?: CSSProperties;
}

/**
 * SpectrumText
 * Fills text with `--gradient-spectrum-linear` via background-clip. Supports
 * an optional one-shot dispersion-reveal on mount using the
 * `spectrum-dispersion` keyframe from the pack.
 *
 * Reduced-motion: dispersionReveal is ignored and the text renders as a
 * static spectrum gradient fill with no animation.
 */
export function SpectrumText(props: SpectrumTextProps) {
  const {
    children,
    dispersionReveal = false,
    revealDurationMs,
    as = "span",
    className,
    style,
  } = props;

  const reduced = usePrefersReducedMotion();
  const Tag = as as ElementType;

  // Track mount so we can apply the reveal animation exactly once.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const shouldAnimate = dispersionReveal && !reduced && mounted;

  const textStyle: CSSProperties = {
    backgroundImage: "var(--gradient-spectrum-linear)",
    backgroundSize: "200% 100%",
    backgroundPosition: "0% 50%",
    WebkitBackgroundClip: "text",
    backgroundClip: "text",
    color: "transparent",
    WebkitTextFillColor: "transparent",
    // Solid-color fallback (for browsers without background-clip: text
    // support) is applied via CSS in keyframes.css using @supports not.
    // That keeps the component free of non-standard inline style props
    // (React rejects `text-fill-color`; we only ship the -webkit- prefix).
    display: "inline-block",
    fontFamily: "var(--font-display)",
    fontWeight: "var(--font-display-weight-black, 900)",
    animation: shouldAnimate
      ? `spectrum-dispersion ${revealDurationMs ?? 900}ms var(--motion-ease-cinematic) both`
      : undefined,
    ...style,
  };

  return (
    <Tag
      className={className}
      data-spectrum-reveal={shouldAnimate ? "true" : "false"}
      data-prefers-reduced-motion={reduced ? "reduce" : "no-preference"}
      style={textStyle}
    >
      {children}
    </Tag>
  );
}

export default SpectrumText;
