/**
 * HQ Cloud Mobile - App entry point.
 * Sets up ThemeProvider, auth provider, WebSocket provider, navigation, and dark theme.
 */
import React from "react";
import { StatusBar } from "expo-status-bar";
import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { RootNavigator } from "./src/navigation";
import { AuthProvider, WebSocketProvider, NotificationProvider } from "./src/contexts";
import { colors, ThemeProvider } from "./src/theme";

/**
 * React Navigation dark theme derived from design system tokens.
 * Ensures navigation chrome (headers, tab bars) match the dark design.
 */
const DarkNavigationTheme = {
  ...DefaultTheme,
  dark: true,
  colors: {
    ...DefaultTheme.colors,
    primary: colors.accent.blue,
    background: colors.background.primary,
    card: colors.background.secondary,
    text: colors.text.primary,
    border: colors.border.subtle,
    notification: colors.accent.yellow,
  },
};

export default function App(): React.JSX.Element {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <AuthProvider>
            <WebSocketProvider>
              <NavigationContainer theme={DarkNavigationTheme}>
                <NotificationProvider>
                  <StatusBar style="light" />
                  <RootNavigator />
                </NotificationProvider>
              </NavigationContainer>
            </WebSocketProvider>
          </AuthProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
