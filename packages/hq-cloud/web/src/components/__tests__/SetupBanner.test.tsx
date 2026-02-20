import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SetupBanner } from "../SetupBanner";

// Mock clipboard API using defineProperty since clipboard is a getter
const mockWriteText = vi.fn().mockResolvedValue(undefined);
Object.defineProperty(navigator, "clipboard", {
  value: { writeText: mockWriteText },
  writable: true,
  configurable: true,
});

// Mock the settings service
const mockUpdateSettings = vi.fn();
vi.mock("@/services/settings", () => ({
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  updateSettings: (...args: unknown[]) => mockUpdateSettings(...args),
}));

describe("SetupBanner", () => {
  let onDismiss: ReturnType<typeof vi.fn>;
  let onHqRootSaved: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    onDismiss = vi.fn();
    onHqRootSaved = vi.fn();
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

  // HQ Root Input tests

  it("shows HQ Location section with input field when no hqRoot provided", () => {
    render(<SetupBanner onDismiss={onDismiss} />);

    expect(screen.getByText("HQ Location")).toBeTruthy();
    const input = screen.getByTestId("hq-root-input");
    expect(input).toBeTruthy();
    expect((input as HTMLInputElement).value).toBe("");
    expect((input as HTMLInputElement).placeholder).toBe("C:\\hq or /home/user/hq");
  });

  it("shows Save & Continue button", () => {
    render(<SetupBanner onDismiss={onDismiss} />);

    const saveButton = screen.getByTestId("save-hq-root");
    expect(saveButton).toBeTruthy();
    expect(saveButton.textContent).toBe("Save & Continue");
  });

  it("shows validation error when saving with empty input", async () => {
    render(<SetupBanner onDismiss={onDismiss} />);

    const saveButton = screen.getByTestId("save-hq-root");
    fireEvent.click(saveButton);

    expect(screen.getByTestId("hq-root-error")).toBeTruthy();
    expect(screen.getByText("Please enter your HQ directory path.")).toBeTruthy();
    expect(mockUpdateSettings).not.toHaveBeenCalled();
  });

  it("calls updateSettings with hqRoot value on save", async () => {
    mockUpdateSettings.mockResolvedValue({});
    render(<SetupBanner onDismiss={onDismiss} onHqRootSaved={onHqRootSaved} />);

    const input = screen.getByTestId("hq-root-input");
    fireEvent.change(input, { target: { value: "C:\\hq" } });

    const saveButton = screen.getByTestId("save-hq-root");
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockUpdateSettings).toHaveBeenCalledWith({ hqRoot: "C:\\hq" });
    });
  });

  it("shows success message after saving hqRoot", async () => {
    mockUpdateSettings.mockResolvedValue({});
    render(<SetupBanner onDismiss={onDismiss} onHqRootSaved={onHqRootSaved} />);

    const input = screen.getByTestId("hq-root-input");
    fireEvent.change(input, { target: { value: "/home/user/hq" } });

    const saveButton = screen.getByTestId("save-hq-root");
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(screen.getByTestId("hq-root-success")).toBeTruthy();
    });

    expect(
      screen.getByText(/HQ location saved/)
    ).toBeTruthy();
  });

  it("calls onHqRootSaved callback after successful save", async () => {
    mockUpdateSettings.mockResolvedValue({});
    render(<SetupBanner onDismiss={onDismiss} onHqRootSaved={onHqRootSaved} />);

    const input = screen.getByTestId("hq-root-input");
    fireEvent.change(input, { target: { value: "C:\\hq" } });

    const saveButton = screen.getByTestId("save-hq-root");
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(onHqRootSaved).toHaveBeenCalledTimes(1);
    });
  });

  it("shows error message when save fails", async () => {
    mockUpdateSettings.mockRejectedValue(new Error("Server error"));
    render(<SetupBanner onDismiss={onDismiss} />);

    const input = screen.getByTestId("hq-root-input");
    fireEvent.change(input, { target: { value: "C:\\hq" } });

    const saveButton = screen.getByTestId("save-hq-root");
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(screen.getByTestId("hq-root-error")).toBeTruthy();
    });

    expect(screen.getByText("Server error")).toBeTruthy();
  });

  it("shows Saving... text while save is in progress", async () => {
    let resolvePromise: (value: unknown) => void;
    mockUpdateSettings.mockReturnValue(
      new Promise((resolve) => {
        resolvePromise = resolve;
      })
    );

    render(<SetupBanner onDismiss={onDismiss} />);

    const input = screen.getByTestId("hq-root-input");
    fireEvent.change(input, { target: { value: "C:\\hq" } });

    const saveButton = screen.getByTestId("save-hq-root");
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(saveButton.textContent).toBe("Saving...");
    });

    // Resolve the promise to clean up
    resolvePromise!({});

    await waitFor(() => {
      expect(screen.getByTestId("hq-root-success")).toBeTruthy();
    });
  });

  it("pre-fills input and shows display mode when hqRoot is provided", () => {
    render(<SetupBanner onDismiss={onDismiss} hqRoot="/home/user/hq" />);

    // Should show the path in display mode, not the input
    expect(screen.getByTestId("hq-root-display")).toBeTruthy();
    expect(screen.getByTestId("hq-root-display").textContent).toBe("/home/user/hq");
    expect(screen.queryByTestId("hq-root-input")).toBeNull();
  });

  it("shows Edit button when hqRoot is set", () => {
    render(<SetupBanner onDismiss={onDismiss} hqRoot="/home/user/hq" />);

    const editButton = screen.getByTestId("edit-hq-root");
    expect(editButton).toBeTruthy();
    expect(editButton.textContent).toBe("Edit");
  });

  it("switches to edit mode when Edit button is clicked", () => {
    render(<SetupBanner onDismiss={onDismiss} hqRoot="/home/user/hq" />);

    const editButton = screen.getByTestId("edit-hq-root");
    fireEvent.click(editButton);

    // Should now show the input pre-filled
    const input = screen.getByTestId("hq-root-input");
    expect(input).toBeTruthy();
    expect((input as HTMLInputElement).value).toBe("/home/user/hq");
    expect(screen.queryByTestId("hq-root-display")).toBeNull();
  });

  it("trims whitespace from input before saving", async () => {
    mockUpdateSettings.mockResolvedValue({});
    render(<SetupBanner onDismiss={onDismiss} />);

    const input = screen.getByTestId("hq-root-input");
    fireEvent.change(input, { target: { value: "  C:\\hq  " } });

    const saveButton = screen.getByTestId("save-hq-root");
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockUpdateSettings).toHaveBeenCalledWith({ hqRoot: "C:\\hq" });
    });
  });
});
