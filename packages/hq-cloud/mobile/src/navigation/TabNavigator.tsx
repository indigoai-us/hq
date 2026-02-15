/**
 * Root tab navigator for HQ Cloud Mobile.
 * Bottom tabs: Agents | Navigator
 */
import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { AgentsStack } from "./AgentsStack";
import { NavigatorStack } from "./NavigatorStack";
import { colors, spacing } from "../theme";
import type { RootTabParamList } from "../types";

const Tab = createBottomTabNavigator<RootTabParamList>();

export function TabNavigator(): React.JSX.Element {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.background.secondary,
          borderTopColor: colors.border.subtle,
          borderTopWidth: 1,
          paddingTop: spacing.xs,
          paddingBottom: spacing.sm,
          height: 80,
        },
        tabBarActiveTintColor: colors.text.primary,
        tabBarInactiveTintColor: colors.text.tertiary,
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: "600",
          letterSpacing: 0.5,
        },
      }}
    >
      <Tab.Screen
        name="Agents"
        component={AgentsStack}
        options={{
          tabBarLabel: "AGENTS",
        }}
      />
      <Tab.Screen
        name="Navigator"
        component={NavigatorStack}
        options={{
          tabBarLabel: "NAVIGATOR",
        }}
      />
    </Tab.Navigator>
  );
}
