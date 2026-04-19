"use client";

import { useEffect, useState } from "react";

/**
 * usePrefersReducedMotion
 * Listens to the `(prefers-reduced-motion: reduce)` media query and returns
 * a boolean. SSR-safe — returns `false` on the server and during the first
 * client render, then hydrates with the real value.
 *
 * Consumers must gate JS-driven motion (timers, RAF loops, Canvas, WebGL)
 * with this hook. CSS-level motion is already handled by the hard-cut
 * overrides in `keyframes.css`.
 */
export function usePrefersReducedMotion(): boolean {
  const [prefersReduced, setPrefersReduced] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;

    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    // Initial sync with the current media state.
    setPrefersReduced(mql.matches);

    const onChange = (event: MediaQueryListEvent) => {
      setPrefersReduced(event.matches);
    };

    // Prefer the modern API, fall back to the legacy `addListener` for
    // Safari < 14 compatibility.
    if (typeof mql.addEventListener === "function") {
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    }
    const legacy = mql as MediaQueryList & {
      addListener?: (listener: (e: MediaQueryListEvent) => void) => void;
      removeListener?: (listener: (e: MediaQueryListEvent) => void) => void;
    };
    legacy.addListener?.(onChange);
    return () => {
      legacy.removeListener?.(onChange);
    };
  }, []);

  return prefersReduced;
}

export default usePrefersReducedMotion;
