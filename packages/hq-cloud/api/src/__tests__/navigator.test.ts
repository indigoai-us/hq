import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { buildApp } from '../index.js';
import { config } from '../config.js';
import type { FastifyInstance } from 'fastify';

// Mock Clerk token verification
vi.mock('../auth/clerk.js', () => ({
  verifyClerkToken: vi.fn().mockResolvedValue({
    userId: 'test-user-id',
    sessionId: 'test-session-id',
  }),
}));

interface NavigatorNode {
  id: string;
  name: string;
  type: string;
  status: string;
  children?: NavigatorNode[];
  filePath?: string;
}

interface NavigatorGroup {
  id: string;
  name: string;
  children: NavigatorNode[];
}

interface NavigatorTreeResponse {
  groups: NavigatorGroup[];
}

interface FileContentResponse {
  path: string;
  content: string;
}

interface ErrorResponse {
  error: string;
  message: string;
}

describe('Navigator Routes', () => {
  let app: FastifyInstance;
  let baseUrl: string;
  let tempDir: string;
  let originalHqDir: string;

  function writeFile(relativePath: string, content: string): void {
    const fullPath = path.join(tempDir, relativePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);
  }

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nav-test-'));
    originalHqDir = config.hqDir;
    // Point config at our temp dir
    (config as { hqDir: string }).hqDir = tempDir;

    app = await buildApp();
    await app.listen({ port: 0, host: '127.0.0.1' });
    const address = app.server.address();
    if (address && typeof address === 'object') {
      baseUrl = `http://127.0.0.1:${address.port}`;
    }
  });

  afterEach(async () => {
    await app.close();
    (config as { hqDir: string }).hqDir = originalHqDir;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('GET /api/navigator/tree', () => {
    it('should return tree with groups for existing directories', async () => {
      writeFile('workers/backend-dev/worker.yaml', 'id: backend-dev');
      writeFile('projects/my-project/prd.json', '{}');

      const response = await fetch(`${baseUrl}/api/navigator/tree`, {
        headers: { Authorization: 'Bearer test-clerk-jwt' },
      });

      expect(response.status).toBe(200);
      const data = (await response.json()) as NavigatorTreeResponse;
      expect(data.groups).toBeDefined();
      const groupIds = data.groups.map((g) => g.id);
      expect(groupIds).toContain('workers');
      expect(groupIds).toContain('projects');
    });

    it('should return empty groups for empty HQ directory', async () => {
      const response = await fetch(`${baseUrl}/api/navigator/tree`, {
        headers: { Authorization: 'Bearer test-clerk-jwt' },
      });

      expect(response.status).toBe(200);
      const data = (await response.json()) as NavigatorTreeResponse;
      expect(data.groups).toEqual([]);
    });

    it('should include nested file structure', async () => {
      writeFile('knowledge/testing/patterns.md', '# Test Patterns');
      writeFile('knowledge/testing/helpers.md', '# Helpers');

      const response = await fetch(`${baseUrl}/api/navigator/tree`, {
        headers: { Authorization: 'Bearer test-clerk-jwt' },
      });

      expect(response.status).toBe(200);
      const data = (await response.json()) as NavigatorTreeResponse;
      const knowledgeGroup = data.groups.find((g) => g.id === 'knowledge');
      expect(knowledgeGroup).toBeDefined();

      const testingNode = knowledgeGroup!.children.find((n) => n.name === 'testing');
      expect(testingNode).toBeDefined();
      expect(testingNode!.children).toBeDefined();
      expect(testingNode!.children!.length).toBe(2);
    });
  });

  describe('GET /api/navigator/file', () => {
    it('should return file content', async () => {
      writeFile('workers/test/worker.yaml', 'id: test-worker\nname: Test');

      const response = await fetch(
        `${baseUrl}/api/navigator/file?path=workers/test/worker.yaml`,
        {
          headers: { Authorization: 'Bearer test-clerk-jwt' },
        }
      );

      expect(response.status).toBe(200);
      const data = (await response.json()) as FileContentResponse;
      expect(data.path).toBe('workers/test/worker.yaml');
      expect(data.content).toBe('id: test-worker\nname: Test');
    });

    it('should reject missing path parameter', async () => {
      const response = await fetch(`${baseUrl}/api/navigator/file`, {
        headers: { Authorization: 'Bearer test-clerk-jwt' },
      });

      expect(response.status).toBe(400);
      const data = (await response.json()) as ErrorResponse;
      expect(data.message).toContain('path');
    });

    it('should reject path traversal attempts', async () => {
      const response = await fetch(
        `${baseUrl}/api/navigator/file?path=../../../etc/passwd`,
        {
          headers: { Authorization: 'Bearer test-clerk-jwt' },
        }
      );

      expect(response.status).toBe(400);
      const data = (await response.json()) as ErrorResponse;
      expect(data.message).toContain('traversal');
    });

    it('should return 404 for non-existent file', async () => {
      const response = await fetch(
        `${baseUrl}/api/navigator/file?path=nonexistent.md`,
        {
          headers: { Authorization: 'Bearer test-clerk-jwt' },
        }
      );

      expect(response.status).toBe(404);
    });

    it('should reject directory paths', async () => {
      fs.mkdirSync(path.join(tempDir, 'somedir'), { recursive: true });

      const response = await fetch(
        `${baseUrl}/api/navigator/file?path=somedir`,
        {
          headers: { Authorization: 'Bearer test-clerk-jwt' },
        }
      );

      expect(response.status).toBe(400);
    });
  });
});
