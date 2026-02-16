/**
 * Payload manifest types for each transfer type.
 * The manifest is at payload/manifest.yaml inside a transfer bundle.
 */

/** Base fields for all payload manifest items */
export interface ManifestItem {
  /** Path within the payload directory (relative to payload/) */
  path: string;

  /** Human-readable description */
  description: string;

  /** SHA-256 hash of the individual file */
  hash: string;

  /** File size in bytes */
  size: number;
}

/** Knowledge manifest item with additional fields */
export interface KnowledgeManifestItem extends ManifestItem {
  /** Knowledge domain label */
  domain?: string;

  /** Original path in the sender's HQ */
  'source-path'?: string;

  /** File format hint */
  format?: string;
}

/** Knowledge payload manifest */
export interface KnowledgeManifest {
  type: 'knowledge';

  /** Primary knowledge domain */
  domain: string;

  /** Knowledge files in this transfer */
  items: KnowledgeManifestItem[];
}

/** Worker pattern manifest item */
export interface WorkerPatternManifestItem extends ManifestItem {}

/** Worker pattern payload manifest */
export interface WorkerPatternManifest {
  type: 'worker-pattern';

  /** Worker ID this pattern describes */
  'pattern-name': string;

  /** Pattern version */
  'pattern-version': string;

  /** Worker files in this transfer */
  items: WorkerPatternManifestItem[];
}

/** Context payload manifest */
export interface ContextManifest {
  type: 'context';

  /** Project name */
  project: string;

  /** When snapshot was taken (ISO 8601 UTC) */
  'snapshot-at': string;

  /** Context files */
  items: ManifestItem[];
}

/** System payload manifest */
export interface SystemManifest {
  type: 'system';

  /** System sub-type */
  'sub-type': 'ping' | 'pong' | 'manifest-refresh' | 'disconnect' | 'suspend-notice';
}

/** Union of all payload manifest types */
export type PayloadManifest =
  | KnowledgeManifest
  | WorkerPatternManifest
  | ContextManifest
  | SystemManifest;
