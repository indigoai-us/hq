import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SetupBanner } from "../SetupBanner";

// Mock clipboard API using defineProperty since clipboard is a getter
const mockWriteText = vi.fn().mockResolvedValue(undefined);
Object.defineProperty(navigator, "clipboard", {
  value: { writeText: mockWriteText },
  writable: true,
  configurable: true,
});

describe("SetupBanner", () => {
  let onDismiss: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    onDismiss = vi.fn();
  });

  it("renders the setup banner with correct message", () => {
    render(<SetupBanner onDismiss={onDismiss} />);

    expect(screen.getByTestId("setup-banner")).toBeTruthy();
    expect(screen.getByText("Sync your HQ files")).toBeTruthy();
    expect(
      screen.getByText(
        /Your HQ files haven't been synced yet/
      )
    ).toBeTruthy();
  });

  it("shows the CLI command and Sync via CLI label", () => {
    render(<SetupBanner onDismiss={onDismiss} />);

    expect(screen.getByText("hq auth login")).toBeTruthy();
    expect(screen.getByText("Sync via CLI")).toBeTruthy();
  });

  it("shows copy button for CLI command", () => {
    render(<SetupBanner onDismiss={onDismiss} />);

    const copyButton = screen.getByTestId("copy-cli-command");
    expect(copyButton).toBeTruthy();
    expect(copyButton.textContent).toBe("Copy");
  });

  it("copies the CLI command to clipboard when Copy is clicked", () => {
    render(<SetupBanner onDismiss={onDismiss} />);

    const copyButton = screen.getByTestId("copy-cli-command");
    fireEvent.click(copyButton);

    expect(mockWriteText).toHaveBeenCalledWith("hq auth login");
  });

  it("shows the browser upload option as disabled", () => {
    render(<SetupBanner onDismiss={onDismiss} />);

    const browserOption = screen.getByTestId("browser-upload-option");
    expect(browserOption).toBeTruthy();
    expect((browserOption as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Upload from browser")).toBeTruthy();
  });

  it("renders browser upload option with opacity and cursor styling", () => {
    render(<SetupBanner onDismiss={onDismiss} />);

    const browserOption = screen.getByTestId("browser-upload-option");
    expect(browserOption.className).toContain("opacity-50");
    expect(browserOption.className).toContain("cursor-not-allowed");
  });

  it("calls onDismiss when dismiss button is clicked", () => {
    render(<SetupBanner onDismiss={onDismiss} />);

    const dismissButton = screen.getByTestId("dismiss-setup-banner");
    fireEvent.click(dismissButton);

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("has an accessible dismiss button with aria-label", () => {
    render(<SetupBanner onDismiss={onDismiss} />);

    const dismissButton = screen.getByLabelText("Dismiss setup banner");
    expect(dismissButton).toBeTruthy();
  });

  it("shows description text for CLI sync", () => {
    render(<SetupBanner onDismiss={onDismiss} />);

    expect(
      screen.getByText(/Run this command in your terminal/)
    ).toBeTruthy();
  });
});
