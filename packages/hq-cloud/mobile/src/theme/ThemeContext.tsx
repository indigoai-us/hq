/**
 * ThemeContext - Provides design system tokens via React context.
 *
 * Wraps the app to give all components access to theme values
 * through the useTheme() hook. Currently dark-only; structured
 * to support light theme in the future if needed.
 */
import React, { createContext, useContext, useMemo } from "react";
import { colors } from "./colors";
import { spacing } from "./spacing";
import { typography } from "./typography";
import { shadows } from "./shadows";
import type { Colors } from "./colors";
import type { Spacing } from "./spacing";
import type { Typography } from "./typography";
import type { Shadows } from "./shadows";

/** Inline constants to avoid circular dependency with ./index */
const _borderRadius = {
  sm: 6, md: 10, lg: 16, xl: 20, full: 9999,
} as const;

const _cardStyle = {
  borderRadius: 16, padding: 16, borderWidth: 1,
} as const;

const _hitSlop = {
  top: 8, right: 8, bottom: 8, left: 8,
} as const;

const _progressBar = {
  height: 4, borderRadius: 2,
} as const;

export interface Theme {
  colors: Colors;
  spacing: Spacing;
  typography: Typography;
  shadows: Shadows;
  borderRadius: typeof _borderRadius;
  cardStyle: typeof _cardStyle;
  hitSlop: typeof _hitSlop;
  progressBar: typeof _progressBar;
  isDark: boolean;
}

const darkTheme: Theme = {
  colors,
  spacing,
  typography,
  shadows,
  borderRadius: _borderRadius,
  cardStyle: _cardStyle,
  hitSlop: _hitSlop,
  progressBar: _progressBar,
  isDark: true,
};

const ThemeContext = createContext<Theme>(darkTheme);

interface ThemeProviderProps {
  children: React.ReactNode;
}

/**
 * ThemeProvider wraps the app and provides design tokens.
 * Currently always uses the dark theme matching Figma designs.
 */
export function ThemeProvider({ children }: ThemeProviderProps): React.JSX.Element {
  const theme = useMemo(() => darkTheme, []);

  return (
    <ThemeContext.Provider value={theme}>
      {children}
    </ThemeContext.Provider>
  );
}

/**
 * Hook to access design system tokens.
 *
 * @example
 * const { colors, spacing, typography } = useTheme();
 */
export function useTheme(): Theme {
  return useContext(ThemeContext);
}
