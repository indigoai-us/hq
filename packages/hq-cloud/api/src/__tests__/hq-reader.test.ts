import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { readWorkerRegistry, buildNavigatorTree, readFileContent } from '../data/hq-reader.js';
import { LocalDataSource } from '../data/local-data-source.js';

let tempDir: string;
let ds: LocalDataSource;

function writeFile(relativePath: string, content: string): void {
  const fullPath = path.join(tempDir, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);
}

describe('HQ Reader', () => {
  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hq-reader-test-'));
    ds = new LocalDataSource(tempDir);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('readWorkerRegistry', () => {
    it('should return empty array if registry.yaml does not exist', async () => {
      const result = await readWorkerRegistry(ds);
      expect(result).toEqual([]);
    });

    it('should parse registry.yaml into WorkerDefinition[]', async () => {
      writeFile(
        'workers/registry.yaml',
        `
version: "4.0"
workers:
  - id: backend-dev
    path: workers/dev-team/backend-dev/
    type: CodeWorker
    description: "API endpoints, business logic"
    status: active
  - id: content-brand
    path: workers/content-brand/
    type: ContentWorker
    description: "Brand voice, messaging"
    status: active
`
      );

      const result = await readWorkerRegistry(ds);
      expect(result).toHaveLength(2);

      expect(result[0]!.id).toBe('backend-dev');
      expect(result[0]!.category).toBe('code');
      expect(result[0]!.description).toBe('API endpoints, business logic');
      expect(result[0]!.status).toBe('active');

      expect(result[1]!.id).toBe('content-brand');
      expect(result[1]!.category).toBe('content');
    });

    it('should map worker types to categories correctly', async () => {
      writeFile(
        'workers/registry.yaml',
        `
workers:
  - id: w1
    path: workers/w1/
    type: CodeWorker
    description: test
    status: active
  - id: w2
    path: workers/w2/
    type: ContentWorker
    description: test
    status: active
  - id: w3
    path: workers/w3/
    type: SocialWorker
    description: test
    status: active
  - id: w4
    path: workers/w4/
    type: ResearchWorker
    description: test
    status: active
  - id: w5
    path: workers/w5/
    type: OpsWorker
    description: test
    status: active
`
      );

      const result = await readWorkerRegistry(ds);
      expect(result[0]!.category).toBe('code');
      expect(result[1]!.category).toBe('content');
      expect(result[2]!.category).toBe('social');
      expect(result[3]!.category).toBe('research');
      expect(result[4]!.category).toBe('ops');
    });

    it('should read worker name from worker.yaml', async () => {
      writeFile(
        'workers/registry.yaml',
        `
workers:
  - id: backend-dev
    path: workers/backend-dev/
    type: CodeWorker
    description: test
    status: active
`
      );
      writeFile(
        'workers/backend-dev/worker.yaml',
        `
worker:
  id: backend-dev
  name: "Backend Developer"
  type: CodeWorker
`
      );

      const result = await readWorkerRegistry(ds);
      expect(result[0]!.name).toBe('Backend Developer');
    });

    it('should read skills from skills/ directory', async () => {
      writeFile(
        'workers/registry.yaml',
        `
workers:
  - id: backend-dev
    path: workers/backend-dev/
    type: CodeWorker
    description: test
    status: active
`
      );
      writeFile('workers/backend-dev/skills/implement-feature.md', '# Implement Feature\nBuild new API endpoints');
      writeFile('workers/backend-dev/skills/fix-bug.md', '# Fix Bug\nDebug and fix issues');

      const result = await readWorkerRegistry(ds);
      expect(result[0]!.skills).toHaveLength(2);

      const skillIds = result[0]!.skills.map((s) => s.id);
      expect(skillIds).toContain('implement-feature');
      expect(skillIds).toContain('fix-bug');
    });

    it('should handle malformed registry.yaml gracefully', async () => {
      writeFile('workers/registry.yaml', 'not valid yaml: [');
      // Should not throw, but may return empty
      await expect(readWorkerRegistry(ds)).resolves.not.toThrow();
    });

    it('should map status values correctly', async () => {
      writeFile(
        'workers/registry.yaml',
        `
workers:
  - id: w1
    path: workers/w1/
    type: CodeWorker
    description: test
    status: active
  - id: w2
    path: workers/w2/
    type: CodeWorker
    description: test
    status: deprecated
  - id: w3
    path: workers/w3/
    type: CodeWorker
    description: test
    status: disabled
`
      );

      const result = await readWorkerRegistry(ds);
      expect(result[0]!.status).toBe('active');
      expect(result[1]!.status).toBe('deprecated');
      expect(result[2]!.status).toBe('inactive');
    });
  });

  describe('buildNavigatorTree', () => {
    it('should return empty groups for empty directory', async () => {
      const result = await buildNavigatorTree(ds);
      expect(result.groups).toEqual([]);
    });

    it('should build groups from HQ directory structure', async () => {
      writeFile('workers/backend-dev/worker.yaml', 'worker:\n  id: backend-dev');
      writeFile('projects/my-project/prd.json', '{}');
      writeFile('knowledge/testing/patterns.md', '# Patterns');
      writeFile('companies/acme/settings.yaml', 'name: Acme');

      const result = await buildNavigatorTree(ds);
      const groupNames = result.groups.map((g) => g.name);
      expect(groupNames).toContain('Workers');
      expect(groupNames).toContain('Projects');
      expect(groupNames).toContain('Knowledge');
      expect(groupNames).toContain('Companies');
    });

    it('should include files and subdirectories as nodes', async () => {
      writeFile('workers/backend-dev/worker.yaml', 'id: backend-dev');
      writeFile('workers/backend-dev/skills/test.md', '# Test');

      const result = await buildNavigatorTree(ds);
      const workersGroup = result.groups.find((g) => g.id === 'workers');
      expect(workersGroup).toBeDefined();
      expect(workersGroup!.children.length).toBeGreaterThan(0);

      const backendDev = workersGroup!.children.find((n) => n.name === 'backend-dev');
      expect(backendDev).toBeDefined();
      expect(backendDev!.type).toBe('worker');
      expect(backendDev!.children).toBeDefined();
    });

    it('should skip hidden files and node_modules', async () => {
      writeFile('workers/.hidden/file.yaml', 'hidden');
      writeFile('workers/node_modules/pkg/index.js', 'module');
      writeFile('workers/real-worker/worker.yaml', 'id: real');

      const result = await buildNavigatorTree(ds);
      const workersGroup = result.groups.find((g) => g.id === 'workers');
      expect(workersGroup!.children).toHaveLength(1);
      expect(workersGroup!.children[0]!.name).toBe('real-worker');
    });

    it('should only include groups for directories that exist', async () => {
      writeFile('workers/w1/worker.yaml', 'id: w1');
      // No projects, knowledge, or companies dirs

      const result = await buildNavigatorTree(ds);
      expect(result.groups).toHaveLength(1);
      expect(result.groups[0]!.id).toBe('workers');
    });
  });

  describe('readFileContent', () => {
    it('should read file content', async () => {
      writeFile('test.md', '# Hello World');
      const content = await readFileContent(ds, 'test.md');
      expect(content).toBe('# Hello World');
    });

    it('should read nested file content', async () => {
      writeFile('workers/backend-dev/worker.yaml', 'id: backend-dev');
      const content = await readFileContent(ds, 'workers/backend-dev/worker.yaml');
      expect(content).toBe('id: backend-dev');
    });

    it('should throw on path traversal', async () => {
      await expect(readFileContent(ds, '../../../etc/passwd')).rejects.toThrow(
        'Path traversal not allowed'
      );
    });

    it('should throw on file not found', async () => {
      await expect(readFileContent(ds, 'nonexistent.md')).rejects.toThrow('File not found');
    });

    it('should throw on directory path', async () => {
      fs.mkdirSync(path.join(tempDir, 'somedir'), { recursive: true });
      await expect(readFileContent(ds, 'somedir')).rejects.toThrow(
        'Path is a directory, not a file'
      );
    });
  });
});
