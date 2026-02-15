import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { OnboardingCard } from "../OnboardingCard";

// Mock next/link as a simple anchor
vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [key: string]: unknown }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// Mock services
const mockFetchClaudeTokenStatus = vi.fn();
const mockFetchFileCount = vi.fn();

vi.mock("@/services/settings", () => ({
  fetchClaudeTokenStatus: (...args: unknown[]) => mockFetchClaudeTokenStatus(...args),
}));

vi.mock("@/services/files", () => ({
  fetchFileCount: (...args: unknown[]) => mockFetchFileCount(...args),
}));

describe("OnboardingCard", () => {
  let onDismiss: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    onDismiss = vi.fn();
    mockFetchClaudeTokenStatus.mockResolvedValue({ hasToken: false, setAt: null });
    mockFetchFileCount.mockResolvedValue(0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the onboarding card with welcome header", async () => {
    render(<OnboardingCard onDismiss={onDismiss} />);

    await waitFor(() => {
      expect(screen.getByText("Welcome to HQ Cloud")).toBeTruthy();
    });
  });

  it("shows loading state initially", () => {
    // Keep the promises pending
    mockFetchClaudeTokenStatus.mockReturnValue(new Promise(() => {}));
    mockFetchFileCount.mockReturnValue(new Promise(() => {}));

    render(<OnboardingCard onDismiss={onDismiss} />);
    expect(screen.getByText("Checking setup...")).toBeTruthy();
  });

  it("always shows step 1 (account) as complete", async () => {
    render(<OnboardingCard onDismiss={onDismiss} />);

    await waitFor(() => {
      expect(screen.getByText("Account created")).toBeTruthy();
    });

    expect(screen.getByText("Signed in via Clerk")).toBeTruthy();
  });

  it("shows Claude token step as incomplete when no token", async () => {
    mockFetchClaudeTokenStatus.mockResolvedValue({ hasToken: false, setAt: null });

    render(<OnboardingCard onDismiss={onDismiss} />);

    await waitFor(() => {
      expect(screen.getByText("Claude token stored")).toBeTruthy();
    });

    expect(screen.getByText("Add Claude token")).toBeTruthy();
  });

  it("shows Claude token step as complete when token exists", async () => {
    mockFetchClaudeTokenStatus.mockResolvedValue({
      hasToken: true,
      setAt: "2026-01-15T00:00:00.000Z",
    });

    render(<OnboardingCard onDismiss={onDismiss} />);

    await waitFor(() => {
      expect(screen.getByText("Token configured")).toBeTruthy();
    });
  });

  it("links to /settings/claude-token for token setup", async () => {
    mockFetchClaudeTokenStatus.mockResolvedValue({ hasToken: false, setAt: null });

    render(<OnboardingCard onDismiss={onDismiss} />);

    await waitFor(() => {
      const link = screen.getByText("Add Claude token");
      expect(link.closest("a")).toBeTruthy();
      expect(link.closest("a")?.getAttribute("href")).toBe("/settings/claude-token");
    });
  });

  it("shows files step as incomplete when fileCount is 0", async () => {
    mockFetchFileCount.mockResolvedValue(0);

    render(<OnboardingCard onDismiss={onDismiss} />);

    await waitFor(() => {
      expect(screen.getByText("HQ files synced")).toBeTruthy();
    });

    expect(
      screen.getByText("0 files \u2014 run setup to sync your HQ directory"),
    ).toBeTruthy();
  });

  it("shows files step as complete with file count", async () => {
    mockFetchClaudeTokenStatus.mockResolvedValue({ hasToken: false, setAt: null });
    mockFetchFileCount.mockResolvedValue(42);

    render(<OnboardingCard onDismiss={onDismiss} />);

    await waitFor(() => {
      expect(screen.getByText("42 files uploaded")).toBeTruthy();
    });
  });

  it("shows singular 'file' for count of 1", async () => {
    mockFetchClaudeTokenStatus.mockResolvedValue({ hasToken: false, setAt: null });
    mockFetchFileCount.mockResolvedValue(1);

    render(<OnboardingCard onDismiss={onDismiss} />);

    await waitFor(() => {
      expect(screen.getByText("1 file uploaded")).toBeTruthy();
    });
  });

  it("shows skip setup link", async () => {
    render(<OnboardingCard onDismiss={onDismiss} />);

    await waitFor(() => {
      expect(screen.getByTestId("skip-setup")).toBeTruthy();
    });

    expect(screen.getByText("Skip setup")).toBeTruthy();
  });

  it("calls onDismiss when skip setup is clicked", async () => {
    render(<OnboardingCard onDismiss={onDismiss} />);

    await waitFor(() => {
      expect(screen.getByTestId("skip-setup")).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("skip-setup"));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("shows all-set state when all steps complete", async () => {
    mockFetchClaudeTokenStatus.mockResolvedValue({
      hasToken: true,
      setAt: "2026-01-15T00:00:00.000Z",
    });
    mockFetchFileCount.mockResolvedValue(10);

    render(<OnboardingCard onDismiss={onDismiss} />);

    await waitFor(() => {
      expect(
        screen.getByText((text) => text.includes("All set")),
      ).toBeTruthy();
    });
  });

  it("auto-dismisses after 2 seconds when all steps complete", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    mockFetchClaudeTokenStatus.mockResolvedValue({
      hasToken: true,
      setAt: "2026-01-15T00:00:00.000Z",
    });
    mockFetchFileCount.mockResolvedValue(10);

    render(<OnboardingCard onDismiss={onDismiss} />);

    // Wait for data to load and "all set" to appear
    await waitFor(() => {
      expect(
        screen.getByText((text) => text.includes("All set")),
      ).toBeTruthy();
    });

    expect(onDismiss).not.toHaveBeenCalled();

    // Advance timer past the 2s auto-dismiss
    await act(() => {
      vi.advanceTimersByTime(2100);
    });

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("shows dismiss button in all-set state", async () => {
    mockFetchClaudeTokenStatus.mockResolvedValue({
      hasToken: true,
      setAt: "2026-01-15T00:00:00.000Z",
    });
    mockFetchFileCount.mockResolvedValue(10);

    render(<OnboardingCard onDismiss={onDismiss} />);

    await waitFor(() => {
      expect(screen.getByText("Dismiss")).toBeTruthy();
    });

    fireEvent.click(screen.getByText("Dismiss"));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("handles API errors gracefully", async () => {
    mockFetchClaudeTokenStatus.mockRejectedValue(new Error("Network error"));
    mockFetchFileCount.mockRejectedValue(new Error("Network error"));

    render(<OnboardingCard onDismiss={onDismiss} />);

    // Should still render the card with default (incomplete) values
    await waitFor(() => {
      expect(screen.getByText("Welcome to HQ Cloud")).toBeTruthy();
    });
  });

  it("has the correct data-testid attributes", async () => {
    render(<OnboardingCard onDismiss={onDismiss} />);

    await waitFor(() => {
      expect(screen.getByTestId("onboarding-card")).toBeTruthy();
    });

    expect(screen.getByTestId("step-account")).toBeTruthy();
    expect(screen.getByTestId("step-claude-token")).toBeTruthy();
    expect(screen.getByTestId("step-files")).toBeTruthy();
  });
});
