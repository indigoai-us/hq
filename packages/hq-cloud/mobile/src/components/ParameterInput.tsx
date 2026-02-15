/**
 * ParameterInput - Input field for worker skill parameters.
 * Renders appropriate input type based on parameter definition.
 * MOB-011: Spawn worker from mobile
 */
import React, { useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
} from "react-native";
import { colors, spacing, typography, borderRadius } from "../theme";
import type { WorkerSkillParameter } from "../types";

interface ParameterInputProps {
  /** Parameter definition */
  parameter: WorkerSkillParameter;
  /** Current value */
  value: string;
  /** Called when value changes */
  onChange: (name: string, value: string) => void;
  /** Test ID for testing */
  testID?: string;
}

export function ParameterInput({
  parameter,
  value,
  onChange,
  testID,
}: ParameterInputProps): React.JSX.Element {
  const handleChange = useCallback(
    (newValue: string) => {
      onChange(parameter.name, newValue);
    },
    [onChange, parameter.name],
  );

  const handleOptionSelect = useCallback(
    (option: string) => {
      onChange(parameter.name, option);
    },
    [onChange, parameter.name],
  );

  return (
    <View style={styles.container} testID={testID}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{parameter.label}</Text>
        {parameter.required && (
          <Text style={styles.required}>Required</Text>
        )}
      </View>

      {parameter.type === "select" && parameter.options ? (
        <View style={styles.optionsRow}>
          {parameter.options.map((option) => (
            <Pressable
              key={option}
              onPress={() => handleOptionSelect(option)}
              style={[
                styles.optionButton,
                value === option ? styles.optionSelected : undefined,
              ]}
              testID={testID ? `${testID}-option-${option}` : undefined}
              accessibilityRole="radio"
              accessibilityState={{ selected: value === option }}
            >
              <Text
                style={[
                  styles.optionText,
                  value === option ? styles.optionTextSelected : undefined,
                ]}
              >
                {option}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : parameter.type === "boolean" ? (
        <View style={styles.optionsRow}>
          {["true", "false"].map((option) => (
            <Pressable
              key={option}
              onPress={() => handleOptionSelect(option)}
              style={[
                styles.optionButton,
                value === option ? styles.optionSelected : undefined,
              ]}
              testID={testID ? `${testID}-option-${option}` : undefined}
              accessibilityRole="radio"
              accessibilityState={{ selected: value === option }}
            >
              <Text
                style={[
                  styles.optionText,
                  value === option ? styles.optionTextSelected : undefined,
                ]}
              >
                {option === "true" ? "Yes" : "No"}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : (
        <TextInput
          style={styles.textInput}
          value={value}
          onChangeText={handleChange}
          placeholder={parameter.placeholder ?? `Enter ${parameter.label.toLowerCase()}`}
          placeholderTextColor={colors.text.tertiary}
          keyboardType={parameter.type === "number" ? "numeric" : "default"}
          testID={testID ? `${testID}-input` : undefined}
          accessibilityLabel={parameter.label}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  label: {
    ...typography.buttonSmall,
    color: colors.text.primary,
  },
  required: {
    ...typography.caption,
    color: colors.accent.yellow,
  },
  textInput: {
    ...typography.body,
    color: colors.text.primary,
    backgroundColor: colors.background.tertiary,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    minHeight: 44,
  },
  optionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  optionButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.background.elevated,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  optionSelected: {
    backgroundColor: colors.accent.blue + "20",
    borderColor: colors.accent.blue,
  },
  optionText: {
    ...typography.buttonSmall,
    color: colors.text.secondary,
  },
  optionTextSelected: {
    color: colors.accent.blue,
  },
});
