/**
 * Tests for shadow tokens.
 */
import { shadows } from "../../src/theme/shadows";

describe("shadows", () => {
  it("should export all shadow levels", () => {
    expect(shadows.none).toBeDefined();
    expect(shadows.card).toBeDefined();
    expect(shadows.floating).toBeDefined();
    expect(shadows.modal).toBeDefined();
  });

  it("none shadow should have zero values", () => {
    // Platform.select returns the default/ios value in test environment
    const none = shadows.none;
    if ("shadowOpacity" in none) {
      expect(none.shadowOpacity).toBe(0);
    }
    if ("elevation" in none) {
      expect(none.elevation).toBe(0);
    }
  });
});
