/**
 * HQ Cloud Mobile - Design system theme
 * Exports all theme tokens for consistent UI.
 *
 * Usage:
 *   import { colors, spacing, typography, borderRadius, shadows } from '../theme';
 *   import { useTheme } from '../theme/ThemeContext';
 */
export { colors } from "./colors";
export type { Colors } from "./colors";
export { spacing } from "./spacing";
export type { Spacing } from "./spacing";
export { typography } from "./typography";
export type { Typography } from "./typography";
export { shadows } from "./shadows";
export type { Shadows } from "./shadows";
export { ThemeProvider, useTheme } from "./ThemeContext";

export const borderRadius = {
  /** Small rounding - tags, badges */
  sm: 6,
  /** Medium rounding - inputs, buttons */
  md: 10,
  /** Large rounding - cards */
  lg: 16,
  /** Extra large rounding - modals, sheets */
  xl: 20,
  /** Fully round - circles, pills */
  full: 9999,
} as const;

/** Standard card dimensions and layout values */
export const cardStyle = {
  /** Default card border radius */
  borderRadius: 16,
  /** Default card padding */
  padding: 16,
  /** Default card border width */
  borderWidth: 1,
} as const;

/** Standard hitSlop for small tap targets */
export const hitSlop = {
  top: 8,
  right: 8,
  bottom: 8,
  left: 8,
} as const;

/** Progress bar dimensions */
export const progressBar = {
  /** Default bar height */
  height: 4,
  /** Border radius for bar ends */
  borderRadius: 2,
} as const;
