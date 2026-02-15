export type NavigatorNodeType = "company" | "project" | "worker" | "knowledge" | "file";

export type NavigatorNodeStatus = "healthy" | "warning" | "error" | "idle";

export interface NavigatorNode {
  id: string;
  name: string;
  type: NavigatorNodeType;
  status: NavigatorNodeStatus;
  children?: NavigatorNode[];
  filePath?: string;
}

export interface NavigatorGroup {
  id: string;
  name: string;
  children: NavigatorNode[];
}

export interface NavigatorTreeResponse {
  groups: NavigatorGroup[];
}
