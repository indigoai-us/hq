/**
 * ConnectionStatusIndicator - displays current WebSocket connection status.
 * Shows a small colored dot with optional label text.
 * Green = connected, Yellow = connecting/reconnecting, Red = disconnected.
 */
import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { useWebSocket } from "../contexts/WebSocketContext";
import { colors, spacing, typography } from "../theme";
import type { ConnectionStatus } from "../types/websocket";

interface ConnectionStatusIndicatorProps {
  /** Whether to show the status label text (default: true) */
  showLabel?: boolean;
  /** Whether tapping triggers a reconnect (default: true) */
  tapToReconnect?: boolean;
}

const STATUS_CONFIG: Record<ConnectionStatus, { color: string; label: string }> = {
  connected: { color: colors.status.healthy, label: "Connected" },
  connecting: { color: colors.status.warning, label: "Connecting..." },
  reconnecting: { color: colors.status.warning, label: "Reconnecting..." },
  disconnected: { color: colors.status.error, label: "Disconnected" },
};

export function ConnectionStatusIndicator({
  showLabel = true,
  tapToReconnect = true,
}: ConnectionStatusIndicatorProps): React.JSX.Element {
  const { connectionStatus, reconnect } = useWebSocket();
  const config = STATUS_CONFIG[connectionStatus];

  const handlePress = (): void => {
    if (tapToReconnect && connectionStatus === "disconnected") {
      reconnect();
    }
  };

  const content = (
    <View style={styles.container}>
      <View
        style={[
          styles.dot,
          { backgroundColor: config.color },
        ]}
      />
      {showLabel && (
        <Text style={styles.label}>{config.label}</Text>
      )}
    </View>
  );

  if (tapToReconnect && connectionStatus === "disconnected") {
    return (
      <Pressable onPress={handlePress} accessibilityRole="button" accessibilityLabel="Tap to reconnect">
        {content}
      </Pressable>
    );
  }

  return content;
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  label: {
    ...typography.bodySmall,
    fontSize: 11,
    color: colors.text.tertiary,
  },
});
