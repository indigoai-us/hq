/**
 * Tests for NotificationSettingsScreen.
 * Verifies settings display, toggle interactions, and permission handling.
 */
import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { NotificationSettingsScreen } from "../../src/screens/NotificationSettingsScreen";
import { DEFAULT_NOTIFICATION_SETTINGS } from "../../src/types/notification";

// Mock the useNotifications hook
const mockToggleEnabled = jest.fn().mockResolvedValue(undefined);
const mockToggleQuestions = jest.fn().mockResolvedValue(undefined);
const mockTogglePermissions = jest.fn().mockResolvedValue(undefined);
const mockToggleStatusUpdates = jest.fn().mockResolvedValue(undefined);
const mockRequestPermission = jest.fn().mockResolvedValue(true);

let mockPermissionGranted = true;
let mockSettings = { ...DEFAULT_NOTIFICATION_SETTINGS };

jest.mock("../../src/hooks/useNotifications", () => ({
  useNotifications: jest.fn(() => ({
    pushToken: "ExponentPushToken[test]",
    permissionGranted: mockPermissionGranted,
    settings: mockSettings,
    badgeCount: 0,
    updateSettings: jest.fn(),
    updateBadgeCount: jest.fn(),
    requestPermission: mockRequestPermission,
    toggleEnabled: mockToggleEnabled,
    toggleQuestions: mockToggleQuestions,
    togglePermissions: mockTogglePermissions,
    toggleStatusUpdates: mockToggleStatusUpdates,
  })),
}));

// Mock Linking for system settings
jest.mock("react-native/Libraries/Linking/Linking", () => ({
  openSettings: jest.fn(),
}));

describe("NotificationSettingsScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPermissionGranted = true;
    mockSettings = { ...DEFAULT_NOTIFICATION_SETTINGS };
  });

  it("should render the NOTIFICATIONS section header", () => {
    const { getByText } = render(<NotificationSettingsScreen />);
    expect(getByText("NOTIFICATIONS")).toBeTruthy();
  });

  it("should render the CATEGORIES section header", () => {
    const { getByText } = render(<NotificationSettingsScreen />);
    expect(getByText("CATEGORIES")).toBeTruthy();
  });

  it("should render Push Notifications toggle", () => {
    const { getByText } = render(<NotificationSettingsScreen />);
    expect(getByText("Push Notifications")).toBeTruthy();
  });

  it("should render Questions toggle", () => {
    const { getByText } = render(<NotificationSettingsScreen />);
    expect(getByText("Questions")).toBeTruthy();
  });

  it("should render Permission Requests toggle", () => {
    const { getByText } = render(<NotificationSettingsScreen />);
    expect(getByText("Permission Requests")).toBeTruthy();
  });

  it("should render Status Updates toggle", () => {
    const { getByText } = render(<NotificationSettingsScreen />);
    expect(getByText("Status Updates")).toBeTruthy();
  });

  it("should render Open Device Settings button", () => {
    const { getByText } = render(<NotificationSettingsScreen />);
    expect(getByText("Open Device Settings")).toBeTruthy();
  });

  it("should call toggleEnabled when Push Notifications is toggled", async () => {
    const { getByLabelText } = render(<NotificationSettingsScreen />);
    const toggle = getByLabelText("Push Notifications toggle");

    fireEvent(toggle, "onValueChange", false);

    await waitFor(() => {
      expect(mockToggleEnabled).toHaveBeenCalled();
    });
  });

  it("should call toggleQuestions when Questions is toggled", async () => {
    const { getByLabelText } = render(<NotificationSettingsScreen />);
    const toggle = getByLabelText("Questions toggle");

    fireEvent(toggle, "onValueChange", false);

    await waitFor(() => {
      expect(mockToggleQuestions).toHaveBeenCalled();
    });
  });

  it("should call togglePermissions when Permission Requests is toggled", async () => {
    const { getByLabelText } = render(<NotificationSettingsScreen />);
    const toggle = getByLabelText("Permission Requests toggle");

    fireEvent(toggle, "onValueChange", false);

    await waitFor(() => {
      expect(mockTogglePermissions).toHaveBeenCalled();
    });
  });

  it("should call toggleStatusUpdates when Status Updates is toggled", async () => {
    const { getByLabelText } = render(<NotificationSettingsScreen />);
    const toggle = getByLabelText("Status Updates toggle");

    fireEvent(toggle, "onValueChange", true);

    await waitFor(() => {
      expect(mockToggleStatusUpdates).toHaveBeenCalled();
    });
  });

  it("should show permission banner when notifications not granted", () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { useNotifications } = require("../../src/hooks/useNotifications");
    (useNotifications as jest.Mock).mockReturnValueOnce({
      pushToken: null,
      permissionGranted: false,
      settings: mockSettings,
      badgeCount: 0,
      updateSettings: jest.fn(),
      updateBadgeCount: jest.fn(),
      requestPermission: mockRequestPermission,
      toggleEnabled: mockToggleEnabled,
      toggleQuestions: mockToggleQuestions,
      togglePermissions: mockTogglePermissions,
      toggleStatusUpdates: mockToggleStatusUpdates,
    });

    const { getByText } = render(<NotificationSettingsScreen />);
    expect(getByText("Notifications are disabled")).toBeTruthy();
    expect(getByText("Enable Notifications")).toBeTruthy();
  });

  it("should not show permission banner when notifications are granted", () => {
    // Default mock has permissionGranted: true
    const { queryByText } = render(<NotificationSettingsScreen />);
    expect(queryByText("Notifications are disabled")).toBeNull();
  });

  it("should render setting descriptions", () => {
    const { getByText } = render(<NotificationSettingsScreen />);
    expect(getByText("Receive alerts when workers need your attention")).toBeTruthy();
    expect(getByText("When a worker asks you a question")).toBeTruthy();
    expect(getByText("When a worker needs approval to use a tool")).toBeTruthy();
    expect(getByText("When a worker completes or encounters an error")).toBeTruthy();
  });

  it("should render footnote text", () => {
    const { getByText } = render(<NotificationSettingsScreen />);
    expect(
      getByText("Manage notification sounds, badges, and banners in your device settings."),
    ).toBeTruthy();
  });
});
