/**
 * AttachmentMenu - Popover menu for selecting attachment types.
 *
 * Displays a modal overlay with attachment options:
 * - Photos: Attach photo from library
 * - Camera: Take a new photo
 * - Files: Pick a document
 * - + Agent: Open worker spawn flow (MOB-011)
 * - + Project: Open project creation flow
 *
 * MOB-013: Global input bar with voice and attachments
 */
import React, { useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Modal,
} from "react-native";
import * as Haptics from "expo-haptics";
import { colors, spacing, typography, borderRadius, shadows } from "../theme";

export type AttachmentType = "photos" | "camera" | "files" | "agent" | "project";

interface AttachmentOption {
  type: AttachmentType;
  label: string;
  icon: string;
}

const attachmentOptions: AttachmentOption[] = [
  { type: "photos", label: "Photos", icon: "\uD83D\uDDBC\uFE0F" },
  { type: "camera", label: "Camera", icon: "\uD83D\uDCF7" },
  { type: "files", label: "Files", icon: "\uD83D\uDCC1" },
  { type: "agent", label: "+ Agent", icon: "\uD83E\uDD16" },
  { type: "project", label: "+ Project", icon: "\uD83D\uDCC4" },
];

interface AttachmentMenuProps {
  /** Whether the menu is visible */
  visible: boolean;
  /** Called when the menu should close */
  onClose: () => void;
  /** Called when an attachment type is selected */
  onSelect: (type: AttachmentType) => void;
  /** Test ID for testing */
  testID?: string;
}

export function AttachmentMenu({
  visible,
  onClose,
  onSelect,
  testID,
}: AttachmentMenuProps): React.JSX.Element {
  const handleSelect = useCallback(
    (type: AttachmentType) => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onSelect(type);
      onClose();
    },
    [onSelect, onClose],
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      testID={testID}
    >
      <Pressable
        style={styles.overlay}
        onPress={onClose}
        testID={testID ? `${testID}-overlay` : undefined}
        accessibilityLabel="Close attachment menu"
        accessibilityRole="button"
      >
        <View style={styles.menuContainer}>
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={styles.menu}
            testID={testID ? `${testID}-panel` : undefined}
          >
            <Text style={styles.menuTitle}>Attach</Text>
            {attachmentOptions.map((option) => (
              <Pressable
                key={option.type}
                onPress={() => handleSelect(option.type)}
                style={({ pressed }) => [
                  styles.menuItem,
                  pressed ? styles.menuItemPressed : undefined,
                ]}
                accessibilityRole="button"
                accessibilityLabel={option.label}
                testID={testID ? `${testID}-${option.type}` : undefined}
              >
                <Text style={styles.menuItemIcon}>{option.icon}</Text>
                <Text style={styles.menuItemLabel}>{option.label}</Text>
              </Pressable>
            ))}
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay.scrim,
    justifyContent: "flex-end",
  },
  menuContainer: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.huge,
  },
  menu: {
    backgroundColor: colors.background.card,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    ...shadows.modal,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  menuTitle: {
    ...typography.sectionHeader,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.md,
    gap: spacing.md,
  },
  menuItemPressed: {
    backgroundColor: colors.background.elevated,
  },
  menuItemIcon: {
    fontSize: 22,
    width: 32,
    textAlign: "center",
  },
  menuItemLabel: {
    ...typography.body,
    color: colors.text.primary,
  },
});
