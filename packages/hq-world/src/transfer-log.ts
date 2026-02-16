/**
 * Transfer log management.
 *
 * Transfer logs are daily YAML files at workspace/world/transfers/{YYYY-MM-DD}.yaml.
 * Each file contains a `transfers` array of log entries, appended chronologically.
 */

import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import yaml from 'js-yaml';

import type { TransferLogEntry, TransferLogFile } from './types/index.js';
import type { TransferEnvelope } from './types/index.js';
import { todayDateString, utcNow } from './utils.js';

/**
 * Append a transfer log entry to the daily log file.
 * Creates the file and directory structure if they do not exist.
 */
export async function appendTransferLog(
  hqRoot: string,
  entry: TransferLogEntry,
): Promise<string> {
  const transfersDir = join(hqRoot, 'workspace', 'world', 'transfers');
  await mkdir(transfersDir, { recursive: true });

  const date = entry.timestamp.split('T')[0];
  const logFilePath = join(transfersDir, `${date}.yaml`);

  // Read existing log or create new one
  let logFile: TransferLogFile;
  try {
    const content = await readFile(logFilePath, 'utf-8');
    logFile = yaml.load(content) as TransferLogFile;
    if (!logFile || !logFile.transfers) {
      logFile = { transfers: [] };
    }
  } catch {
    logFile = { transfers: [] };
  }

  // Append the entry
  logFile.transfers.push(entry);

  // Write back
  await writeFile(logFilePath, yaml.dump(logFile, { lineWidth: -1 }));

  return logFilePath;
}

/**
 * Log a "sent" event when a transfer is exported.
 */
export async function logExport(
  hqRoot: string,
  envelope: TransferEnvelope,
): Promise<string> {
  const entry: TransferLogEntry = {
    id: envelope.id,
    event: 'sent',
    direction: 'outbound',
    type: envelope.type,
    from: envelope.from,
    to: envelope.to,
    timestamp: envelope.timestamp,
    'payload-hash': envelope['payload-hash'],
    'payload-size': envelope['payload-size'],
    description: envelope.description ?? '',
    supersedes: envelope.supersedes,
    sequence: envelope.sequence,
    transport: envelope.transport,
  };

  return appendTransferLog(hqRoot, entry);
}

/**
 * Log a "received" event when a transfer arrives.
 */
export async function logReceive(
  hqRoot: string,
  envelope: TransferEnvelope,
  stagedTo: string,
): Promise<string> {
  const entry: TransferLogEntry = {
    id: envelope.id,
    event: 'received',
    direction: 'inbound',
    type: envelope.type,
    from: envelope.from,
    to: envelope.to,
    timestamp: utcNow(),
    'payload-hash': envelope['payload-hash'],
    'payload-size': envelope['payload-size'],
    description: envelope.description ?? '',
    state: 'staged',
    'staged-to': stagedTo,
  };

  return appendTransferLog(hqRoot, entry);
}

/**
 * Log an "approved" event when the operator approves a transfer.
 */
export async function logApproval(
  hqRoot: string,
  transferId: string,
  from: string,
  type: string,
  approvedBy: string,
): Promise<string> {
  const entry: TransferLogEntry = {
    id: transferId,
    event: 'approved',
    direction: 'inbound',
    type,
    from,
    timestamp: utcNow(),
    'approved-by': approvedBy,
  };

  return appendTransferLog(hqRoot, entry);
}

/**
 * Log a "rejected" event when the operator rejects a transfer.
 */
export async function logRejection(
  hqRoot: string,
  transferId: string,
  from: string,
  type: string,
  rejectedBy: string,
  reason?: string,
): Promise<string> {
  const entry: TransferLogEntry = {
    id: transferId,
    event: 'rejected',
    direction: 'inbound',
    type,
    from,
    timestamp: utcNow(),
    'rejected-by': rejectedBy,
    reason: reason ?? 'Operator rejected the transfer',
  };

  return appendTransferLog(hqRoot, entry);
}

/**
 * Log an "integrated" event when content is moved from inbox into the HQ.
 */
export async function logIntegration(
  hqRoot: string,
  transferId: string,
  from: string,
  type: string,
  integratedTo: string,
  integrationHash: string,
): Promise<string> {
  const entry: TransferLogEntry = {
    id: transferId,
    event: 'integrated',
    direction: 'inbound',
    type,
    from,
    timestamp: utcNow(),
    'integrated-to': integratedTo,
    'integration-hash': integrationHash,
  };

  return appendTransferLog(hqRoot, entry);
}

/**
 * Log a "quarantined" event when verification fails.
 */
export async function logQuarantine(
  hqRoot: string,
  transferId: string,
  from: string,
  type: string,
  errorCode: string,
  details: string,
): Promise<string> {
  const entry: TransferLogEntry = {
    id: transferId,
    event: 'quarantined',
    direction: 'inbound',
    type,
    from,
    timestamp: utcNow(),
    'error-code': errorCode,
    details,
  };

  return appendTransferLog(hqRoot, entry);
}

/**
 * Read transfer log entries for a specific date.
 */
export async function readTransferLog(
  hqRoot: string,
  date?: string,
): Promise<TransferLogEntry[]> {
  const effectiveDate = date ?? todayDateString();
  const logFilePath = join(
    hqRoot,
    'workspace',
    'world',
    'transfers',
    `${effectiveDate}.yaml`,
  );

  try {
    const content = await readFile(logFilePath, 'utf-8');
    const logFile = yaml.load(content) as TransferLogFile;
    return logFile?.transfers ?? [];
  } catch {
    return [];
  }
}
