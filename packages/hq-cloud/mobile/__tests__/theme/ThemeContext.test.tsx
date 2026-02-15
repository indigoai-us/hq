/**
 * Tests for ThemeContext - validates ThemeProvider and useTheme hook.
 */
import React from "react";
import { render } from "@testing-library/react-native";
import { Text } from "react-native";
import { ThemeProvider, useTheme } from "../../src/theme/ThemeContext";

function ThemeConsumer(): React.JSX.Element {
  const theme = useTheme();
  return (
    <>
      <Text testID="is-dark">{String(theme.isDark)}</Text>
      <Text testID="bg-primary">{theme.colors.background.primary}</Text>
      <Text testID="spacing-lg">{String(theme.spacing.lg)}</Text>
      <Text testID="border-radius-lg">{String(theme.borderRadius.lg)}</Text>
    </>
  );
}

describe("ThemeContext", () => {
  it("provides dark theme by default", () => {
    const { getByTestId } = render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>,
    );
    expect(getByTestId("is-dark").props.children).toBe("true");
  });

  it("provides color tokens", () => {
    const { getByTestId } = render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>,
    );
    expect(getByTestId("bg-primary").props.children).toBe("#0D0D0F");
  });

  it("provides spacing tokens", () => {
    const { getByTestId } = render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>,
    );
    expect(getByTestId("spacing-lg").props.children).toBe("16");
  });

  it("provides borderRadius tokens", () => {
    const { getByTestId } = render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>,
    );
    expect(getByTestId("border-radius-lg").props.children).toBe("16");
  });

  it("useTheme returns theme without provider (uses default context)", () => {
    // useTheme should work even without a provider due to default context value
    const { getByTestId } = render(<ThemeConsumer />);
    expect(getByTestId("is-dark").props.children).toBe("true");
  });
});
