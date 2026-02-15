import { Platform, ViewStyle } from "react-native";

/**
 * HQ Cloud Mobile - Shadow/elevation tokens
 * Provides consistent depth cues for the dark theme.
 *
 * On iOS: Uses shadowColor/shadowOffset/shadowOpacity/shadowRadius.
 * On Android: Uses elevation.
 * Dark theme uses subtle shadows since the background is already dark.
 */

type ShadowStyle = Pick<
  ViewStyle,
  "shadowColor" | "shadowOffset" | "shadowOpacity" | "shadowRadius" | "elevation"
>;

function createShadow(
  iosOpacity: number,
  iosRadius: number,
  iosOffsetY: number,
  androidElevation: number,
): ShadowStyle {
  return Platform.select({
    ios: {
      shadowColor: "#000000",
      shadowOffset: { width: 0, height: iosOffsetY },
      shadowOpacity: iosOpacity,
      shadowRadius: iosRadius,
    },
    android: {
      elevation: androidElevation,
    },
    default: {
      shadowColor: "#000000",
      shadowOffset: { width: 0, height: iosOffsetY },
      shadowOpacity: iosOpacity,
      shadowRadius: iosRadius,
    },
  }) as ShadowStyle;
}

export const shadows = {
  /** No shadow - flat elements */
  none: createShadow(0, 0, 0, 0),

  /** Subtle shadow for cards on dark background */
  card: createShadow(0.3, 4, 2, 2),

  /** Medium shadow for floating elements */
  floating: createShadow(0.4, 8, 4, 4),

  /** Strong shadow for modals, bottom sheets */
  modal: createShadow(0.5, 16, 8, 8),
} as const;

export type Shadows = typeof shadows;
