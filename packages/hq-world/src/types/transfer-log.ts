/**
 * Transfer log types.
 * Transfer logs are daily YAML files at workspace/world/transfers/{date}.yaml
 * recording all transfer activity.
 */

/** Event types for transfer log entries */
export type TransferEventType =
  | 'sent'
  | 'received'
  | 'verified'
  | 'staged'
  | 'approved'
  | 'rejected'
  | 'quarantined'
  | 'integrated'
  | 'auto-approved'
  | 'rollback'
  | 'connection-activated'
  | 'connection-suspended'
  | 'connection-disconnected'
  | 'trust-upgraded'
  | 'trust-downgraded'
  | 'manifest-refreshed';

/** A single transfer log entry */
export interface TransferLogEntry {
  /** Transfer ID (null for connection events) */
  id: string | null;

  /** Event type */
  event: TransferEventType;

  /** When this event occurred (ISO 8601 UTC) */
  timestamp: string;

  /** Transfer direction */
  direction?: 'inbound' | 'outbound';

  /** Transfer type */
  type?: string;

  /** Sender owner name */
  from?: string;

  /** Receiver owner name */
  to?: string;

  /** Peer owner (for connection events) */
  peer?: string;

  /** Additional event-specific fields */
  [key: string]: unknown;
}

/** Daily transfer log file structure */
export interface TransferLogFile {
  transfers: TransferLogEntry[];
}
