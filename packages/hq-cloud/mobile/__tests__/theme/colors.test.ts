/**
 * Tests for color tokens - validates the dark theme design system.
 */
import { colors } from "../../src/theme/colors";

describe("colors", () => {
  describe("background", () => {
    it("should have all required background layers", () => {
      expect(colors.background.primary).toBeDefined();
      expect(colors.background.secondary).toBeDefined();
      expect(colors.background.tertiary).toBeDefined();
      expect(colors.background.card).toBeDefined();
      expect(colors.background.elevated).toBeDefined();
    });

    it("should use dark values (low lightness) for dark theme", () => {
      // All background colors should start with low hex values (dark)
      const darkHexPattern = /^#[0-3]/;
      expect(colors.background.primary).toMatch(darkHexPattern);
      expect(colors.background.secondary).toMatch(darkHexPattern);
      expect(colors.background.tertiary).toMatch(darkHexPattern);
      expect(colors.background.card).toMatch(darkHexPattern);
    });
  });

  describe("text", () => {
    it("should have all text hierarchy levels", () => {
      expect(colors.text.primary).toBe("#FFFFFF");
      expect(colors.text.secondary).toBeDefined();
      expect(colors.text.tertiary).toBeDefined();
      expect(colors.text.inverse).toBeDefined();
    });
  });

  describe("accent", () => {
    it("should have yellow/gold for active progress", () => {
      expect(colors.accent.yellow).toBeDefined();
    });

    it("should have green for completed items", () => {
      expect(colors.accent.green).toBeDefined();
    });

    it("should have red for errors", () => {
      expect(colors.accent.red).toBeDefined();
    });
  });

  describe("status", () => {
    it("should have all status dot variants", () => {
      expect(colors.status.healthy).toBe(colors.accent.green);
      expect(colors.status.warning).toBe(colors.accent.yellow);
      expect(colors.status.error).toBe(colors.accent.red);
      expect(colors.status.idle).toBeDefined();
    });
  });

  describe("progress", () => {
    it("should have active and complete fill colors", () => {
      expect(colors.progress.active).toBe(colors.accent.yellow);
      expect(colors.progress.complete).toBe(colors.accent.green);
      expect(colors.progress.track).toBeDefined();
    });
  });

  describe("button", () => {
    it("should have all button variants", () => {
      expect(colors.button.primary).toBeDefined();
      expect(colors.button.muted).toBeDefined();
      expect(colors.button.prominent).toBeDefined();
      expect(colors.button.prominentText).toBeDefined();
    });

    it("should have prominent as white with dark text for Figma Allow button", () => {
      expect(colors.button.prominent).toBe("#FFFFFF");
      expect(colors.button.prominentText).toBe(colors.text.inverse);
    });
  });

  describe("icon", () => {
    it("should have icon tint tokens", () => {
      expect(colors.icon.default).toBeDefined();
      expect(colors.icon.active).toBeDefined();
      expect(colors.icon.brand).toBeDefined();
    });
  });
});
