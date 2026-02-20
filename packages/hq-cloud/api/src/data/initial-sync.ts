/**
 * Initial Sync (DEPRECATED)
 *
 * The server-side filesystem walk + upload approach has been removed.
 * It doesn't work in ECS Fargate where there is no local HQ directory.
 *
 * The replacement flow is client-push:
 *   1. Client scans local files
 *   2. Client pushes to POST /api/files/upload
 *   3. API stores in S3 via file-proxy.ts
 *
 * S3 prefix provisioning is handled by provisionS3Prefix() in user-settings.ts,
 * which runs automatically on every authentication via the auth middleware.
 *
 * Setup status is checked via GET /api/auth/setup-status (US-001).
 *
 * This module is kept as a stub so any lingering imports don't break at load time.
 * All exported functions throw an error if called.
 */

/**
 * @deprecated Use provisionS3Prefix() from user-settings.ts instead.
 * S3 prefix is now provisioned automatically on authentication.
 */
export async function provisionS3Space(): Promise<never> {
  throw new Error(
    'provisionS3Space() has been removed. ' +
    'S3 prefix is now provisioned automatically via provisionS3Prefix() in user-settings.ts. ' +
    'File upload uses the client-push model (POST /api/files/upload).'
  );
}

/**
 * @deprecated Server-side upload has been removed.
 * Clients should push files via POST /api/files/upload.
 */
export async function uploadWithProgress(): Promise<never> {
  throw new Error(
    'uploadWithProgress() has been removed. ' +
    'Use the client-push model: clients scan local files and POST to /api/files/upload.'
  );
}

/**
 * @deprecated Server-side sync has been removed.
 * Clients should push files via POST /api/files/upload.
 */
export async function provisionAndSync(): Promise<never> {
  throw new Error(
    'provisionAndSync() has been removed. ' +
    'Use the client-push model: clients scan local files and POST to /api/files/upload.'
  );
}
