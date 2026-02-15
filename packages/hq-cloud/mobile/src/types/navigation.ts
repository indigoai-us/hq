/**
 * Navigation types for HQ Cloud Mobile.
 * Defines the navigation structure and route params.
 */

export type RootTabParamList = {
  Agents: undefined;
  Navigator: undefined;
};

export type AgentsStackParamList = {
  AgentsList: undefined;
  AgentDetail: { agentId: string };
  NotificationSettings: undefined;
  SpawnWorker: undefined;
};

export type NavigatorStackParamList = {
  FileBrowser: undefined;
  FileViewer: { filePath: string };
};
