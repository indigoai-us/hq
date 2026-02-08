import type { FastifyInstance, FastifyPluginCallback } from 'fastify';
import {
  ShareService,
  ShareStore,
  SHARE_STATUSES,
  SHARE_PERMISSIONS,
} from '@hq-cloud/file-sync';
import type {
  Share,
  ShareStatus,
  SharePermission,
  CreateShareInput,
  UpdateShareInput,
} from '@hq-cloud/file-sync';

// ─── Request/Response types ─────────────────────────────────────────

interface CreateShareBody {
  ownerId: string;
  recipientId: string;
  paths: string[];
  permissions?: SharePermission[];
  expiresAt?: string | null;
  label?: string | null;
}

interface UpdateShareBody {
  addPaths?: string[];
  removePaths?: string[];
  permissions?: SharePermission[];
  expiresAt?: string | null;
  label?: string | null;
}

interface ShareParams {
  id: string;
}

interface ListSharesQuery {
  ownerId?: string;
  recipientId?: string;
  status?: string;
}

interface AccessCheckQuery {
  recipientId: string;
  ownerId: string;
  path: string;
}

interface AccessiblePathsParams {
  userId: string;
}

interface ShareResponse {
  id: string;
  ownerId: string;
  recipientId: string;
  paths: string[];
  permissions: SharePermission[];
  status: ShareStatus;
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
  label: string | null;
}

// ─── Helpers ────────────────────────────────────────────────────────

function shareToResponse(share: Share): ShareResponse {
  return {
    id: share.id,
    ownerId: share.ownerId,
    recipientId: share.recipientId,
    paths: share.paths,
    permissions: share.permissions,
    status: share.status,
    createdAt: share.createdAt.toISOString(),
    updatedAt: share.updatedAt.toISOString(),
    expiresAt: share.expiresAt?.toISOString() ?? null,
    label: share.label,
  };
}

function isValidShareStatus(status: unknown): status is ShareStatus {
  return typeof status === 'string' && SHARE_STATUSES.includes(status as ShareStatus);
}

// ─── Singleton service (reset for testing) ──────────────────────────

let _store: ShareStore | undefined;
let _service: ShareService | undefined;

function getService(): ShareService {
  if (!_service) {
    _store = new ShareStore();
    _service = new ShareService(_store);
  }
  return _service;
}

/** Reset the share service and store (for testing) */
export function resetShareService(): void {
  _store = undefined;
  _service = undefined;
}

// ─── Route plugin ───────────────────────────────────────────────────

export const shareRoutes: FastifyPluginCallback = (
  fastify: FastifyInstance,
  _opts,
  done
): void => {
  const service = getService();

  // POST /shares - Create a new share
  fastify.post<{ Body: CreateShareBody }>('/shares', (request, reply) => {
    const { ownerId, recipientId, paths, permissions, expiresAt, label } = request.body;

    // Basic type checks
    if (!ownerId || typeof ownerId !== 'string') {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'ownerId is required',
      });
    }

    if (!recipientId || typeof recipientId !== 'string') {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'recipientId is required',
      });
    }

    if (!paths || !Array.isArray(paths) || paths.length === 0) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'paths must be a non-empty array',
      });
    }

    // Validate permissions if provided
    if (permissions !== undefined) {
      if (!Array.isArray(permissions)) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'permissions must be an array',
        });
      }
      for (const perm of permissions) {
        if (!SHARE_PERMISSIONS.includes(perm as SharePermission)) {
          return reply.status(400).send({
            error: 'Bad Request',
            message: `Invalid permission: '${String(perm)}'. Must be one of: ${SHARE_PERMISSIONS.join(', ')}`,
          });
        }
      }
    }

    const input: CreateShareInput = {
      ownerId,
      recipientId,
      paths,
      permissions,
      expiresAt,
      label,
    };

    const result = service.createShare(input);

    if (!result.validation.valid) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: result.validation.errors.join('; '),
        validationErrors: result.validation.errors,
      });
    }

    return reply.status(201).send(shareToResponse(result.share));
  });

  // GET /shares - List shares with optional filters
  fastify.get<{ Querystring: ListSharesQuery }>('/shares', (request, reply) => {
    const { ownerId, recipientId, status } = request.query;

    // Validate status if provided
    if (status && !isValidShareStatus(status)) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: `Invalid status. Must be one of: ${SHARE_STATUSES.join(', ')}`,
      });
    }

    const shares = service.listShares({
      ownerId,
      recipientId,
      status: status as ShareStatus | undefined,
    });

    return reply.send({
      count: shares.length,
      shares: shares.map(shareToResponse),
    });
  });

  // GET /shares/:id - Get a specific share
  fastify.get<{ Params: ShareParams }>('/shares/:id', (request, reply) => {
    const { id } = request.params;
    const share = service.getShare(id);

    if (!share) {
      return reply.status(404).send({
        error: 'Not Found',
        message: `Share '${id}' not found`,
      });
    }

    return reply.send(shareToResponse(share));
  });

  // PATCH /shares/:id - Update a share
  fastify.patch<{ Params: ShareParams; Body: UpdateShareBody }>('/shares/:id', (request, reply) => {
    const { id } = request.params;
    const { addPaths, removePaths, permissions, expiresAt, label } = request.body;

    // Validate permissions if provided
    if (permissions !== undefined) {
      if (!Array.isArray(permissions)) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'permissions must be an array',
        });
      }
      for (const perm of permissions) {
        if (!SHARE_PERMISSIONS.includes(perm as SharePermission)) {
          return reply.status(400).send({
            error: 'Bad Request',
            message: `Invalid permission: '${String(perm)}'. Must be one of: ${SHARE_PERMISSIONS.join(', ')}`,
          });
        }
      }
    }

    const input: UpdateShareInput = {
      addPaths,
      removePaths,
      permissions,
      expiresAt,
      label,
    };

    const result = service.updateShare(id, input);

    if (!result.validation.valid) {
      // Distinguish between not found and validation error
      if (result.validation.errors.some((e: string) => e.includes('not found'))) {
        return reply.status(404).send({
          error: 'Not Found',
          message: result.validation.errors.join('; '),
        });
      }
      return reply.status(400).send({
        error: 'Bad Request',
        message: result.validation.errors.join('; '),
        validationErrors: result.validation.errors,
      });
    }

    if (!result.share) {
      return reply.status(404).send({
        error: 'Not Found',
        message: `Share '${id}' not found`,
      });
    }

    return reply.send(shareToResponse(result.share));
  });

  // POST /shares/:id/revoke - Revoke a share
  fastify.post<{ Params: ShareParams }>('/shares/:id/revoke', (request, reply) => {
    const { id } = request.params;
    const share = service.revokeShare(id);

    if (!share) {
      return reply.status(404).send({
        error: 'Not Found',
        message: `Share '${id}' not found`,
      });
    }

    return reply.send(shareToResponse(share));
  });

  // DELETE /shares/:id - Delete a share
  fastify.delete<{ Params: ShareParams }>('/shares/:id', (request, reply) => {
    const { id } = request.params;

    if (!service.deleteShare(id)) {
      return reply.status(404).send({
        error: 'Not Found',
        message: `Share '${id}' not found`,
      });
    }

    return reply.status(204).send();
  });

  // GET /shares/access/check - Check if a recipient has access to a path
  fastify.get<{ Querystring: AccessCheckQuery }>('/shares/access/check', (request, reply) => {
    const { recipientId, ownerId, path } = request.query;

    if (!recipientId || !ownerId || !path) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'recipientId, ownerId, and path query parameters are required',
      });
    }

    const share = service.checkAccess(recipientId, ownerId, path);

    return reply.send({
      hasAccess: !!share,
      shareId: share?.id ?? null,
    });
  });

  // GET /shares/accessible/:userId - Get all paths accessible to a user
  fastify.get<{ Params: AccessiblePathsParams }>('/shares/accessible/:userId', (request, reply) => {
    const { userId } = request.params;

    const accessiblePaths = service.getAccessiblePaths(userId);

    return reply.send({
      userId,
      count: accessiblePaths.length,
      sharedResources: accessiblePaths,
    });
  });

  // GET /shares/:id/policy - Get the S3 policy for a share
  fastify.get<{ Params: ShareParams }>('/shares/:id/policy', (request, reply) => {
    const { id } = request.params;
    const policy = service.generateSharePolicy(id);

    if (!policy) {
      return reply.status(404).send({
        error: 'Not Found',
        message: `Share '${id}' not found or not active`,
      });
    }

    return reply.send(policy);
  });

  done();
};
