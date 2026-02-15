/**
 * Tests for typography tokens - validates text styles match Figma design.
 */
import { typography } from "../../src/theme/typography";

describe("typography", () => {
  it("should have section headers in uppercase style", () => {
    expect(typography.sectionHeader.textTransform).toBe("uppercase");
    expect(typography.sectionHeader.letterSpacing).toBeGreaterThan(0);
    expect(typography.sectionHeader.fontWeight).toBe("600");
  });

  it("should have card title style", () => {
    expect(typography.cardTitle.fontWeight).toBe("600");
    expect(typography.cardTitle.fontSize).toBe(16);
  });

  it("should have brand title for Indigo header", () => {
    expect(typography.brandTitle).toBeDefined();
    expect(typography.brandTitle.fontWeight).toBe("700");
    expect(typography.brandTitle.letterSpacing).toBeGreaterThan(0);
  });

  it("should have progress fraction style", () => {
    expect(typography.progressFraction).toBeDefined();
    expect(typography.progressFraction.fontWeight).toBe("500");
  });

  it("should have monospace style for code blocks", () => {
    expect(typography.mono).toBeDefined();
    expect(typography.mono.fontFamily).toBeDefined();
  });

  it("should have small button text for inline actions", () => {
    expect(typography.buttonSmall).toBeDefined();
    expect(typography.buttonSmall.fontSize).toBeLessThan(typography.button.fontSize);
  });

  it("should have caption for smallest text", () => {
    expect(typography.caption).toBeDefined();
    expect(typography.caption.fontSize).toBeLessThanOrEqual(11);
  });

  it("should reference colors from design tokens for text colors", () => {
    expect(typography.title.color).toBe("#FFFFFF");
    expect(typography.sectionHeader.color).toBeDefined();
    expect(typography.bodySmall.color).toBeDefined();
  });
});
