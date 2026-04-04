/**
 * IPC file-based communication between host and agent containers.
 *
 * Protocol:
 *   1. Host writes  <tmpDir>/req-<messageId>.json  (IpcRequest)
 *   2. Container reads that file, processes, writes <tmpDir>/res-<messageId>.json (IpcResponse)
 *   3. Host polls for the response file; reads and deletes both files on receipt.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import type { IpcRequest, IpcResponse } from './types.js';

export const DEFAULT_IPC_DIR = path.join(os.tmpdir(), 'hq-cloud-ipc');

export function ipcRequestPath(ipcDir: string, messageId: number): string {
  return path.join(ipcDir, `req-${messageId}.json`);
}

export function ipcResponsePath(ipcDir: string, messageId: number): string {
  return path.join(ipcDir, `res-${messageId}.json`);
}

/**
 * Ensure the IPC directory exists.
 */
export function ensureIpcDir(ipcDir: string = DEFAULT_IPC_DIR): void {
  fs.mkdirSync(ipcDir, { recursive: true });
}

/**
 * Write the request file for a given message.
 */
export function writeRequest(request: IpcRequest, ipcDir: string = DEFAULT_IPC_DIR): void {
  ensureIpcDir(ipcDir);
  const filePath = ipcRequestPath(ipcDir, request.messageId);
  fs.writeFileSync(filePath, JSON.stringify(request, null, 2), 'utf8');
}

/**
 * Read the request file. Returns null if it doesn't exist.
 */
export function readRequest(messageId: number, ipcDir: string = DEFAULT_IPC_DIR): IpcRequest | null {
  const filePath = ipcRequestPath(ipcDir, messageId);
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw) as IpcRequest;
  } catch {
    return null;
  }
}

/**
 * Write the response file (called by the container after processing).
 */
export function writeResponse(response: IpcResponse, ipcDir: string = DEFAULT_IPC_DIR): void {
  ensureIpcDir(ipcDir);
  const filePath = ipcResponsePath(ipcDir, response.messageId);
  fs.writeFileSync(filePath, JSON.stringify(response, null, 2), 'utf8');
}

/**
 * Poll for a response file until it appears or timeout.
 * Cleans up both request and response files on success.
 *
 * @param messageId - The message to wait for.
 * @param timeoutMs - Max milliseconds to wait.
 * @param pollIntervalMs - How often to check.
 * @param ipcDir - Directory for IPC files.
 * @returns The response, or null on timeout.
 */
export async function waitForResponse(
  messageId: number,
  timeoutMs: number,
  pollIntervalMs = 500,
  ipcDir: string = DEFAULT_IPC_DIR
): Promise<IpcResponse | null> {
  const deadline = Date.now() + timeoutMs;
  const responsePath = ipcResponsePath(ipcDir, messageId);

  while (Date.now() < deadline) {
    if (fs.existsSync(responsePath)) {
      try {
        const raw = fs.readFileSync(responsePath, 'utf8');
        const response = JSON.parse(raw) as IpcResponse;
        // Clean up IPC files
        cleanupIpc(messageId, ipcDir);
        return response;
      } catch {
        // File may be partially written — try again next iteration
      }
    }
    await new Promise<void>((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  // Timed out — clean up request file only (response never appeared)
  try {
    fs.unlinkSync(ipcRequestPath(ipcDir, messageId));
  } catch {
    // Ignore
  }

  return null;
}

/**
 * Remove both request and response files for a message.
 */
export function cleanupIpc(messageId: number, ipcDir: string = DEFAULT_IPC_DIR): void {
  for (const filePath of [
    ipcRequestPath(ipcDir, messageId),
    ipcResponsePath(ipcDir, messageId),
  ]) {
    try {
      fs.unlinkSync(filePath);
    } catch {
      // File may not exist — ignore
    }
  }
}
