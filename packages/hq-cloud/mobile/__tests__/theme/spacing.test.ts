/**
 * Tests for spacing tokens - validates consistent spacing scale.
 */
import { spacing } from "../../src/theme/spacing";

describe("spacing", () => {
  it("should have an ascending scale", () => {
    const values = [
      spacing.xxs,
      spacing.xs,
      spacing.sm,
      spacing.md,
      spacing.lg,
      spacing.xl,
      spacing.xxl,
      spacing.xxxl,
      spacing.huge,
      spacing.massive,
    ];

    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeGreaterThan(values[i - 1]);
    }
  });

  it("should have standard padding value at lg (16px)", () => {
    expect(spacing.lg).toBe(16);
  });

  it("should be based on a 4px grid for key values", () => {
    expect(spacing.xs % 4).toBe(0);
    expect(spacing.sm % 4).toBe(0);
    expect(spacing.lg % 4).toBe(0);
    expect(spacing.xxl % 4).toBe(0);
    expect(spacing.xxxl % 4).toBe(0);
  });
});
