"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import type { CSSProperties, ComponentType, ReactNode } from "react";
import { usePrefersReducedMotion } from "../hooks/usePrefersReducedMotion";

/**
 * The host app is responsible for loading its own three/r3f scenes via
 * `next/dynamic(..., { ssr: false })` and passing the resulting component
 * as `SceneComponent`. WebGLStage intentionally does NOT import three or
 * @react-three/* so it stays tree-shakeable for steps that don't need WebGL.
 */

export interface WebGLStageProps {
  /**
   * The dynamically-imported scene component. Must be client-only. Host apps
   * wire this via next/dynamic(() => import("..."), { ssr: false }).
   * When null, the stage renders only the static poster.
   */
  SceneComponent?: ComponentType<Record<string, unknown>> | null;
  /**
   * Props forwarded to the scene component.
   */
  sceneProps?: Record<string, unknown>;
  /**
   * Static poster rendered under reduced motion or while the scene is
   * loading. Host apps typically pass an <Image/> or a CSS gradient node.
   */
  poster?: ReactNode;
  /**
   * Crossfade duration in ms when switching scenes. Default 1200.
   */
  crossfadeMs?: number;
  /**
   * Optional key to force a crossfade — pass the scene id so parents can
   * swap scenes deterministically.
   */
  sceneKey?: string;
  /** Optional className passthrough. */
  className?: string;
  /** Optional inline style passthrough. */
  style?: CSSProperties;
  /** Container positioning. Default: fixed full-bleed behind UI. */
  position?: "fixed" | "absolute";
}

/**
 * WebGLStage
 * Hosts a lazy-loaded 3D scene with a crossfade between scene swaps. Under
 * `prefers-reduced-motion: reduce`, the stage hard-cuts to the static
 * poster and does NOT mount the scene — this prevents r3f from booting its
 * render loop at all.
 *
 * Contract:
 *   - The host passes a `next/dynamic`-loaded component as SceneComponent.
 *   - The stage wraps it in React.Suspense; poster is the Suspense fallback.
 *   - Scene swaps animate opacity over `crossfadeMs`.
 */
export function WebGLStage(props: WebGLStageProps) {
  const {
    SceneComponent,
    sceneProps,
    poster,
    crossfadeMs = 1200,
    sceneKey,
    className,
    style,
    position = "fixed",
  } = props;

  const reduced = usePrefersReducedMotion();
  const [visibleKey, setVisibleKey] = useState<string | undefined>(sceneKey);
  const [sceneOpacity, setSceneOpacity] = useState<number>(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Drive crossfade when sceneKey changes.
  useEffect(() => {
    if (reduced) {
      setSceneOpacity(0);
      setVisibleKey(sceneKey);
      return;
    }
    if (!SceneComponent) {
      setSceneOpacity(0);
      return;
    }
    // Fade out current, swap key, fade in new.
    setSceneOpacity(0);
    timerRef.current = setTimeout(() => {
      setVisibleKey(sceneKey);
      // Next tick: fade in.
      timerRef.current = setTimeout(() => setSceneOpacity(1), 20);
    }, Math.min(200, crossfadeMs * 0.2));

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [SceneComponent, crossfadeMs, reduced, sceneKey]);

  const containerStyle: CSSProperties = {
    position,
    inset: 0,
    pointerEvents: "none",
    overflow: "hidden",
    zIndex: 0,
    ...style,
  };

  const posterStyle: CSSProperties = {
    position: "absolute",
    inset: 0,
    opacity: reduced ? 1 : sceneOpacity === 1 ? 0 : 1,
    transition: reduced ? "none" : `opacity ${crossfadeMs}ms var(--motion-ease-cinematic)`,
  };

  const sceneStyle: CSSProperties = {
    position: "absolute",
    inset: 0,
    opacity: reduced ? 0 : sceneOpacity,
    transition: reduced ? "none" : `opacity ${crossfadeMs}ms var(--motion-ease-cinematic)`,
  };

  return (
    <div
      aria-hidden="true"
      className={className}
      data-webgl-stage-key={visibleKey ?? ""}
      data-prefers-reduced-motion={reduced ? "reduce" : "no-preference"}
      style={containerStyle}
    >
      <div style={posterStyle}>{poster}</div>
      {!reduced && SceneComponent ? (
        <Suspense fallback={null}>
          <div style={sceneStyle} key={visibleKey}>
            <SceneComponent {...(sceneProps ?? {})} />
          </div>
        </Suspense>
      ) : null}
    </div>
  );
}

export default WebGLStage;
