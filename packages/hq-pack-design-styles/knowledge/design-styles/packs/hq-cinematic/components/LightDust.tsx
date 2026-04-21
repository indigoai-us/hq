"use client";

import { useEffect, useRef } from "react";
import type { CSSProperties } from "react";
import { usePrefersReducedMotion } from "../hooks/usePrefersReducedMotion";

export interface LightDustProps {
  /** Particle count. Default: 60. Auto-halved on low-DPR devices. */
  count?: number;
  /** Beam tilt angle in degrees — must mirror PrismBeam `angle`. Default: -18. */
  beamAngle?: number;
  /** Beam width in vw — must mirror PrismBeam `width`. Default: 22. */
  beamWidth?: number;
  /** Base particle opacity in [0, 1]. Default: 0.55. */
  opacity?: number;
  /** Optional className passthrough. */
  className?: string;
  /** Optional inline style passthrough. */
  style?: CSSProperties;
  /** Container positioning. Default: fixed. */
  position?: "fixed" | "absolute";
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  life: number;
  maxLife: number;
  hueIndex: number;
}

const SPECTRUM_FALLBACKS = [
  "rgba(125, 227, 244, 0.9)", // cyan
  "rgba(139, 109, 240, 0.9)", // violet
  "rgba(229, 106, 179, 0.9)", // magenta
  "rgba(242, 138, 75, 0.9)", // orange
  "rgba(232, 199, 122, 0.9)", // gold
];

/**
 * LightDust
 * Canvas particle layer whose spawn region is clipped to the PrismBeam band.
 * Particles drift upward along the beam axis, sampling spectrum hues, and
 * illuminate only where the beam intersects — off-axis pixels stay dark.
 *
 * Hard-cut under `prefers-reduced-motion: reduce`: the canvas renders an
 * empty transparent layer and no RAF loop is scheduled.
 */
export function LightDust(props: LightDustProps) {
  const {
    count = 60,
    beamAngle = -18,
    beamWidth = 22,
    opacity = 0.55,
    className,
    style,
    position = "fixed",
  } = props;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    // Reduced motion → render a static, empty layer. No RAF, no spawns.
    if (reduced) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let dpr = 1;

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    // Halve particle count on low-DPR / small viewports for perf budget.
    const effectiveCount =
      width < 640 || dpr < 1.5 ? Math.max(16, Math.floor(count / 2)) : count;

    const angleRad = (beamAngle * Math.PI) / 180;
    const cos = Math.cos(angleRad);
    const sin = Math.sin(angleRad);

    // Beam region in px: a band of width `beamWidth` vw, rotated by angleRad.
    // For intersection test, project each point onto the beam-normal axis
    // and check distance from the beam's center line.
    const beamPxWidth = (beamWidth / 100) * width;
    const beamHalfWidth = beamPxWidth / 2;

    const isInBeam = (px: number, py: number): boolean => {
      // Translate to viewport center.
      const cx = width / 2;
      const cy = height / 2;
      const dx = px - cx;
      const dy = py - cy;
      // Distance from the beam axis (rotated by angleRad).
      const normalDist = Math.abs(dx * -sin + dy * cos);
      return normalDist <= beamHalfWidth;
    };

    const spawn = (): Particle => {
      // Pick a point along the beam axis from bottom to top.
      const axisT = Math.random(); // 0 = bottom, 1 = top
      const beamOffset = (Math.random() - 0.5) * beamHalfWidth * 1.6;
      const cx = width / 2;
      const cy = height / 2;
      // Move along beam axis (vertical in rotated frame).
      const axisX = sin * beamHalfWidth * 0 + cos * 0; // 0 — axis is (cos, sin) normal direction
      void axisX;
      // In unrotated frame: axis direction is (cos(angle+90°), sin(angle+90°))
      // which simplifies to (-sin, cos). Start off-screen bottom, drift up.
      const along = (axisT - 0.5) * height * 1.4;
      const across = beamOffset;
      const x = cx + cos * across + -sin * along;
      const y = cy + sin * across + cos * along;
      const maxLife = 4000 + Math.random() * 6000;
      return {
        x,
        y,
        // Drift along beam axis (upward in unrotated frame → -sin, +cos direction
        // rotated; we want the "up" direction which is roughly (sin, -cos)).
        vx: sin * (0.15 + Math.random() * 0.25),
        vy: -cos * (0.15 + Math.random() * 0.25),
        size: 0.7 + Math.random() * 1.6,
        life: 0,
        maxLife,
        hueIndex: Math.floor(Math.random() * SPECTRUM_FALLBACKS.length),
      };
    };

    const particles: Particle[] = Array.from(
      { length: effectiveCount },
      spawn,
    );

    let lastT = performance.now();

    const frame = (t: number) => {
      const dt = Math.min(64, t - lastT);
      lastT = t;

      ctx.clearRect(0, 0, width, height);
      ctx.globalCompositeOperation = "screen";

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.life += dt;
        if (p.life >= p.maxLife) {
          particles[i] = spawn();
          continue;
        }
        p.x += p.vx * (dt * 0.06);
        p.y += p.vy * (dt * 0.06);

        // Gate illumination to the beam region.
        if (!isInBeam(p.x, p.y)) {
          continue;
        }

        const lifeT = p.life / p.maxLife;
        // Triangle envelope: fade in, hold, fade out.
        const envelope =
          lifeT < 0.15
            ? lifeT / 0.15
            : lifeT > 0.85
              ? (1 - lifeT) / 0.15
              : 1;
        const alpha = opacity * envelope;
        const hue = SPECTRUM_FALLBACKS[p.hueIndex];
        ctx.fillStyle = hue.replace(/0\.9\)$/, `${alpha.toFixed(3)})`);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }

      rafRef.current = window.requestAnimationFrame(frame);
    };

    rafRef.current = window.requestAnimationFrame(frame);

    const onResize = () => resize();
    window.addEventListener("resize", onResize, { passive: true });

    return () => {
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      window.removeEventListener("resize", onResize);
    };
  }, [beamAngle, beamWidth, count, opacity, reduced]);

  const containerStyle: CSSProperties = {
    position,
    inset: 0,
    pointerEvents: "none",
    zIndex: 0,
    ...style,
  };

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={className}
      data-prefers-reduced-motion={reduced ? "reduce" : "no-preference"}
      style={containerStyle}
    />
  );
}

export default LightDust;
