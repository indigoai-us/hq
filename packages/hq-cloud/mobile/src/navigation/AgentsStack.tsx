/**
 * Agents navigation stack.
 * AgentsList -> AgentDetail -> NotificationSettings
 * Uses BrandHeader for main list, native back-arrow header for detail.
 * Includes logout button in header for authenticated sessions.
 * Registers a notification navigator bridge for deep-linking from push notifications.
 */
import React, { useCallback, useEffect } from "react";
import { TouchableOpacity, Text, Alert, StyleSheet } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useNavigation } from "@react-navigation/native";
import type { NavigationProp } from "@react-navigation/native";
import { AgentsListScreen } from "../screens/AgentsListScreen";
import { AgentDetailScreen } from "../screens/AgentDetailScreen";
import { NotificationSettingsScreen } from "../screens/NotificationSettingsScreen";
import { SpawnWorkerScreen } from "../screens/SpawnWorkerScreen";
import { BrandHeader } from "../components";
import { colors, spacing, typography } from "../theme";
import { useAuth, useNotificationContext } from "../contexts";
import type { AgentsStackParamList } from "../types";

const Stack = createNativeStackNavigator<AgentsStackParamList>();

function LogoutButton(): React.JSX.Element {
  const { logout } = useAuth();

  const handleLogout = useCallback(() => {
    Alert.alert("Log Out", "Are you sure you want to log out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Log Out",
        style: "destructive",
        onPress: () => void logout(),
      },
    ]);
  }, [logout]);

  return (
    <TouchableOpacity
      onPress={handleLogout}
      style={headerStyles.logoutButton}
      accessibilityRole="button"
      accessibilityLabel="Log out"
    >
      <Text style={headerStyles.logoutText}>Log Out</Text>
    </TouchableOpacity>
  );
}

/**
 * Registers a navigation callback with NotificationContext so that
 * tapping a push notification navigates to the correct agent detail screen.
 * This component renders nothing; it exists solely to bridge the gap
 * between the notification system and the navigation hierarchy.
 */
function NotificationNavigatorBridge(): null {
  const navigation = useNavigation<NavigationProp<AgentsStackParamList>>();
  const { setNavigator } = useNotificationContext();

  useEffect(() => {
    setNavigator((agentId: string) => {
      navigation.navigate("AgentDetail", { agentId });
    });
  }, [navigation, setNavigator]);

  return null;
}

/**
 * BrandHeader wired with notification settings navigation.
 */
function AgentsListBrandHeader(): React.JSX.Element {
  const navigation = useNavigation<NavigationProp<AgentsStackParamList>>();

  const handleIconsPress = useCallback(() => {
    navigation.navigate("NotificationSettings");
  }, [navigation]);

  return <BrandHeader onIconsPress={handleIconsPress} />;
}

const headerStyles = StyleSheet.create({
  logoutButton: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  logoutText: {
    ...typography.buttonSmall,
    color: colors.accent.red,
  },
});

export function AgentsStack(): React.JSX.Element {
  return (
    <>
      <NotificationNavigatorBridge />
      <Stack.Navigator
        screenOptions={{
          headerStyle: {
            backgroundColor: colors.background.primary,
          },
          headerTintColor: colors.text.primary,
          headerTitleStyle: {
            fontWeight: "600",
          },
          contentStyle: {
            backgroundColor: colors.background.primary,
          },
        }}
      >
        <Stack.Screen
          name="AgentsList"
          component={AgentsListScreen}
          options={{
            header: () => <AgentsListBrandHeader />,
          }}
        />
        <Stack.Screen
          name="AgentDetail"
          component={AgentDetailScreen}
          options={{
            title: "Agent",
            headerRight: () => <LogoutButton />,
          }}
        />
        <Stack.Screen
          name="NotificationSettings"
          component={NotificationSettingsScreen}
          options={{
            title: "Notifications",
            headerRight: () => <LogoutButton />,
          }}
        />
        <Stack.Screen
          name="SpawnWorker"
          component={SpawnWorkerScreen}
          options={{
            title: "Spawn Worker",
            headerRight: () => <LogoutButton />,
          }}
        />
      </Stack.Navigator>
    </>
  );
}
