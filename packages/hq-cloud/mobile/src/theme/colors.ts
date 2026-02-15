/**
 * HQ Cloud Mobile - Color palette
 * Dark theme design system matching Figma specs.
 *
 * Color reference (from Figma Indigo design system):
 * - Background: near-black (#0D0D0F) with layered dark grays for depth
 * - Cards: dark gray (#1E1E22) with subtle borders for elevation
 * - Accents: yellow/gold for active, green for complete, red for error
 * - Text: white primary, muted gray secondary, dim tertiary
 */
export const colors = {
  /** Background layers (darkest to lightest) */
  background: {
    /** App root background - near black */
    primary: "#0D0D0F",
    /** Tab bar, secondary surfaces */
    secondary: "#1A1A1E",
    /** Input fields, tertiary surfaces */
    tertiary: "#242428",
    /** Card backgrounds - slightly elevated from primary */
    card: "#1E1E22",
    /** Option buttons, interactive surface elements */
    elevated: "#2A2A2F",
  },

  /** Text hierarchy */
  text: {
    /** Primary text - pure white */
    primary: "#FFFFFF",
    /** Secondary labels, descriptions */
    secondary: "#A0A0A8",
    /** Tertiary/placeholder text */
    tertiary: "#6B6B73",
    /** Inverse text on light backgrounds */
    inverse: "#0D0D0F",
  },

  /** Accent colors */
  accent: {
    /** Active progress, warnings - gold/yellow */
    yellow: "#F5C542",
    /** Completed items, success indicators */
    green: "#4ADE80",
    /** Errors, destructive actions */
    red: "#EF4444",
    /** Primary action buttons, links */
    blue: "#3B82F6",
    /** Secondary highlights */
    purple: "#A78BFA",
  },

  /** Status dot colors (used in StatusDot component) */
  status: {
    /** Green dot - healthy, online, synced */
    healthy: "#4ADE80",
    /** Yellow dot - in progress, warning, syncing */
    warning: "#F5C542",
    /** Red dot - error, offline, failed */
    error: "#EF4444",
    /** Gray dot - idle, unknown */
    idle: "#6B6B73",
  },

  /** Progress bar colors */
  progress: {
    /** Active/in-progress track fill */
    active: "#F5C542",
    /** Completed track fill */
    complete: "#4ADE80",
    /** Background track (unfilled portion) */
    track: "#2A2A2E",
  },

  /** UI element borders */
  border: {
    /** Default subtle border for cards and containers */
    subtle: "#2A2A2E",
    /** Active/focused element borders */
    active: "#3A3A3E",
  },

  /** Transparent overlays */
  overlay: {
    /** Very light overlay for hover/press states */
    light: "rgba(255, 255, 255, 0.05)",
    /** Medium overlay for modals/drawers */
    medium: "rgba(255, 255, 255, 0.10)",
    /** Dark scrim for bottom sheets */
    scrim: "rgba(0, 0, 0, 0.6)",
  },

  /** Button-specific colors */
  button: {
    /** Primary action button background */
    primary: "#3B82F6",
    /** Muted/deny button background */
    muted: "#2A2A2E",
    /** Prominent/allow button background */
    prominent: "#FFFFFF",
    /** Prominent button text (dark on white) */
    prominentText: "#0D0D0F",
  },

  /** Icon tints */
  icon: {
    /** Default icon color */
    default: "#A0A0A8",
    /** Active/selected icon */
    active: "#FFFFFF",
    /** Brand accent icon */
    brand: "#F5C542",
  },
} as const;

export type Colors = typeof colors;
