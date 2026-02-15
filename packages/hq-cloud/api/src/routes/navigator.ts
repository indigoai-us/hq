/**
 * Navigator Routes
 *
 * Serves the HQ file tree and file content for the web app's navigator panel.
 */

import type { FastifyInstance, FastifyPluginCallback } from 'fastify';
import { buildNavigatorTree, readFileContent } from '../data/hq-reader.js';
import { getDataSource, SetupRequiredError } from '../data/resolve-hq-dir.js';
import type { DataSource } from '../data/data-source.js';

interface FileQuery {
  path?: string;
}

export const navigatorRoutes: FastifyPluginCallback = (
  fastify: FastifyInstance,
  _opts,
  done
): void => {
  // GET /api/navigator/tree - Get the HQ directory tree
  fastify.get('/navigator/tree', async (request, reply) => {
    let ds: DataSource;
    try {
      ds = await getDataSource(request);
    } catch (err) {
      if (err instanceof SetupRequiredError) {
        return reply.status(403).send({
          error: 'Setup Required',
          message: err.message,
          code: 'SETUP_REQUIRED',
        });
      }
      throw err;
    }

    try {
      const tree = await buildNavigatorTree(ds);
      return reply.send(tree);
    } catch (err) {
      fastify.log.error({ err }, 'Failed to build navigator tree');
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to read HQ directory',
      });
    }
  });

  // GET /api/navigator/file?path=... - Get file content
  fastify.get<{ Querystring: FileQuery }>('/navigator/file', async (request, reply) => {
    const { path: filePath } = request.query;

    if (!filePath || typeof filePath !== 'string') {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'path query parameter is required',
      });
    }

    let ds: DataSource;
    try {
      ds = await getDataSource(request);
    } catch (err) {
      if (err instanceof SetupRequiredError) {
        return reply.status(403).send({
          error: 'Setup Required',
          message: err.message,
          code: 'SETUP_REQUIRED',
        });
      }
      throw err;
    }

    try {
      const content = await readFileContent(ds, filePath);
      return reply.send({ path: filePath, content });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';

      if (message === 'Path traversal not allowed') {
        return reply.status(400).send({ error: 'Bad Request', message });
      }
      if (message === 'File not found') {
        return reply.status(404).send({ error: 'Not Found', message });
      }
      if (message === 'Path is a directory, not a file') {
        return reply.status(400).send({ error: 'Bad Request', message });
      }
      if (message === 'File too large (max 1MB)') {
        return reply.status(413).send({ error: 'Payload Too Large', message });
      }

      fastify.log.error({ err, filePath }, 'Failed to read file');
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to read file',
      });
    }
  });

  done();
};
