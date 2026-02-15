/**
 * Tests for push notification service.
 * Verifies registration, permission requests, badge management,
 * token registration, and notification data parsing.
 */
import * as Notifications from "expo-notifications";
import {
  configureNotificationHandler,
  registerForPushNotifications,
  registerPushToken,
  unregisterPushToken,
  setBadgeCount,
  clearBadgeCount,
  getBadgeCount,
  parseNotificationData,
  dismissAllNotifications,
  updateNotificationSettings,
  fetchNotificationSettings,
} from "../../src/services/notifications";

// Mock the API service
jest.mock("../../src/services/api", () => ({
  apiRequest: jest.fn(),
}));

import { apiRequest } from "../../src/services/api";
const mockApiRequest = apiRequest as jest.MockedFunction<typeof apiRequest>;

const mockGetPermissionsAsync = Notifications.getPermissionsAsync as jest.MockedFunction<
  typeof Notifications.getPermissionsAsync
>;
const mockRequestPermissionsAsync = Notifications.requestPermissionsAsync as jest.MockedFunction<
  typeof Notifications.requestPermissionsAsync
>;
const mockGetExpoPushTokenAsync = Notifications.getExpoPushTokenAsync as jest.MockedFunction<
  typeof Notifications.getExpoPushTokenAsync
>;
const mockSetBadgeCountAsync = Notifications.setBadgeCountAsync as jest.MockedFunction<
  typeof Notifications.setBadgeCountAsync
>;
const mockGetBadgeCountAsync = Notifications.getBadgeCountAsync as jest.MockedFunction<
  typeof Notifications.getBadgeCountAsync
>;

describe("notifications service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("configureNotificationHandler", () => {
    it("should call setNotificationHandler", () => {
      configureNotificationHandler();
      expect(Notifications.setNotificationHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          handleNotification: expect.any(Function),
        }),
      );
    });

    it("should configure to show alert, sound, and badge", async () => {
      configureNotificationHandler();
      const call = (Notifications.setNotificationHandler as jest.Mock).mock.calls[0][0];
      const result = await call.handleNotification();
      expect(result).toEqual({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      });
    });
  });

  describe("registerForPushNotifications", () => {
    it("should return null on non-physical device", async () => {
      // Re-mock expo-device with isDevice = false for this test only
      jest.doMock("expo-device", () => ({
        isDevice: false,
        deviceName: "Test Device",
      }));

      // Re-require to pick up the new mock
      jest.resetModules();
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { registerForPushNotifications: regFn } = require("../../src/services/notifications");
      const token = await regFn();
      expect(token).toBeNull();

      // Restore original mock
      jest.doMock("expo-device", () => ({
        isDevice: true,
        deviceName: "Test Device",
      }));
    });

    it("should return token when permissions are already granted", async () => {
      mockGetPermissionsAsync.mockResolvedValue({ status: "granted" } as never);
      mockGetExpoPushTokenAsync.mockResolvedValue({
        data: "ExponentPushToken[abc123]",
      } as never);

      const token = await registerForPushNotifications();
      expect(token).toBe("ExponentPushToken[abc123]");
      expect(mockRequestPermissionsAsync).not.toHaveBeenCalled();
    });

    it("should request permissions if not already granted", async () => {
      mockGetPermissionsAsync.mockResolvedValue({ status: "undetermined" } as never);
      mockRequestPermissionsAsync.mockResolvedValue({ status: "granted" } as never);
      mockGetExpoPushTokenAsync.mockResolvedValue({
        data: "ExponentPushToken[xyz789]",
      } as never);

      const token = await registerForPushNotifications();
      expect(token).toBe("ExponentPushToken[xyz789]");
      expect(mockRequestPermissionsAsync).toHaveBeenCalled();
    });

    it("should return null when permissions are denied", async () => {
      mockGetPermissionsAsync.mockResolvedValue({ status: "undetermined" } as never);
      mockRequestPermissionsAsync.mockResolvedValue({ status: "denied" } as never);

      const token = await registerForPushNotifications();
      expect(token).toBeNull();
    });
  });

  describe("registerPushToken", () => {
    it("should send token to API", async () => {
      mockApiRequest.mockResolvedValue(undefined);

      await registerPushToken("ExponentPushToken[abc]");
      expect(mockApiRequest).toHaveBeenCalledWith("/api/notifications/register", {
        method: "POST",
        body: expect.objectContaining({
          token: "ExponentPushToken[abc]",
          platform: expect.any(String),
        }),
      });
    });
  });

  describe("unregisterPushToken", () => {
    it("should send unregister request to API", async () => {
      mockApiRequest.mockResolvedValue(undefined);

      await unregisterPushToken("ExponentPushToken[abc]");
      expect(mockApiRequest).toHaveBeenCalledWith("/api/notifications/unregister", {
        method: "POST",
        body: { token: "ExponentPushToken[abc]" },
      });
    });
  });

  describe("badge management", () => {
    it("should set badge count", async () => {
      await setBadgeCount(5);
      expect(mockSetBadgeCountAsync).toHaveBeenCalledWith(5);
    });

    it("should clear badge count", async () => {
      await clearBadgeCount();
      expect(mockSetBadgeCountAsync).toHaveBeenCalledWith(0);
    });

    it("should get badge count", async () => {
      mockGetBadgeCountAsync.mockResolvedValue(3);
      const count = await getBadgeCount();
      expect(count).toBe(3);
    });
  });

  describe("parseNotificationData", () => {
    it("should parse valid notification data", () => {
      const notification = {
        request: {
          content: {
            data: {
              category: "agent_question",
              agentId: "agent-1",
              agentName: "Content Planner",
              questionId: "q-1",
            },
          },
        },
      } as unknown as Notifications.Notification;

      const data = parseNotificationData(notification);
      expect(data).toEqual({
        category: "agent_question",
        agentId: "agent-1",
        agentName: "Content Planner",
        questionId: "q-1",
        permissionId: undefined,
      });
    });

    it("should return null for missing data", () => {
      const notification = {
        request: {
          content: {
            data: undefined,
          },
        },
      } as unknown as Notifications.Notification;

      const data = parseNotificationData(notification);
      expect(data).toBeNull();
    });

    it("should return null for invalid data (missing category)", () => {
      const notification = {
        request: {
          content: {
            data: { agentId: "a-1" },
          },
        },
      } as unknown as Notifications.Notification;

      const data = parseNotificationData(notification);
      expect(data).toBeNull();
    });

    it("should return null for invalid data (missing agentId)", () => {
      const notification = {
        request: {
          content: {
            data: { category: "agent_question" },
          },
        },
      } as unknown as Notifications.Notification;

      const data = parseNotificationData(notification);
      expect(data).toBeNull();
    });

    it("should default agentName to 'Agent' when not provided", () => {
      const notification = {
        request: {
          content: {
            data: {
              category: "agent_permission",
              agentId: "a-1",
            },
          },
        },
      } as unknown as Notifications.Notification;

      const data = parseNotificationData(notification);
      expect(data?.agentName).toBe("Agent");
    });
  });

  describe("dismissAllNotifications", () => {
    it("should dismiss all notifications", async () => {
      await dismissAllNotifications();
      expect(Notifications.dismissAllNotificationsAsync).toHaveBeenCalled();
    });
  });

  describe("notification settings", () => {
    it("should update settings via API", async () => {
      mockApiRequest.mockResolvedValue(undefined);

      const settings = {
        enabled: true,
        questionsEnabled: true,
        permissionsEnabled: false,
        statusUpdatesEnabled: false,
      };

      await updateNotificationSettings(settings);
      expect(mockApiRequest).toHaveBeenCalledWith("/api/notifications/settings", {
        method: "PUT",
        body: settings,
      });
    });

    it("should fetch settings from API", async () => {
      const settings = {
        enabled: true,
        questionsEnabled: true,
        permissionsEnabled: true,
        statusUpdatesEnabled: false,
      };
      mockApiRequest.mockResolvedValue(settings);

      const result = await fetchNotificationSettings();
      expect(result).toEqual(settings);
      expect(mockApiRequest).toHaveBeenCalledWith("/api/notifications/settings");
    });
  });
});
