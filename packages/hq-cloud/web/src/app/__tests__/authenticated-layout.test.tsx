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

import AuthenticatedLayout from "../(authenticated)/layout";

describe("AuthenticatedLayout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState = { isAuthenticated: true, isLoading: false, error: null };
    mockPathname = "/agents";
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
});
