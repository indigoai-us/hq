/**
 * RootNavigator - Gates app navigation on authentication state.
 * Shows LoginScreen when not authenticated, TabNavigator when authenticated,
 * and LoadingScreen during initial auth check.
 */
import React from "react";
import { useAuth } from "../contexts";
import { TabNavigator } from "./TabNavigator";
import { LoginScreen } from "../screens/LoginScreen";
import { LoadingScreen } from "../screens/LoadingScreen";

export function RootNavigator(): React.JSX.Element {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (!isAuthenticated) {
    return <LoginScreen />;
  }

  return <TabNavigator />;
}
