/**
 * LoginScreen - API key authentication screen.
 * Provides secure API key input with validation and error handling.
 */
import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Keyboard,
  TouchableWithoutFeedback,
} from "react-native";
import { colors, spacing, typography, borderRadius } from "../theme";
import { useAuth } from "../contexts";

export function LoginScreen(): React.JSX.Element {
  const { login, error, clearError, isLoading } = useAuth();
  const [apiKey, setApiKey] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const displayError = error ?? localError;

  const handleLogin = useCallback(async () => {
    Keyboard.dismiss();
    setLocalError(null);
    clearError();

    const trimmedKey = apiKey.trim();
    if (trimmedKey.length === 0) {
      setLocalError("Please enter your API key.");
      return;
    }

    try {
      await login(trimmedKey);
    } catch (_err: unknown) {
      // Error is set by AuthContext - no additional handling needed
    }
  }, [apiKey, login, clearError]);

  const handleChangeText = useCallback(
    (text: string) => {
      setApiKey(text);
      if (localError) {
        setLocalError(null);
      }
      if (error) {
        clearError();
      }
    },
    [localError, error, clearError],
  );

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View style={styles.content}>
          {/* App branding */}
          <View style={styles.header}>
            <Text style={styles.logo}>HQ Cloud</Text>
            <Text style={styles.subtitle}>
              Connect to your workers
            </Text>
          </View>

          {/* Input section */}
          <View style={styles.form}>
            <Text style={styles.label}>API KEY</Text>
            <TextInput
              style={[styles.input, displayError ? styles.inputError : null]}
              placeholder="Enter your API key"
              placeholderTextColor={colors.text.tertiary}
              value={apiKey}
              onChangeText={handleChangeText}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="off"
              secureTextEntry
              editable={!isLoading}
              returnKeyType="go"
              onSubmitEditing={handleLogin}
              accessibilityLabel="API key input"
              accessibilityHint="Enter your HQ Cloud API key to log in"
            />

            {displayError ? (
              <Text style={styles.errorText} accessibilityRole="alert">
                {displayError}
              </Text>
            ) : null}

            <TouchableOpacity
              style={[styles.button, isLoading ? styles.buttonDisabled : null]}
              onPress={handleLogin}
              disabled={isLoading}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Log in"
              accessibilityState={{ disabled: isLoading }}
            >
              {isLoading ? (
                <ActivityIndicator color={colors.text.inverse} size="small" />
              ) : (
                <Text style={styles.buttonText}>Log In</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Footer hint */}
          <Text style={styles.hint}>
            Your API key is stored securely on this device using{" "}
            {Platform.OS === "ios" ? "Keychain" : "Keystore"}.
          </Text>
        </View>
      </KeyboardAvoidingView>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  content: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: spacing.xxl,
  },
  header: {
    alignItems: "center",
    marginBottom: spacing.huge,
  },
  logo: {
    fontSize: 36,
    fontWeight: "700",
    color: colors.text.primary,
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  subtitle: {
    ...typography.bodySmall,
    textAlign: "center",
  },
  form: {
    marginBottom: spacing.xxxl,
  },
  label: {
    ...typography.sectionHeader,
    marginBottom: spacing.sm,
  },
  input: {
    backgroundColor: colors.background.tertiary,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    color: colors.text.primary,
    fontSize: 16,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    marginBottom: spacing.md,
  },
  inputError: {
    borderColor: colors.accent.red,
  },
  errorText: {
    color: colors.accent.red,
    fontSize: 14,
    marginBottom: spacing.md,
  },
  button: {
    backgroundColor: colors.accent.blue,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.lg,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.sm,
    minHeight: 52,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    ...typography.button,
    color: colors.text.primary,
  },
  hint: {
    ...typography.label,
    textAlign: "center",
    paddingHorizontal: spacing.lg,
  },
});
