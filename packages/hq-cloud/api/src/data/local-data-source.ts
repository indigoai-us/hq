/**
 * LocalDataSource
 *
 * Reads HQ content from the local filesystem.
 * Used in tests (skipAuth=true) and as a fallback for pre-S3 users.
 */

import fs from 'node:fs';
import nodePath from 'node:path';
import type { DataSource, DirEntry } from './data-source.js';

export class LocalDataSource implements DataSource {
  private readonly rootDir: string;

  constructor(rootDir: string) {
    this.rootDir = nodePath.resolve(rootDir);
  }

  private resolve(relativePath: string): string {
    const resolved = nodePath.resolve(this.rootDir, relativePath);
    if (!resolved.startsWith(this.rootDir + nodePath.sep) && resolved !== this.rootDir) {
      throw new Error('Path traversal not allowed');
    }
    return resolved;
  }

  async readFile(relativePath: string): Promise<string> {
    const fullPath = this.resolve(relativePath);
    return fs.readFileSync(fullPath, 'utf-8');
  }

  async listDir(relativePath: string): Promise<DirEntry[]> {
    const fullPath = this.resolve(relativePath);
    const entries = fs.readdirSync(fullPath, { withFileTypes: true });
    return entries.map((e) => ({
      name: e.name,
      isDirectory: e.isDirectory(),
    }));
  }

  async exists(relativePath: string): Promise<boolean> {
    try {
      const fullPath = this.resolve(relativePath);
      return fs.existsSync(fullPath);
    } catch {
      return false;
    }
  }

  async isDirectory(relativePath: string): Promise<boolean> {
    try {
      const fullPath = this.resolve(relativePath);
      return fs.statSync(fullPath).isDirectory();
    } catch {
      return false;
    }
  }

  async fileSize(relativePath: string): Promise<number> {
    const fullPath = this.resolve(relativePath);
    return fs.statSync(fullPath).size;
  }
}
