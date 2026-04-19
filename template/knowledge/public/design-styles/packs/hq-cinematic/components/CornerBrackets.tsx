"use client";

import type { CSSProperties } from "react";

export interface CornerBracketsProps {
  /** Bracket arm length in px. Default: 20. */
  size?: number;
  /** Bracket stroke width in px. Default: 1. */
  thickness?: number;
  /** Inset from container edges in px. Default: 14. */
  inset?: number;
  /**
   * Override color. Defaults to --warm-pink @ 40% tint (#A97791-40).
   * Do NOT use cyan or spectrum colors here — brackets are a warm-neutral
   * framing device.
   */
  color?: string;
  /** Optional className passthrough. */
  className?: string;
  /** Optional inline style passthrough. */
  style?: CSSProperties;
  /** Container positioning. Default: absolute (scoped to parent frame). */
  position?: "absolute" | "fixed";
}

/**
 * CornerBrackets
 * Four hairline L-shaped corner markers rendered via border segments on
 * absolutely-positioned child nodes. Warm-neutral only — pink @ 40% is the
 * default per pack palette.
 *
 * Reduced-motion: this primitive has NO motion by design — no keyframes,
 * no transitions, no RAF. The static render IS the reduced-motion fallback;
 * there is nothing to hard-cut. This satisfies AC #11 (every primitive has
 * a hard-cut fallback path) by being static-only from the start. If a
 * future revision adds a shimmer, it MUST gate on
 * @media (prefers-reduced-motion: reduce).
 */
export function CornerBrackets(props: CornerBracketsProps) {
  const {
    size = 20,
    thickness = 1,
    inset = 14,
    color = "var(--warm-pink-40, #443039)",
    className,
    style,
    position = "absolute",
  } = props;

  const containerStyle: CSSProperties = {
    position,
    inset: 0,
    pointerEvents: "none",
    zIndex: 2,
    ...style,
  };

  const baseArm: CSSProperties = {
    position: "absolute",
    width: size,
    height: size,
    borderColor: color,
    borderStyle: "solid",
    borderWidth: 0,
  };

  const topLeft: CSSProperties = {
    ...baseArm,
    top: inset,
    left: inset,
    borderTopWidth: thickness,
    borderLeftWidth: thickness,
  };

  const topRight: CSSProperties = {
    ...baseArm,
    top: inset,
    right: inset,
    borderTopWidth: thickness,
    borderRightWidth: thickness,
  };

  const bottomLeft: CSSProperties = {
    ...baseArm,
    bottom: inset,
    left: inset,
    borderBottomWidth: thickness,
    borderLeftWidth: thickness,
  };

  const bottomRight: CSSProperties = {
    ...baseArm,
    bottom: inset,
    right: inset,
    borderBottomWidth: thickness,
    borderRightWidth: thickness,
  };

  return (
    <div
      aria-hidden="true"
      className={className}
      data-bracket-color={color}
      style={containerStyle}
    >
      <span style={topLeft} />
      <span style={topRight} />
      <span style={bottomLeft} />
      <span style={bottomRight} />
    </div>
  );
}

export default CornerBrackets;
