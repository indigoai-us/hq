/**
 * Design system integration test.
 * Validates all theme tokens are exported and consistent.
 */
import { colors, spacing, typography, shadows, borderRadius, cardStyle, hitSlop, progressBar } from "../../src/theme";

describe("design system integration", () => {
  it("exports all token modules from theme/index", () => {
    expect(colors).toBeDefined();
    expect(spacing).toBeDefined();
    expect(typography).toBeDefined();
    expect(shadows).toBeDefined();
    expect(borderRadius).toBeDefined();
    expect(cardStyle).toBeDefined();
    expect(hitSlop).toBeDefined();
    expect(progressBar).toBeDefined();
  });

  it("cardStyle borderRadius matches borderRadius.lg", () => {
    expect(cardStyle.borderRadius).toBe(borderRadius.lg);
  });

  it("progress bar colors reference accent tokens", () => {
    expect(colors.progress.active).toBe(colors.accent.yellow);
    expect(colors.progress.complete).toBe(colors.accent.green);
  });

  it("status colors reference accent tokens", () => {
    expect(colors.status.healthy).toBe(colors.accent.green);
    expect(colors.status.warning).toBe(colors.accent.yellow);
    expect(colors.status.error).toBe(colors.accent.red);
  });

  it("typography uses color tokens", () => {
    expect(typography.title.color).toBe(colors.text.primary);
    expect(typography.sectionHeader.color).toBe(colors.text.secondary);
    expect(typography.bodySmall.color).toBe(colors.text.secondary);
    expect(typography.label.color).toBe(colors.text.secondary);
    expect(typography.caption.color).toBe(colors.text.tertiary);
  });

  it("all background colors are dark (hex starts with 0-3)", () => {
    const darkHexPattern = /^#[0-3]/;
    expect(colors.background.primary).toMatch(darkHexPattern);
    expect(colors.background.secondary).toMatch(darkHexPattern);
    expect(colors.background.tertiary).toMatch(darkHexPattern);
    expect(colors.background.card).toMatch(darkHexPattern);
    expect(colors.background.elevated).toMatch(darkHexPattern);
  });

  it("button prominent is white on dark for Figma Allow button", () => {
    expect(colors.button.prominent).toBe("#FFFFFF");
    expect(colors.button.prominentText).toBe(colors.background.primary);
  });
});
