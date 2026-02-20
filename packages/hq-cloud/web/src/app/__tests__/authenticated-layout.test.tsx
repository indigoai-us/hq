import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const mockReplace = vi.fn();
const mockPush = vi.fn();
let mockPathname = "/agents";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
  usePathname: () => mockPathname,
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; className?: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

let authState = {
  isAuthenticated: true,
  isLoading: false,
  error: null as string | null,
};
const mockLogout = vi.fn();

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    ...authState,
    login: vi.fn(),
    logout: mockLogout,
    clearError: vi.fn(),
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@/contexts/WebSocketContext", () => ({
  useWebSocket: () => ({
    connectionStatus: "connected",
    isConnected: true,
    reconnect: vi.fn(),
    subscribe: vi.fn(() => vi.fn()),
  }),
  WebSocketProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@clerk/nextjs", () => ({
  UserButton: () => <div data-testid="user-button" />,
}));

vi.mock("@/contexts/NotificationContext", () => ({
  useNotificationContext: () => ({
    permissionGranted: false,
    settings: { enabled: true, questionsEnabled: true, permissionsEnabled: true, statusUpdatesEnabled: false },
    badgeCount: 0,
    updateSettings: vi.fn(),
    updateBadgeCount: vi.fn(),
    requestPermission: vi.fn(),
  }),
  NotificationProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@/hooks/useOnboarding", () => ({
  useOnboarding: () => ({
    isChecking: false,
    isOnboarded: true,
  }),
}));

let mockSetupStatus: {
  isLoading: boolean;
  setupComplete: boolean;
  s3Prefix: string | null;
  fileCount: number;
  recheck: ReturnType<typeof vi.fn>;
} = {
  isLoading: false,
  setupComplete: true,
  s3Prefix: "user_123/hq/",
  fileCount: 100,
  recheck: vi.fn(),
};

vi.mock("@/hooks/useSetupStatus", () => ({
  useSetupStatus: () => mockSetupStatus,
}));

import AuthenticatedLayout from "../(authenticated)/layout";

describe("AuthenticatedLayout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState = { isAuthenticated: true, isLoading: false, error: null };
    mockPathname = "/agents";
    mockSetupStatus = {
      isLoading: false,
      setupComplete: true,
      s3Prefix: "user_123/hq/",
      fileCount: 100,
      recheck: vi.fn(),
    };
    // Clear sessionStorage for setup banner tests
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.clear();
    }
  });

  it("renders children when authenticated", () => {
    render(
      <AuthenticatedLayout>
        <div data-testid="child">Content</div>
      </AuthenticatedLayout>
    );
    expect(screen.getByTestId("child")).toBeTruthy();
  });

  it("shows loading when auth is loading", () => {
    authState = { isAuthenticated: false, isLoading: true, error: null };
    render(
      <AuthenticatedLayout>
        <div>Content</div>
      </AuthenticatedLayout>
    );
    expect(screen.getByText("Loading...")).toBeTruthy();
  });

  it("renders content when not loading (middleware handles auth)", () => {
    authState = { isAuthenticated: false, isLoading: false, error: null };
    render(
      <AuthenticatedLayout>
        <div data-testid="child">Content</div>
      </AuthenticatedLayout>
    );
    // No redirect — middleware protects routes server-side
    expect(mockReplace).not.toHaveBeenCalled();
    expect(screen.getByTestId("child")).toBeTruthy();
  });

  it("renders nav items", () => {
    render(
      <AuthenticatedLayout>
        <div>Content</div>
      </AuthenticatedLayout>
    );
    expect(screen.getAllByText("Sessions").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Navigator").length).toBeGreaterThan(0);
  });

  it("renders mobile header on small screens", () => {
    render(
      <AuthenticatedLayout>
        <div>Content</div>
      </AuthenticatedLayout>
    );
    // The mobile header contains "HQ Cloud" via BrandHeader
    expect(screen.getAllByText(/HQ/).length).toBeGreaterThan(0);
  });

  it("does not show setup banner when setup is complete", () => {
    mockSetupStatus = {
      isLoading: false,
      setupComplete: true,
      s3Prefix: "user_123/hq/",
      fileCount: 100,
      recheck: vi.fn(),
    };
    render(
      <AuthenticatedLayout>
        <div data-testid="child">Content</div>
      </AuthenticatedLayout>
    );
    expect(screen.queryByTestId("setup-banner")).toBeNull();
  });

  it("shows setup banner when setup is not complete", () => {
    mockSetupStatus = {
      isLoading: false,
      setupComplete: false,
      s3Prefix: null,
      fileCount: 0,
      recheck: vi.fn(),
    };
    render(
      <AuthenticatedLayout>
        <div data-testid="child">Content</div>
      </AuthenticatedLayout>
    );
    expect(screen.getByTestId("setup-banner")).toBeTruthy();
    expect(screen.getByText("Sync your HQ files")).toBeTruthy();
  });

  it("does not show setup banner while setup status is loading", () => {
    mockSetupStatus = {
      isLoading: true,
      setupComplete: false,
      s3Prefix: null,
      fileCount: 0,
      recheck: vi.fn(),
    };
    render(
      <AuthenticatedLayout>
        <div data-testid="child">Content</div>
      </AuthenticatedLayout>
    );
    expect(screen.queryByTestId("setup-banner")).toBeNull();
  });

  it("does not show setup banner on setup page", () => {
    mockPathname = "/setup";
    mockSetupStatus = {
      isLoading: false,
      setupComplete: false,
      s3Prefix: null,
      fileCount: 0,
      recheck: vi.fn(),
    };
    render(
      <AuthenticatedLayout>
        <div data-testid="child">Content</div>
      </AuthenticatedLayout>
    );
    // Setup page renders children directly (no sidebar/banner)
    expect(screen.queryByTestId("setup-banner")).toBeNull();
  });
});
