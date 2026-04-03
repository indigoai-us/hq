import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readdirSync, existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { scaffoldHQ, type ScaffoldResult } from './helpers/scaffold';

// Recursively find files matching a filename pattern
function findFilesRecursive(dir: string, filename: string): string[] {
  const results: string[] = [];
  try {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      try {
        const stat = statSync(full);
        if (stat.isDirectory()) {
          results.push(...findFilesRecursive(full, filename));
        } else if (entry === filename) {
          results.push(full);
        }
      } catch {
        // skip inaccessible entries
      }
    }
  } catch {
    // dir may not exist
  }
  return results;
}

describe('e2e: consolidation — template structural integrity', () => {
  let scaffold: ScaffoldResult;

  beforeAll(() => {
    scaffold = scaffoldHQ();
  });

  afterAll(() => {
    scaffold?.cleanup();
  });

  it('.claude/commands/ contains >= 30 .md files', () => {
    const commandsDir = join(scaffold.dir, '.claude', 'commands');
    expect(existsSync(commandsDir)).toBe(true);
    const mdFiles = readdirSync(commandsDir).filter((f) => f.endsWith('.md'));
    expect(mdFiles.length).toBeGreaterThanOrEqual(30);
  });

  it('workers/ contains >= 10 worker.yaml files (recursive)', () => {
    const workersDir = join(scaffold.dir, 'workers');
    expect(existsSync(workersDir)).toBe(true);
    const workerYamls = findFilesRecursive(workersDir, 'worker.yaml');
    expect(workerYamls.length).toBeGreaterThanOrEqual(10);
  });

  it('core.yaml exists and has a valid hqVersion field', () => {
    const coreYaml = join(scaffold.dir, 'core.yaml');
    expect(existsSync(coreYaml)).toBe(true);
    const content = readFileSync(coreYaml, 'utf-8');
    expect(content).toMatch(/^hqVersion:\s+".+"/m);
  });

  it('knowledge/ directory exists with at least 1 entry', () => {
    const knowledgeDir = join(scaffold.dir, 'knowledge');
    expect(existsSync(knowledgeDir)).toBe(true);
    const entries = readdirSync(knowledgeDir);
    expect(entries.length).toBeGreaterThanOrEqual(1);
  });

  it('.claude/skills/ contains >= 20 skill entries', () => {
    const skillsDir = join(scaffold.dir, '.claude', 'skills');
    expect(existsSync(skillsDir)).toBe(true);
    // Skills are organized as subdirectories (each containing SKILL.md)
    const entries = readdirSync(skillsDir);
    expect(entries.length).toBeGreaterThanOrEqual(20);
  });

  it('.claude/policies/ contains >= 50 files', () => {
    const policiesDir = join(scaffold.dir, '.claude', 'policies');
    expect(existsSync(policiesDir)).toBe(true);
    const files = readdirSync(policiesDir).filter((f) => {
      const full = join(policiesDir, f);
      return statSync(full).isFile();
    });
    expect(files.length).toBeGreaterThanOrEqual(50);
  });
});
