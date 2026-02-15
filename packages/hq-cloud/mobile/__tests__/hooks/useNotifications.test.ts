/**
 * Tests for useNotifications hook.
 * Verifies toggle behaviors, badge management, and permission flow.
 */
import { renderHook, act } from "@testing-library/react-native";
import { useNotifications } from "../../src/hooks/useNotifications";
import type { NotificationSettings } from "../../src/types/notification";
import { DEFAULT_NOTIFICATION_SETTINGS } from "../../src/types/notification";

// Mock state for the notification context
const mockSettings: NotificationSettings = { ...DEFAULT_NOTIFICATION_SETTINGS };
const mockUpdateSettings = jest.fn().mockResolvedValue(undefined);
const mockUpdateBadgeCount = jest.fn().mockResolvedValue(undefined);
const mockRequestPermission = jest.fn().mockResolvedValue(true);

jest.mock("../../src/contexts/NotificationContext", () => ({
  useNotificationContext: jest.fn(() => ({
    pushToken: "ExponentPushToken[mock]",
    permissionGranted: true,
    settings: mockSettings,
    badgeCount: 0,
    updateSettings: mockUpdateSettings,
    updateBadgeCount: mockUpdateBadgeCount,
    requestPermission: mockRequestPermission,
    setNavigator: jest.fn(),
  })),
}));

describe("useNotifications", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset mock settings to defaults
    Object.assign(mockSettings, DEFAULT_NOTIFICATION_SETTINGS);
  });

  it("should expose push token and permission state", () => {
    const { result } = renderHook(() => useNotifications());

    expect(result.current.pushToken).toBe("ExponentPushToken[mock]");
    expect(result.current.permissionGranted).toBe(true);
  });

  it("should expose notification settings", () => {
    const { result } = renderHook(() => useNotifications());

    expect(result.current.settings).toEqual(DEFAULT_NOTIFICATION_SETTINGS);
  });

  it("should expose badge count", () => {
    const { result } = renderHook(() => useNotifications());

    expect(result.current.badgeCount).toBe(0);
  });

  describe("toggleEnabled", () => {
    it("should toggle enabled setting", async () => {
      mockSettings.enabled = true;
      const { result } = renderHook(() => useNotifications());

      await act(async () => {
        await result.current.toggleEnabled();
      });

      expect(mockUpdateSettings).toHaveBeenCalledWith({ enabled: false });
    });

    it("should request permission when enabling without permission", async () => {
      // Override mock to simulate no permission
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { useNotificationContext } = require("../../src/contexts/NotificationContext");
      (useNotificationContext as jest.Mock).mockReturnValue({
        pushToken: null,
        permissionGranted: false,
        settings: { ...DEFAULT_NOTIFICATION_SETTINGS, enabled: false },
        badgeCount: 0,
        updateSettings: mockUpdateSettings,
        updateBadgeCount: mockUpdateBadgeCount,
        requestPermission: mockRequestPermission,
        setNavigator: jest.fn(),
      });

      const { result } = renderHook(() => useNotifications());

      await act(async () => {
        await result.current.toggleEnabled();
      });

      expect(mockRequestPermission).toHaveBeenCalled();
    });
  });

  describe("toggleQuestions", () => {
    it("should toggle questions enabled", async () => {
      mockSettings.questionsEnabled = true;
      const { result } = renderHook(() => useNotifications());

      await act(async () => {
        await result.current.toggleQuestions();
      });

      expect(mockUpdateSettings).toHaveBeenCalledWith({ questionsEnabled: false });
    });
  });

  describe("togglePermissions", () => {
    it("should toggle permissions enabled", async () => {
      mockSettings.permissionsEnabled = true;
      const { result } = renderHook(() => useNotifications());

      await act(async () => {
        await result.current.togglePermissions();
      });

      expect(mockUpdateSettings).toHaveBeenCalledWith({ permissionsEnabled: false });
    });
  });

  describe("toggleStatusUpdates", () => {
    it("should toggle status updates enabled", async () => {
      mockSettings.statusUpdatesEnabled = false;
      const { result } = renderHook(() => useNotifications());

      await act(async () => {
        await result.current.toggleStatusUpdates();
      });

      expect(mockUpdateSettings).toHaveBeenCalledWith({ statusUpdatesEnabled: true });
    });
  });

  describe("updateBadgeCount", () => {
    it("should update badge count", () => {
      const { result } = renderHook(() => useNotifications());

      act(() => {
        result.current.updateBadgeCount(5);
      });

      expect(mockUpdateBadgeCount).toHaveBeenCalledWith(5);
    });
  });
});
