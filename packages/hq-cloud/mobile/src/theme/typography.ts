import { TextStyle, Platform } from "react-native";
import { colors } from "./colors";

/**
 * HQ Cloud Mobile - Typography scale
 * Clean sans-serif with section headers in caps.
 *
 * Matches Figma Indigo design system:
 * - Section headers: uppercase, letter-spaced (e.g., "AGENTS", "NAVIGATOR")
 * - Card titles: medium weight, white
 * - Body: regular weight, gray variants
 * - Monospace: for code/task blocks in agent chat
 */

/** System sans-serif font family */
const fontFamily = Platform.select({
  ios: "System",
  android: "Roboto",
  default: "System",
});

/** Monospace font for code/task blocks */
const monoFamily = Platform.select({
  ios: "Menlo",
  android: "monospace",
  default: "monospace",
});

export const typography = {
  /** Screen titles - large bold */
  title: {
    fontFamily,
    fontSize: 28,
    fontWeight: "700",
    letterSpacing: 0.3,
    color: colors.text.primary,
  } satisfies TextStyle,

  /** Section headers - caps, smaller (e.g., "AGENTS", "NAVIGATOR") */
  sectionHeader: {
    fontFamily,
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: colors.text.secondary,
  } satisfies TextStyle,

  /** Body text */
  body: {
    fontFamily,
    fontSize: 16,
    fontWeight: "400",
    lineHeight: 22,
    color: colors.text.primary,
  } satisfies TextStyle,

  /** Secondary body text */
  bodySmall: {
    fontFamily,
    fontSize: 14,
    fontWeight: "400",
    lineHeight: 20,
    color: colors.text.secondary,
  } satisfies TextStyle,

  /** Card titles - worker names, file names */
  cardTitle: {
    fontFamily,
    fontSize: 16,
    fontWeight: "600",
    color: colors.text.primary,
  } satisfies TextStyle,

  /** Labels, tags, timestamps (e.g., "5m") */
  label: {
    fontFamily,
    fontSize: 12,
    fontWeight: "500",
    color: colors.text.secondary,
  } satisfies TextStyle,

  /** Caption - smallest readable text */
  caption: {
    fontFamily,
    fontSize: 11,
    fontWeight: "400",
    color: colors.text.tertiary,
  } satisfies TextStyle,

  /** Button text */
  button: {
    fontFamily,
    fontSize: 16,
    fontWeight: "600",
    color: colors.text.primary,
  } satisfies TextStyle,

  /** Small button text (for inline actions like Allow/Deny) */
  buttonSmall: {
    fontFamily,
    fontSize: 14,
    fontWeight: "600",
    color: colors.text.primary,
  } satisfies TextStyle,

  /** Monospace - code blocks, task names in chat */
  mono: {
    fontFamily: monoFamily,
    fontSize: 13,
    fontWeight: "400",
    lineHeight: 18,
    color: colors.text.primary,
  } satisfies TextStyle,

  /** Progress fraction text (e.g., "4/6") */
  progressFraction: {
    fontFamily,
    fontSize: 14,
    fontWeight: "500",
    color: colors.text.secondary,
  } satisfies TextStyle,

  /** Brand header title ("Indigo") */
  brandTitle: {
    fontFamily,
    fontSize: 20,
    fontWeight: "700",
    letterSpacing: 0.5,
    color: colors.text.primary,
  } satisfies TextStyle,
} as const;

export type Typography = typeof typography;
