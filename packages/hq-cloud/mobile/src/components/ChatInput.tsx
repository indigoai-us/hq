/**
 * ChatInput - Text input with send button and quick-reply options.
 *
 * Sits at the bottom of the agent detail chat screen. Features:
 * - Text input for custom messages
 * - Send button (active when text entered)
 * - Quick-reply option buttons when agent has pending question with options
 * - Haptic feedback on send
 *
 * MOB-007: Answer input on detail screen
 */
import React, { useCallback, useState } from "react";
import {
  View,
  TextInput,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
} from "react-native";
import * as Haptics from "expo-haptics";
import { colors, spacing, typography, borderRadius } from "../theme";
import type { AgentQuestion } from "../types";

interface ChatInputProps {
  /** Called when the user sends a message */
  onSendMessage: (content: string) => void;
  /** Called when the user selects a quick-reply option */
  onSelectOption?: (questionId: string, answer: string) => void;
  /** Current pending question with options, if any */
  currentQuestion?: AgentQuestion;
  /** Whether a message is currently being sent */
  sending?: boolean;
  /** Test ID for testing */
  testID?: string;
}

export function ChatInput({
  onSendMessage,
  onSelectOption,
  currentQuestion,
  sending = false,
  testID,
}: ChatInputProps): React.JSX.Element {
  const [text, setText] = useState("");
  const hasText = text.trim().length > 0;
  const hasOptions =
    currentQuestion?.options != null && currentQuestion.options.length > 0;

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onSendMessage(trimmed);
    setText("");
  }, [text, sending, onSendMessage]);

  const handleOptionPress = useCallback(
    (option: string) => {
      if (!currentQuestion || sending) return;

      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      if (onSelectOption) {
        onSelectOption(currentQuestion.id, option);
      }
    },
    [currentQuestion, sending, onSelectOption],
  );

  return (
    <View style={styles.container} testID={testID}>
      {/* Quick-reply options (horizontal scroll) */}
      {hasOptions && currentQuestion?.options && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.optionsRow}
          keyboardShouldPersistTaps="handled"
          testID={testID ? `${testID}-options` : undefined}
        >
          {currentQuestion.options.map((option) => (
            <Pressable
              key={option}
              onPress={() => handleOptionPress(option)}
              disabled={sending}
              style={({ pressed }) => [
                styles.optionChip,
                pressed && !sending ? styles.optionChipPressed : undefined,
                sending ? styles.optionChipDisabled : undefined,
              ]}
              accessibilityRole="button"
              accessibilityLabel={option}
              testID={testID ? `${testID}-option-${option}` : undefined}
            >
              <Text
                style={[
                  styles.optionText,
                  sending ? styles.optionTextDisabled : undefined,
                ]}
                numberOfLines={1}
              >
                {option}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {/* Input row */}
      <View style={styles.inputRow}>
        <TextInput
          style={styles.textInput}
          placeholder={
            currentQuestion ? "Type your answer..." : "Type a message..."
          }
          placeholderTextColor={colors.text.tertiary}
          value={text}
          onChangeText={setText}
          onSubmitEditing={handleSend}
          returnKeyType="send"
          editable={!sending}
          multiline
          maxLength={4000}
          testID={testID ? `${testID}-input` : undefined}
          accessibilityLabel="Message input"
        />
        <Pressable
          onPress={handleSend}
          disabled={!hasText || sending}
          style={({ pressed }) => [
            styles.sendButton,
            hasText && !sending ? styles.sendButtonActive : undefined,
            pressed && hasText && !sending
              ? styles.sendButtonPressed
              : undefined,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Send message"
          accessibilityState={{ disabled: !hasText || sending }}
          testID={testID ? `${testID}-send` : undefined}
        >
          <Text
            style={[
              styles.sendIcon,
              hasText && !sending
                ? styles.sendIconActive
                : undefined,
            ]}
          >
            {"\u2191"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderTopWidth: 1,
    borderTopColor: colors.border.subtle,
    backgroundColor: colors.background.secondary,
    paddingBottom: spacing.sm,
  },
  optionsRow: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  optionChip: {
    backgroundColor: colors.background.elevated,
    borderRadius: borderRadius.full,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  optionChipPressed: {
    backgroundColor: colors.background.tertiary,
    borderColor: colors.border.active,
  },
  optionChipDisabled: {
    opacity: 0.5,
  },
  optionText: {
    ...typography.bodySmall,
    color: colors.text.primary,
  },
  optionTextDisabled: {
    color: colors.text.tertiary,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    gap: spacing.sm,
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
});
