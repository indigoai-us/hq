/**
 * GlobalInputBar - Persistent input bar for asking anything.
 *
 * Sits at the bottom of Agents and Navigator screens, above the tab bar.
 * Features:
 * - "Ask anything..." placeholder text input
 * - Paperclip icon to open attachment menu (Photos, Camera, Files, + Agent, + Project)
 * - Microphone icon for voice input (speech-to-text placeholder)
 * - Send button (active when text entered)
 * - Does not overlap with agent cards or navigation
 *
 * MOB-013: Global input bar with voice and attachments
 */
import React, { useCallback, useState } from "react";
import {
  View,
  TextInput,
  Text,
  Pressable,
  StyleSheet,
} from "react-native";
import * as Haptics from "expo-haptics";
import { colors, spacing, typography, borderRadius } from "../theme";
import { AttachmentMenu } from "./AttachmentMenu";
import type { AttachmentType } from "./AttachmentMenu";

interface GlobalInputBarProps {
  /** Called when the user sends a message */
  onSendMessage: (content: string) => void;
  /** Called when voice input is activated */
  onVoiceInput?: () => void;
  /** Called when an attachment type is selected */
  onAttachment?: (type: AttachmentType) => void;
  /** Called when "+ Agent" is selected (worker spawn flow, MOB-011) */
  onSpawnAgent?: () => void;
  /** Called when "+ Project" is selected (project creation flow) */
  onCreateProject?: () => void;
  /** Whether a message is currently being sent */
  sending?: boolean;
  /** Whether voice input is currently recording */
  recording?: boolean;
  /** Test ID for testing */
  testID?: string;
}

export function GlobalInputBar({
  onSendMessage,
  onVoiceInput,
  onAttachment,
  onSpawnAgent,
  onCreateProject,
  sending = false,
  recording = false,
  testID,
}: GlobalInputBarProps): React.JSX.Element {
  const [text, setText] = useState("");
  const [attachmentMenuVisible, setAttachmentMenuVisible] = useState(false);
  const hasText = text.trim().length > 0;

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onSendMessage(trimmed);
    setText("");
  }, [text, sending, onSendMessage]);

  const handleVoiceInput = useCallback(() => {
    if (sending) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onVoiceInput?.();
  }, [sending, onVoiceInput]);

  const handleAttachmentPress = useCallback(() => {
    if (sending) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setAttachmentMenuVisible(true);
  }, [sending]);

  const handleAttachmentSelect = useCallback(
    (type: AttachmentType) => {
      if (type === "agent") {
        onSpawnAgent?.();
      } else if (type === "project") {
        onCreateProject?.();
      } else {
        onAttachment?.(type);
      }
    },
    [onAttachment, onSpawnAgent, onCreateProject],
  );

  const handleCloseAttachmentMenu = useCallback(() => {
    setAttachmentMenuVisible(false);
  }, []);

  return (
    <View style={styles.container} testID={testID}>
      <View style={styles.inputRow}>
        {/* Paperclip / Attachment button */}
        <Pressable
          onPress={handleAttachmentPress}
          disabled={sending}
          style={({ pressed }) => [
            styles.iconButton,
            pressed && !sending ? styles.iconButtonPressed : undefined,
            sending ? styles.iconButtonDisabled : undefined,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Attach file"
          accessibilityState={{ disabled: sending }}
          testID={testID ? `${testID}-attach` : undefined}
        >
          <Text
            style={[
              styles.iconText,
              sending ? styles.iconTextDisabled : undefined,
            ]}
          >
            {"\uD83D\uDCCE"}
          </Text>
        </Pressable>

        {/* Text input */}
        <TextInput
          style={styles.textInput}
          placeholder="Ask anything..."
          placeholderTextColor={colors.text.tertiary}
          value={text}
          onChangeText={setText}
          onSubmitEditing={handleSend}
          returnKeyType="send"
          editable={!sending}
          multiline
          maxLength={4000}
          testID={testID ? `${testID}-input` : undefined}
          accessibilityLabel="Ask anything input"
        />

        {/* Mic or Send button - show send when text entered, mic otherwise */}
        {hasText ? (
          <Pressable
            onPress={handleSend}
            disabled={sending}
            style={({ pressed }) => [
              styles.sendButton,
              !sending ? styles.sendButtonActive : undefined,
              pressed && !sending ? styles.sendButtonPressed : undefined,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Send message"
            accessibilityState={{ disabled: sending }}
            testID={testID ? `${testID}-send` : undefined}
          >
            <Text
              style={[
                styles.sendIcon,
                !sending ? styles.sendIconActive : undefined,
              ]}
            >
              {"\u2191"}
            </Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={handleVoiceInput}
            disabled={sending}
            style={({ pressed }) => [
              styles.iconButton,
              recording ? styles.micRecording : undefined,
              pressed && !sending ? styles.iconButtonPressed : undefined,
              sending ? styles.iconButtonDisabled : undefined,
            ]}
            accessibilityRole="button"
            accessibilityLabel={recording ? "Stop recording" : "Voice input"}
            accessibilityState={{ disabled: sending }}
            testID={testID ? `${testID}-mic` : undefined}
          >
            <Text
              style={[
                styles.iconText,
                recording ? styles.micIconRecording : undefined,
                sending ? styles.iconTextDisabled : undefined,
              ]}
            >
              {"\uD83C\uDF99\uFE0F"}
            </Text>
          </Pressable>
        )}
      </View>

      {/* Attachment menu modal */}
      <AttachmentMenu
        visible={attachmentMenuVisible}
        onClose={handleCloseAttachmentMenu}
        onSelect={handleAttachmentSelect}
        testID={testID ? `${testID}-attachment-menu` : undefined}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderTopWidth: 1,
    borderTopColor: colors.border.subtle,
    backgroundColor: colors.background.secondary,
    paddingBottom: spacing.xs,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    gap: spacing.sm,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.full,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  iconButtonPressed: {
    backgroundColor: colors.background.elevated,
  },
  iconButtonDisabled: {
    opacity: 0.5,
  },
  iconText: {
    fontSize: 20,
    color: colors.icon.default,
  },
  iconTextDisabled: {
    color: colors.text.tertiary,
  },
  textInput: {
    flex: 1,
    ...typography.body,
    color: colors.text.primary,
    backgroundColor: colors.background.tertiary,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    maxHeight: 120,
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.full,
    backgroundColor: colors.background.tertiary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  sendButtonActive: {
    backgroundColor: colors.accent.blue,
  },
  sendButtonPressed: {
    opacity: 0.8,
  },
  sendIcon: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.text.tertiary,
  },
  sendIconActive: {
    color: colors.text.primary,
  },
  micRecording: {
    backgroundColor: colors.accent.red + "20",
  },
  micIconRecording: {
    color: colors.accent.red,
  },
});
