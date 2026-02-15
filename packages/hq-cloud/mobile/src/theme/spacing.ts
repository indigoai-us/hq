/**
 * HQ Cloud Mobile - Spacing scale
 * Consistent spacing tokens for layout.
 * Based on a 4px grid with common sizes for mobile UI.
 */
export const spacing = {
  /** 2px - hairline gaps */
  xxs: 2,
  /** 4px - tight spacing between related elements */
  xs: 4,
  /** 8px - default compact spacing */
  sm: 8,
  /** 12px - medium spacing */
  md: 12,
  /** 16px - standard padding for cards and containers */
  lg: 16,
  /** 20px - generous internal padding */
  xl: 20,
  /** 24px - section separation */
  xxl: 24,
  /** 32px - large section gaps */
  xxxl: 32,
  /** 48px - major layout gaps */
  huge: 48,
  /** 64px - screen-level spacing (e.g., top safe area padding) */
  massive: 64,
} as const;

export type Spacing = typeof spacing;
