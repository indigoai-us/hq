/**
 * Type declarations for @hq-cloud/file-sync (legacy package reference).
 * cloud.ts still imports from this package via dynamic import().
 * Will be removed when cloud.ts is rewritten for US-005 (API proxy mode).
 */
declare module '@hq-cloud/file-sync' {
  export function initSync(hqRoot: string): Promise<void>;
  export function startDaemon(hqRoot: string): Promise<void>;
  export function stopDaemon(hqRoot: string): Promise<void>;
  export function getStatus(hqRoot: string): Promise<{
    running: boolean;
    lastSync: string | null;
    fileCount: number;
    bucket: string | null;
    errors: string[];
  }>;
  export function pushAll(hqRoot: string): Promise<{ filesUploaded: number }>;
  export function pullAll(hqRoot: string): Promise<{ filesDownloaded: number }>;
}
