/**
 * Navigator (file browser) navigation stack.
 * FileBrowser -> FileViewer
 * Uses BrandHeader for main browser, native back-arrow header for file viewer.
 */
import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { FileBrowserScreen } from "../screens/FileBrowserScreen";
import { FileViewerScreen } from "../screens/FileViewerScreen";
import { BrandHeader } from "../components";
import { colors } from "../theme";
import type { NavigatorStackParamList } from "../types";

const Stack = createNativeStackNavigator<NavigatorStackParamList>();

export function NavigatorStack(): React.JSX.Element {
  return (
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
        name="FileBrowser"
        component={FileBrowserScreen}
        options={{
          header: () => <BrandHeader />,
        }}
      />
      <Stack.Screen
        name="FileViewer"
        component={FileViewerScreen}
        options={{
          title: "File",
        }}
      />
    </Stack.Navigator>
  );
}
