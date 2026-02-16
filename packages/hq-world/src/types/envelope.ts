/**
 * World Protocol Transfer Envelope types.
 * Every transfer is wrapped in an envelope — metadata describing the transfer
 * without revealing payload contents.
 */

/** Transfer types supported by the World Protocol v1 */
export type TransferType = 'knowledge' | 'worker-pattern' | 'context' | 'system';

/** Transport mechanisms */
export type TransportType = 'file' | 'git' | 'http' | 'hiamp';

/**
 * Transfer envelope — the shipping label on every transfer.
 * Stored as envelope.yaml at the root of a transfer bundle.
 */
export interface TransferEnvelope {
  /** Unique transfer identifier: txfr-{12+ hex chars} */
  id: string;

  /** Transfer type — determines payload structure */
  type: TransferType;

  /** Sender HQ owner name */
  from: string;

  /** Recipient HQ owner name */
  to: string;

  /** When this transfer was created (ISO 8601 UTC) */
  timestamp: string;

  /** World Protocol version (v1 for this implementation) */
  version: string;

  /** Human-readable summary (max 1024 chars) */
  description?: string;

  /** SHA-256 hash of the payload (deterministic aggregate) */
  'payload-hash': string;

  /** Total payload size in bytes */
  'payload-size': number;

  /** ID of the transfer this replaces, or null for first transfer */
  supersedes: string | null;

  /** Position in a transfer chain (>= 1) */
  sequence: number;

  /** Transport mechanism used for delivery */
  transport: TransportType;
}

/** Envelope YAML structure as stored on disk (nested under 'envelope' key) */
export interface EnvelopeDocument {
  envelope: TransferEnvelope;
}
