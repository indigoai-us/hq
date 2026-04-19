/**
 * Reduced-motion contract tests for hq-cinematic primitives.
 *
 * NOTE: This spec lives inside the knowledge-design-styles pack but is
 * designed to run inside the consumer (hq-onboarding) context once Story 3
 * wires the pack into the app. The pack itself has no build system, so
 * `vitest` is not installed here. Copying this spec into hq-onboarding's
 * test dir (or using @testing-library/react from any consumer with jsdom +
 * vitest) will run the assertions unmodified.
 *
 * Run from hq-onboarding: `vitest run node_modules/hq-cinematic/components/__tests__/reduced-motion.spec.tsx`
 * or after Story 3 re-export: `vitest run src/components/effects/**/__tests__`.
 */

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";

import { PrismBeam } from "../PrismBeam";
import { LightDust } from "../LightDust";
import { CrtVignette } from "../CrtVignette";
import { CornerBrackets } from "../CornerBrackets";
import { SpectrumText } from "../SpectrumText";
import { PrismReveal } from "../PrismReveal";
import { PhaseMachine } from "../PhaseMachine";
import { WebGLStage } from "../WebGLStage";

function mockReducedMotion(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("prefers-reduced-motion") ? matches : false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

describe("hq-cinematic reduced-motion contract", () => {
  beforeEach(() => {
    mockReducedMotion(true);
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("PrismBeam reports reduce in data attr and drops drift animation", () => {
    const { container } = render(<PrismBeam />);
    const root = container.firstElementChild!;
    expect(root.getAttribute("data-prefers-reduced-motion")).toBe("reduce");
    const beam = root.firstElementChild as HTMLElement;
    expect(beam.style.animation === "none" || beam.style.animation === "").toBe(true);
  });

  it("LightDust mounts a canvas but does not start a RAF loop", () => {
    const raf = vi.spyOn(window, "requestAnimationFrame");
    render(<LightDust />);
    expect(raf).not.toHaveBeenCalled();
  });

  it("CrtVignette renders with no animation (static by design)", () => {
    const { container } = render(<CrtVignette />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.style.animation === "" || el.style.animation === "none").toBe(true);
  });

  it("CornerBrackets renders with no animation (static by design)", () => {
    const { container } = render(<CornerBrackets />);
    const el = container.firstElementChild as HTMLElement;
    expect(el).toBeTruthy();
    expect(el.getAttribute("aria-hidden")).toBe("true");
  });

  it("SpectrumText skips dispersion-reveal animation under reduced motion", () => {
    const { container } = render(
      <SpectrumText dispersionReveal>HQ</SpectrumText>,
    );
    const el = container.firstElementChild as HTMLElement;
    expect(el.getAttribute("data-prefers-reduced-motion")).toBe("reduce");
    expect(el.getAttribute("data-spectrum-reveal")).toBe("false");
  });

  it("PrismReveal reveals children instantly under reduced motion", () => {
    const { container } = render(
      <PrismReveal>
        <span>child</span>
      </PrismReveal>,
    );
    const el = container.firstElementChild as HTMLElement;
    expect(el.getAttribute("data-prism-reveal")).toBe("done");
  });

  it("PhaseMachine disables transition under reduced motion", () => {
    const phases = [
      { id: "a", label: "A" },
      { id: "b", label: "B" },
    ];
    const { container } = render(
      <PhaseMachine phases={phases} activeIndex={0} />,
    );
    const el = container.firstElementChild as HTMLElement;
    expect(el.getAttribute("data-prefers-reduced-motion")).toBe("reduce");
  });

  it("WebGLStage does not mount the scene component under reduced motion", () => {
    const SceneComponent = vi.fn(() => <div data-testid="scene" />);
    const { queryByTestId } = render(
      <WebGLStage
        SceneComponent={SceneComponent}
        poster={<div data-testid="poster" />}
      />,
    );
    expect(queryByTestId("scene")).toBeNull();
    expect(queryByTestId("poster")).not.toBeNull();
    expect(SceneComponent).not.toHaveBeenCalled();
  });
});

describe("hq-cinematic — no-preference default path", () => {
  beforeEach(() => {
    mockReducedMotion(false);
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("PrismBeam reports no-preference and applies drift animation", () => {
    const { container } = render(<PrismBeam />);
    const root = container.firstElementChild!;
    expect(root.getAttribute("data-prefers-reduced-motion")).toBe("no-preference");
    const beam = root.firstElementChild as HTMLElement;
    expect(beam.style.animation).toContain("beam-drift");
  });
});
