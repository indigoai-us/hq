/**
 * Provenance and adaptation metadata types.
 * These describe the origin and history of transferred content,
 * and how worker patterns should be adapted by receivers.
 */

/** A single history event in a provenance record */
export interface ProvenanceEvent {
  /** Event type */
  event: 'created' | 'updated' | 'transferred' | 'adapted';

  /** Who performed this event */
  by: string;

  /** When this event occurred (ISO 8601 UTC) */
  at: string;

  /** Human-readable context */
  note?: string;

  /** Recipient (for 'transferred' events) */
  to?: string;
}

/** Provenance metadata — origin and history of transferred content */
export interface Provenance {
  origin: {
    /** The operator who originally created this content */
    owner: string;

    /** The HQ instance where this content originated */
    'instance-id': string;

    /** When this specific transfer was created */
    'transferred-at': string;
  };

  /** Chronological list of events */
  history: ProvenanceEvent[];
}

/** Customization point for worker pattern adaptation */
export interface CustomizationPoint {
  /** Which file or field to customize */
  field: string;

  /** How to customize it */
  guidance: string;

  /** Priority: high, medium, low */
  priority?: 'high' | 'medium' | 'low';
}

/** Adaptation metadata for worker pattern transfers */
export interface Adaptation {
  /** Worker ID */
  'pattern-name': string;

  /** Pattern version */
  'pattern-version': string;

  /** Who developed this pattern */
  'pattern-origin': string;

  /** What the receiving HQ needs */
  requires?: {
    'knowledge-domains'?: string[];
    tools?: string[];
    'minimum-hq-version'?: string;
  };

  /** Points where the receiver should customize */
  'customization-points': CustomizationPoint[];

  /** What was intentionally excluded */
  'not-included'?: string[];

  /** Evolution history of this worker */
  'evolution-notes'?: string;
}
