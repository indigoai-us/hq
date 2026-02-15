/**
 * Navigator tree types for HQ Cloud Mobile.
 * Defines the semantic tree structure for the file browser (Navigator screen).
 *
 * The tree is organized semantically:
 * - Companies > Projects > Workers/Knowledge
 * - Standalone Projects > Workers/Knowledge
 *
 * This does NOT mirror the raw filesystem - it's a meaningful grouping
 * of HQ entities with status indicators.
 */

/** Node types map to distinct icons and behaviors in the tree */
export type NavigatorNodeType =
  | "company"
  | "project"
  | "worker"
  | "knowledge"
  | "file";

/** Sync/health status for a node, mapped to colored status dots */
export type NavigatorNodeStatus = "healthy" | "warning" | "error" | "idle";

/** A single node in the semantic tree */
export interface NavigatorNode {
  /** Unique node identifier */
  id: string;
  /** Display name shown in the tree */
  name: string;
  /** Type determines the icon and behavior */
  type: NavigatorNodeType;
  /** Health/sync status shown as a colored dot */
  status: NavigatorNodeStatus;
  /** Child nodes (folders have children, leaves do not) */
  children?: NavigatorNode[];
  /** File path for leaf nodes that can be opened in the viewer */
  filePath?: string;
}

/** Top-level grouping in the tree (Companies, Standalone Projects) */
export interface NavigatorGroup {
  /** Group identifier */
  id: string;
  /** Display name (e.g., "Companies", "Standalone Projects") */
  name: string;
  /** Child nodes within this group */
  children: NavigatorNode[];
}

/** API response shape for the navigator tree */
export interface NavigatorTreeResponse {
  groups: NavigatorGroup[];
}
