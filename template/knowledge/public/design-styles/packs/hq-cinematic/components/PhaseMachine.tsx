"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { usePrefersReducedMotion } from "../hooks/usePrefersReducedMotion";

export interface PhaseSpec {
  /** Stable id for the phase (used as React key). */
  id: string;
  /** Human-readable label rendered next to the bar. */
  label: string;
  /** Optional per-phase duration in ms when the machine auto-advances. */
  durationMs?: number;
  /** Optional trailing ReactNode (e.g. status icon). */
  trailing?: ReactNode;
}

export type PhaseStatus = "pending" | "active" | "done" | "error";

export interface PhaseMachineProps {
  /** Ordered list of phases to render. */
  phases: PhaseSpec[];
  /**
   * Controlled active index. When provided, the machine does NOT auto-advance
   * — the parent drives progress via real events (see step-11 provision).
   */
  activeIndex?: number;
  /**
   * If true, the machine auto-advances through phases using each phase's
   * durationMs (default 900ms). Useful for demos and for the
   * empire-institute BootOverlay parity case.
   */
  autoAdvance?: boolean;
  /** Default per-phase duration when durationMs is missing. Default 900ms. */
  defaultPhaseMs?: number;
  /** Called when the final phase completes. */
  onComplete?: () => void;
  /** If set, renders an explicit error state on the given phase index. */
  errorIndex?: number;
  /** Optional className passthrough. */
  className?: string;
  /** Optional inline style passthrough. */
  style?: CSSProperties;
}

/**
 * PhaseMachine
 * Orchestrates a sequence of phases, rendering each as a spectrum-gradient
 * bar that fills left-to-right. Ports the BootOverlay pattern from
 * empire-institute (a phase timeline driven by setTimeout chains) into a
 * self-contained component — no import from empire-institute.
 *
 * Two modes:
 *   - Controlled: pass `activeIndex` from the parent and update it as real
 *     events arrive. The machine does not advance on its own.
 *   - Auto-advance: set `autoAdvance` and the machine walks phases in order
 *     using each phase's `durationMs`.
 *
 * Reduced-motion: bars still fill but with zero transition duration — the
 * machine snaps between states rather than animating.
 */
export function PhaseMachine(props: PhaseMachineProps) {
  const {
    phases,
    activeIndex,
    autoAdvance = false,
    defaultPhaseMs = 900,
    onComplete,
    errorIndex,
    className,
    style,
  } = props;

  const reduced = usePrefersReducedMotion();
  const [internalIndex, setInternalIndex] = useState<number>(0);
  const completedRef = useRef<boolean>(false);

  // Determine effective active index (controlled vs. auto).
  const effectiveIndex =
    typeof activeIndex === "number" ? activeIndex : internalIndex;

  // Auto-advance timer chain.
  useEffect(() => {
    if (!autoAdvance) return;
    if (typeof activeIndex === "number") return; // controlled — skip auto.

    const timers: ReturnType<typeof setTimeout>[] = [];
    let cursor = 0;
    const step = () => {
      if (cursor >= phases.length) {
        if (!completedRef.current) {
          completedRef.current = true;
          onComplete?.();
        }
        return;
      }
      setInternalIndex(cursor);
      const phaseDuration = phases[cursor]?.durationMs ?? defaultPhaseMs;
      timers.push(
        setTimeout(() => {
          cursor += 1;
          step();
        }, reduced ? 0 : phaseDuration),
      );
    };
    step();

    return () => {
      timers.forEach(clearTimeout);
    };
  }, [activeIndex, autoAdvance, defaultPhaseMs, onComplete, phases, reduced]);

  // Fire onComplete in controlled mode when activeIndex crosses the end.
  useEffect(() => {
    if (typeof activeIndex !== "number") return;
    if (activeIndex >= phases.length - 1 && !completedRef.current) {
      completedRef.current = true;
      onComplete?.();
    }
  }, [activeIndex, onComplete, phases.length]);

  const statusFor = useMemo(() => {
    return (i: number): PhaseStatus => {
      if (typeof errorIndex === "number" && i === errorIndex) return "error";
      if (i < effectiveIndex) return "done";
      if (i === effectiveIndex) return "active";
      return "pending";
    };
  }, [effectiveIndex, errorIndex]);

  const containerStyle: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    fontFamily: "var(--font-display)",
    color: "var(--warm-yellow-80, #BDA067)",
    ...style,
  };

  return (
    <ol
      className={className}
      data-phase-count={phases.length}
      data-active-index={effectiveIndex}
      data-prefers-reduced-motion={reduced ? "reduce" : "no-preference"}
      style={containerStyle}
    >
      {phases.map((p, i) => {
        const status = statusFor(i);
        // Active phases hold a full-width spectrum band and run a left→right
        // scan (prism-sweep moving the background-position across). Completed
        // phases hold the same full band statically. Pending = invisible.
        // Error = full width warm-pink band.
        const fill =
          status === "done" || status === "active" || status === "error" ? 100 : 0;
        const barFillStyle: CSSProperties = {
          position: "absolute",
          top: 0,
          left: 0,
          bottom: 0,
          width: `${fill}%`,
          backgroundImage:
            status === "error"
              ? "linear-gradient(90deg, var(--warm-pink, #A97791), var(--warm-pink-80, #916678))"
              : "var(--gradient-spectrum-linear)",
          backgroundSize: "200% 100%",
          transition: reduced ? "none" : "width 420ms var(--motion-ease-cinematic)",
          animation:
            status === "active" && !reduced
              ? "prism-sweep 1800ms var(--motion-ease-cinematic) infinite"
              : undefined,
          opacity: status === "pending" ? 0 : 1,
        };
        const rowStyle: CSSProperties = {
          display: "grid",
          gridTemplateColumns: "1fr auto",
          alignItems: "center",
          gap: 16,
          padding: "6px 0",
        };
        const trackStyle: CSSProperties = {
          position: "relative",
          height: 6,
          borderRadius: 3,
          backgroundColor: "var(--bg-navy-300, #091026)",
          overflow: "hidden",
        };
        const labelStyle: CSSProperties = {
          display: "flex",
          justifyContent: "space-between",
          fontSize: 13,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color:
            status === "error"
              ? "var(--warm-pink, #A97791)"
              : status === "done"
                ? "var(--warm-yellow-80, #BDA067)"
                : "var(--warm-yellow-60, #8C744E)",
        };
        return (
          <li key={p.id} style={rowStyle} data-phase-status={status} data-phase-id={p.id}>
            <div>
              <div style={labelStyle}>
                <span>{p.label}</span>
                <span aria-hidden="true">
                  {status === "done" ? "✓" : status === "error" ? "!" : status === "active" ? "…" : "·"}
                </span>
              </div>
              <div style={trackStyle}>
                <span style={barFillStyle} />
              </div>
            </div>
            <div>{p.trailing}</div>
          </li>
        );
      })}
    </ol>
  );
}

export default PhaseMachine;
