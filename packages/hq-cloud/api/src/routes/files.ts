/**
 * File Proxy Routes
 *
 * S3 file proxy endpoints so CLI/web clients can upload, download, list,
 * and sync files without needing AWS credentials.
 *
 * All endpoints require Clerk auth and scope access to the authenticated
 * user's S3 prefix (user_{clerkId}/hq/).
 */

import type { FastifyInstance, FastifyPluginCallback } from 'fastify';
import {
  uploadFile,
  downloadFile,
  listFiles,
  syncDiff,
  getStorageQuota,
  FileProxyError,
} from '../data/file-proxy.js';
import type { SyncManifestEntry } from '../data/file-proxy.js';

// ─── Request/Response Types ─────────────────────────────────────────

interface UploadBody {
  path: string;
  content: string; // base64-encoded file content
  contentType?: string;
}

interface DownloadQuery {
  path: string;
}

interface ListQuery {
  prefix?: string;
  maxKeys?: string;
  continuationToken?: string;
}

interface SyncBody {
  manifest: SyncManifestEntry[];
}

// ─── Constants ──────────────────────────────────────────────────────

/** Max upload body size: 10 MB (base64 encoding adds ~33% overhead, so ~7.5 MB raw file) */
const UPLOAD_BODY_LIMIT = 10 * 1024 * 1024;

// ─── Route Plugin ───────────────────────────────────────────────────

export const fileRoutes: FastifyPluginCallback = (
  fastify: FastifyInstance,
  _opts,
  done
): void => {
  // Custom error handler for body-too-large errors on file routes
  fastify.setErrorHandler((error, request, reply) => {
    if (error.statusCode === 413 || error.code === 'FST_ERR_CTP_BODY_TOO_LARGE') {
      const body = request.body as Partial<UploadBody> | undefined;
      const fileName = body?.path || 'unknown';
      const limitMB = (UPLOAD_BODY_LIMIT / (1024 * 1024)).toFixed(0);
      return reply.status(413).send({
        error: 'Payload Too Large',
        message: `File "${fileName}" exceeds the ${limitMB}MB upload limit. Consider using smaller files or splitting large assets.`,
      });
    }
    // Re-throw for other errors
    return reply.status(error.statusCode || 500).send({
      error: error.name || 'Internal Server Error',
      message: error.message,
    });
  });

  /**
   * POST /api/files/upload
   *
   * Upload a file to the user's S3 prefix.
   * Accepts JSON with base64-encoded content.
   * Enforces per-user storage quota (default 500MB).
   * Body limit: 10 MB (supports files up to ~7.5 MB after base64 decoding).
   */
  fastify.post<{ Body: UploadBody }>('/files/upload', { bodyLimit: UPLOAD_BODY_LIMIT }, async (request, reply) => {
    const userId = request.user?.userId;
    if (!userId) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const { path, content, contentType } = request.body ?? {};

    if (!path || typeof path !== 'string') {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'path is required and must be a string',
      });
    }

    // content must be a string (base64-encoded); empty string is valid (zero-byte file)
    if (content === undefined || content === null || typeof content !== 'string') {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'content is required and must be a base64-encoded string',
      });
    }

    let fileBuffer: Buffer;
    try {
      fileBuffer = Buffer.from(content, 'base64');
    } catch {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'content must be valid base64',
      });
    }

    try {
      const result = await uploadFile({
        userId,
        relativePath: path,
        body: fileBuffer,
        contentType,
      });

      return reply.status(201).send({
        ok: true,
        key: result.key,
        size: result.size,
        path,
      });
    } catch (err) {
      if (err instanceof FileProxyError) {
        return reply.status(err.statusCode).send({
          error: err.statusCode === 413 ? 'Quota Exceeded' : 'Bad Request',
          message: err.message,
        });
      }
      fastify.log.error({ err, path }, 'File upload failed');
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
  });

  /**
   * GET /api/files/download?path=<relative-path>
   *
   * Stream a file from the user's S3 prefix.
   */
  fastify.get<{ Querystring: DownloadQuery }>('/files/download', async (request, reply) => {
    const userId = request.user?.userId;
    if (!userId) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const { path } = request.query ?? {};

    if (!path || typeof path !== 'string') {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'path query parameter is required',
      });
    }

    try {
      const result = await downloadFile({ userId, relativePath: path });

      return reply
        .header('Content-Type', result.contentType)
        .header('Content-Length', result.contentLength)
        .header('Last-Modified', result.lastModified.toUTCString())
        .header('Content-Disposition', `attachment; filename="${encodeURIComponent(path.split('/').pop() || 'file')}"`)
        .send(result.body);
    } catch (err) {
      if (err instanceof FileProxyError) {
        return reply.status(err.statusCode).send({
          error: err.statusCode === 404 ? 'Not Found' : 'Bad Request',
          message: err.message,
        });
      }
      fastify.log.error({ err, path }, 'File download failed');
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
  });

  /**
   * GET /api/files/list?prefix=<optional>&maxKeys=<optional>&continuationToken=<optional>
   *
   * List files in the user's S3 prefix.
   */
  fastify.get<{ Querystring: ListQuery }>('/files/list', async (request, reply) => {
    const userId = request.user?.userId;
    if (!userId) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const { prefix, maxKeys, continuationToken } = request.query ?? {};

    try {
      const result = await listFiles({
        userId,
        prefix: prefix || undefined,
        maxKeys: maxKeys ? parseInt(maxKeys, 10) : undefined,
        continuationToken: continuationToken || undefined,
      });

      return reply.send(result);
    } catch (err) {
      if (err instanceof FileProxyError) {
        return reply.status(err.statusCode).send({
          error: 'Bad Request',
          message: err.message,
        });
      }
      fastify.log.error({ err, prefix }, 'File list failed');
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
  });

  /**
   * POST /api/files/sync
   *
   * Accept a manifest of local file hashes and return which files
   * need upload/download to bring local and remote in sync.
   */
  fastify.post<{ Body: SyncBody }>('/files/sync', async (request, reply) => {
    const userId = request.user?.userId;
    if (!userId) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const { manifest } = request.body ?? {};

    if (!manifest || !Array.isArray(manifest)) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'manifest is required and must be an array',
      });
    }

    try {
      const diff = await syncDiff({ userId, manifest });

      return reply.send({
        needsUpload: diff.needsUpload,
        needsDownload: diff.needsDownload,
        inSync: diff.inSync,
        remoteOnly: diff.remoteOnly,
        summary: {
          upload: diff.needsUpload.length,
          download: diff.needsDownload.length,
          inSync: diff.inSync.length,
          remoteOnly: diff.remoteOnly.length,
        },
      });
    } catch (err) {
      if (err instanceof FileProxyError) {
        return reply.status(err.statusCode).send({
          error: 'Bad Request',
          message: err.message,
        });
      }
      fastify.log.error({ err }, 'File sync diff failed');
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
  });

  /**
   * GET /api/files/quota
   *
   * Get storage quota information for the authenticated user.
   */
  fastify.get('/files/quota', async (request, reply) => {
    const userId = request.user?.userId;
    if (!userId) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    try {
      const quota = await getStorageQuota(userId);
      return reply.send(quota);
    } catch (err) {
      fastify.log.error({ err }, 'Quota check failed');
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
  });

  done();
};
