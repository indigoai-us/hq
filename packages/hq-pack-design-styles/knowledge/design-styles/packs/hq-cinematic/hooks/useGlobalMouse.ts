"use client";

import { useEffect, useRef, useState } from "react";

export interface GlobalMouseState {
  /** Normalized X in [0, 1] across the viewport. */
  x: number;
  /** Normalized Y in [0, 1] across the viewport. */
  y: number;
  /** Raw client X in px. */
  clientX: number;
  /** Raw client Y in px. */
  clientY: number;
}

export interface UseGlobalMouseOptions {
  /**
   * If true, the hook does not attach listeners and returns a frozen
   * centered state. Useful for `prefers-reduced-motion` paths.
   */
  disabled?: boolean;
  /**
   * Throttle to ~60fps via requestAnimationFrame. Default: true.
   */
  throttle?: boolean;
}

const INITIAL: GlobalMouseState = {
  x: 0.5,
  y: 0.5,
  clientX: 0,
  clientY: 0,
};

/**
 * useGlobalMouse
 * Tracks the pointer across the viewport, returning normalized [0,1] coords
 * plus raw client coords. RAF-throttled by default so subscribers render
 * at most once per frame.
 *
 * SSR-safe: first paint returns a centered state; no listeners are attached
 * on the server.
 */
export function useGlobalMouse(
  options: UseGlobalMouseOptions = {},
): GlobalMouseState {
  const { disabled = false, throttle = true } = options;
  const [state, setState] = useState<GlobalMouseState>(INITIAL);
  const frameRef = useRef<number | null>(null);
  const pendingRef = useRef<GlobalMouseState | null>(null);

  useEffect(() => {
    if (disabled) return;
    if (typeof window === "undefined") return;

    const flush = () => {
      frameRef.current = null;
      if (pendingRef.current) {
        setState(pendingRef.current);
        pendingRef.current = null;
      }
    };

    const handlePointer = (event: PointerEvent | MouseEvent) => {
      const w = window.innerWidth || 1;
      const h = window.innerHeight || 1;
      const next: GlobalMouseState = {
        x: Math.min(1, Math.max(0, event.clientX / w)),
        y: Math.min(1, Math.max(0, event.clientY / h)),
        clientX: event.clientX,
        clientY: event.clientY,
      };

      if (!throttle) {
        setState(next);
        return;
      }

      pendingRef.current = next;
      if (frameRef.current === null) {
        frameRef.current = window.requestAnimationFrame(flush);
      }
    };

    window.addEventListener("pointermove", handlePointer, { passive: true });
    window.addEventListener("mousemove", handlePointer, { passive: true });

    return () => {
      window.removeEventListener("pointermove", handlePointer);
      window.removeEventListener("mousemove", handlePointer);
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      pendingRef.current = null;
    };
  }, [disabled, throttle]);

  return state;
}

export default useGlobalMouse;
