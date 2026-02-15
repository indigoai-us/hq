/**
 * Service exports for HQ Cloud Mobile.
 */
export {
  getApiKey,
  setApiKey,
  removeApiKey,
  getApiUrl,
  setApiUrl,
  apiRequest,
} from "./api";

export {
  hasStoredApiKey,
  validateApiKey,
  login,
  logout,
  tryAutoLogin,
} from "./auth";
export type { AuthState, ValidateKeyResponse } from "./auth";

export {
  fetchAgents,
  fetchAgent,
  fetchAgentMessages,
  answerQuestion,
  respondToPermission,
  sendGlobalMessage,
} from "./agents";

export { fetchNavigatorTree } from "./navigator";

export { fetchFileContent } from "./files";
export type { FileContentResponse } from "./files";

export { WebSocketService } from "./websocket";

export { fetchWorkers, spawnWorker } from "./workers";

export {
  configureNotificationHandler,
  registerForPushNotifications,
  registerPushToken,
  unregisterPushToken,
  updateNotificationSettings,
  fetchNotificationSettings,
  setBadgeCount,
  clearBadgeCount,
  getBadgeCount,
  parseNotificationData,
  dismissAllNotifications,
} from "./notifications";
