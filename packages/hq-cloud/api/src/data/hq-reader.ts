/**
 * HQ Reader
 *
 * Reads HQ content via a DataSource abstraction. Parses registry.yaml,
 * worker.yaml files, and builds a navigator tree. Works against local
 * filesystem (tests) or S3 (production).
 */

import yaml from 'js-yaml';
import type { DataSource } from './data-source.js';
import type {
  WorkerDefinition,
  WorkerCategory,
  WorkerSkill,
  NavigatorTreeResponse,
  NavigatorGroup,
  NavigatorNode,
  NavigatorNodeType,
} from './types.js';

// --- Registry types (raw YAML shape) ---

interface RegistryEntry {
  id: string;
  path: string;
  type: string;
  description: string;
  status: string;
  team?: string;
  visibility?: string;
}

interface RegistryFile {
  workers: RegistryEntry[];
}

// --- Worker YAML shape ---

interface WorkerYaml {
  worker?: {
    id?: string;
    name?: string;
    type?: string;
  };
  execution?: {
    mode?: string;
  };
}

// --- Type mapping ---

const TYPE_TO_CATEGORY: Record<string, WorkerCategory> = {
  CodeWorker: 'code',
  ContentWorker: 'content',
  SocialWorker: 'social',
  ResearchWorker: 'research',
  OpsWorker: 'ops',
  Library: 'code', // Libraries are code-adjacent
};

function mapTypeToCategory(workerType: string): WorkerCategory {
  return TYPE_TO_CATEGORY[workerType] ?? 'code';
}

/**
 * Parse workers/registry.yaml and return WorkerDefinition[].
 */
export async function readWorkerRegistry(ds: DataSource): Promise<WorkerDefinition[]> {
  const registryPath = 'workers/registry.yaml';

  if (!(await ds.exists(registryPath))) {
    return [];
  }

  let registry: RegistryFile;
  try {
    const content = await ds.readFile(registryPath);
    registry = yaml.load(content) as RegistryFile;
  } catch {
    return [];
  }

  if (!registry?.workers || !Array.isArray(registry.workers)) {
    return [];
  }

  const results: WorkerDefinition[] = [];
  for (const entry of registry.workers) {
    const skills = await readWorkerSkills(ds, entry.path);
    const name = (await readWorkerName(ds, entry.path)) ?? formatId(entry.id);

    results.push({
      id: entry.id,
      name,
      category: mapTypeToCategory(entry.type),
      description: entry.description ?? '',
      status: mapStatus(entry.status),
      skills,
    });
  }

  return results;
}

function mapStatus(status: string): 'active' | 'inactive' | 'deprecated' {
  if (status === 'active') return 'active';
  if (status === 'deprecated') return 'deprecated';
  return 'inactive';
}

function formatId(id: string): string {
  return id
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * Read worker name from worker.yaml.
 */
async function readWorkerName(ds: DataSource, workerPath: string): Promise<string | null> {
  const yamlPath = `${workerPath}/worker.yaml`.replace(/\/\//g, '/');
  if (!(await ds.exists(yamlPath))) {
    return null;
  }

  try {
    const content = await ds.readFile(yamlPath);
    const doc = yaml.load(content) as WorkerYaml;
    return doc?.worker?.name ?? null;
  } catch {
    return null;
  }
}

/**
 * Read skills from a worker's skills/ directory.
 * Each .md file in skills/ is a skill.
 */
async function readWorkerSkills(ds: DataSource, workerPath: string): Promise<WorkerSkill[]> {
  const skillsDir = `${workerPath}/skills`.replace(/\/\//g, '/');
  if (!(await ds.exists(skillsDir))) {
    return [];
  }

  try {
    const entries = await ds.listDir(skillsDir);
    const mdFiles = entries.filter((e) => !e.isDirectory && e.name.endsWith('.md'));
    const skills: WorkerSkill[] = [];

    for (const file of mdFiles) {
      const id = file.name.replace(/\.md$/, '');
      const description = await readSkillDescription(ds, `${skillsDir}/${file.name}`);
      skills.push({
        id,
        name: formatId(id),
        description,
      });
    }

    return skills;
  } catch {
    return [];
  }
}

/**
 * Read the first non-empty, non-heading line from a skill markdown file as its description.
 */
async function readSkillDescription(ds: DataSource, filePath: string): Promise<string> {
  try {
    const content = await ds.readFile(filePath);
    const lines = content.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        return trimmed;
      }
    }
    return '';
  } catch {
    return '';
  }
}

/**
 * Build the navigator tree from the HQ directory structure.
 * Groups: Companies, Projects, Workers, Knowledge.
 */
export async function buildNavigatorTree(ds: DataSource): Promise<NavigatorTreeResponse> {
  const groups: NavigatorGroup[] = [];

  // Workers
  if (await ds.exists('workers')) {
    groups.push({
      id: 'workers',
      name: 'Workers',
      children: await buildDirectoryNodes(ds, 'worker', 'workers'),
    });
  }

  // Projects
  if (await ds.exists('projects')) {
    groups.push({
      id: 'projects',
      name: 'Projects',
      children: await buildDirectoryNodes(ds, 'project', 'projects'),
    });
  }

  // Knowledge
  if (await ds.exists('knowledge')) {
    groups.push({
      id: 'knowledge',
      name: 'Knowledge',
      children: await buildDirectoryNodes(ds, 'knowledge', 'knowledge'),
    });
  }

  // Companies
  if (await ds.exists('companies')) {
    groups.push({
      id: 'companies',
      name: 'Companies',
      children: await buildDirectoryNodes(ds, 'company', 'companies'),
    });
  }

  return { groups };
}

/**
 * Build navigator nodes from a directory.
 * Directories become typed nodes with children; files become file nodes.
 */
async function buildDirectoryNodes(
  ds: DataSource,
  nodeType: NavigatorNodeType,
  relativePrefx: string,
  maxDepth = 3,
  currentDepth = 0
): Promise<NavigatorNode[]> {
  if (currentDepth >= maxDepth) {
    return [];
  }

  try {
    const entries = await ds.listDir(relativePrefx);
    const nodes: NavigatorNode[] = [];

    for (const entry of entries) {
      // Skip hidden files, node_modules, dist
      if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist') {
        continue;
      }

      const relativePath = `${relativePrefx}/${entry.name}`;

      if (entry.isDirectory) {
        const children = await buildDirectoryNodes(
          ds,
          'file',
          relativePath,
          maxDepth,
          currentDepth + 1
        );

        nodes.push({
          id: relativePath,
          name: entry.name,
          type: currentDepth === 0 ? nodeType : 'file',
          status: 'idle',
          children: children.length > 0 ? children : undefined,
          filePath: relativePath,
        });
      } else {
        nodes.push({
          id: relativePath,
          name: entry.name,
          type: 'file',
          status: 'idle',
          filePath: relativePath,
        });
      }
    }

    return nodes.sort((a, b) => {
      // Directories first, then files
      const aIsDir = a.children !== undefined ? 0 : 1;
      const bIsDir = b.children !== undefined ? 0 : 1;
      if (aIsDir !== bIsDir) return aIsDir - bIsDir;
      return a.name.localeCompare(b.name);
    });
  } catch {
    return [];
  }
}

/**
 * Read a file's content from the HQ data source.
 * Validates relative path for traversal (no ".." components).
 */
export async function readFileContent(ds: DataSource, relativePath: string): Promise<string> {
  // Normalize and validate path — block traversal
  const normalized = relativePath.replace(/\\/g, '/');
  if (normalized.includes('..') || normalized.startsWith('/')) {
    throw new Error('Path traversal not allowed');
  }

  if (!(await ds.exists(relativePath))) {
    throw new Error('File not found');
  }

  if (await ds.isDirectory(relativePath)) {
    throw new Error('Path is a directory, not a file');
  }

  // Limit file size to 1MB
  const size = await ds.fileSize(relativePath);
  if (size > 1024 * 1024) {
    throw new Error('File too large (max 1MB)');
  }

  return ds.readFile(relativePath);
}
