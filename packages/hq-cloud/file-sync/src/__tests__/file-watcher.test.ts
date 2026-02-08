import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { FileWatcher } from '../daemon/file-watcher.js';
import type { SyncDaemonConfig, FileEvent } from '../daemon/types.js';
import { buildDaemonConfig } from '../daemon/config.js';

describe('FileWatcher', () => {
  let tmpDir: string;
  let config: SyncDaemonConfig;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hq-watcher-test-'));
    config = buildDaemonConfig({
      hqDir: tmpDir,
      debounceMs: 50,  // Short debounce for tests
      usePidFile: false,
    });
  });

  afterEach(() => {
    // Clean up temp dir
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should start and stop without errors', async () => {
    const events: FileEvent[] = [];
    const watcher = new FileWatcher(config, {
      onEvent: (e: FileEvent): void => { events.push(e); },
      onError: (_err: Error): void => { /* noop */ },
      onReady: (): void => { /* noop */ },
    });

    await watcher.start();
    expect(watcher.isWatching).toBe(true);

    await watcher.stop();
    expect(watcher.isWatching).toBe(false);
  });

  it('should not restart if already watching', async () => {
    const watcher = new FileWatcher(config, {
      onEvent: (_e: FileEvent): void => { /* noop */ },
      onError: (_err: Error): void => { /* noop */ },
      onReady: (): void => { /* noop */ },
    });

    await watcher.start();
    // Second start should be a no-op
    await watcher.start();
    expect(watcher.isWatching).toBe(true);

    await watcher.stop();
  });

  it('should detect new file creation', async () => {
    const events: FileEvent[] = [];
    const watcher = new FileWatcher(config, {
      onEvent: (e: FileEvent): void => { events.push(e); },
      onError: (_err: Error): void => { /* noop */ },
      onReady: (): void => { /* noop */ },
    });

    await watcher.start();

    // Create a file
    fs.writeFileSync(path.join(tmpDir, 'test.txt'), 'hello');

    // Wait for debounce + write finish stabilization
    await new Promise((resolve) => setTimeout(resolve, 500));

    await watcher.stop();

    expect(events.length).toBeGreaterThanOrEqual(1);
    const addEvent = events.find((e) => e.type === 'add' && e.relativePath === 'test.txt');
    expect(addEvent).toBeDefined();
    expect(addEvent?.absolutePath).toContain('test.txt');
  });

  it('should produce relative paths without backslashes', async () => {
    const events: FileEvent[] = [];
    const subDir = path.join(tmpDir, 'sub');
    fs.mkdirSync(subDir);

    const watcher = new FileWatcher(config, {
      onEvent: (e: FileEvent): void => { events.push(e); },
      onError: (_err: Error): void => { /* noop */ },
      onReady: (): void => { /* noop */ },
    });

    await watcher.start();

    fs.writeFileSync(path.join(subDir, 'nested.txt'), 'data');

    await new Promise((resolve) => setTimeout(resolve, 500));

    await watcher.stop();

    const nested = events.find((e) => e.relativePath.includes('nested.txt'));
    expect(nested).toBeDefined();
    // Relative path should use forward slashes
    expect(nested?.relativePath).toBe('sub/nested.txt');
    expect(nested?.relativePath).not.toContain('\\');
  });

  it('should detect file deletion', async () => {
    // Create file first
    const filePath = path.join(tmpDir, 'to-delete.txt');
    fs.writeFileSync(filePath, 'temp');

    const events: FileEvent[] = [];
    const watcher = new FileWatcher(config, {
      onEvent: (e: FileEvent): void => { events.push(e); },
      onError: (_err: Error): void => { /* noop */ },
      onReady: (): void => { /* noop */ },
    });

    await watcher.start();

    // Delete the file
    fs.unlinkSync(filePath);

    await new Promise((resolve) => setTimeout(resolve, 500));

    await watcher.stop();

    const unlinkEvent = events.find(
      (e) => e.type === 'unlink' && e.relativePath === 'to-delete.txt'
    );
    expect(unlinkEvent).toBeDefined();
  });

  it('should ignore patterns matching ignored config', async () => {
    const events: FileEvent[] = [];
    const watcherConfig = buildDaemonConfig({
      hqDir: tmpDir,
      debounceMs: 50,
      usePidFile: false,
      ignoredPatterns: ['**/*.ignored'],
    });

    const watcher = new FileWatcher(watcherConfig, {
      onEvent: (e: FileEvent): void => { events.push(e); },
      onError: (_err: Error): void => { /* noop */ },
      onReady: (): void => { /* noop */ },
    });

    await watcher.start();

    // Create both an ignored and a tracked file
    fs.writeFileSync(path.join(tmpDir, 'skip.ignored'), 'data');
    fs.writeFileSync(path.join(tmpDir, 'track.txt'), 'data');

    await new Promise((resolve) => setTimeout(resolve, 500));

    await watcher.stop();

    const ignoredEvent = events.find((e) => e.relativePath === 'skip.ignored');
    expect(ignoredEvent).toBeUndefined();

    const trackedEvent = events.find((e) => e.relativePath === 'track.txt');
    expect(trackedEvent).toBeDefined();
  });

  it('should stop cleanly even if never started', async () => {
    const watcher = new FileWatcher(config, {
      onEvent: (_e: FileEvent): void => { /* noop */ },
      onError: (_err: Error): void => { /* noop */ },
      onReady: (): void => { /* noop */ },
    });

    // Should not throw
    await watcher.stop();
    expect(watcher.isWatching).toBe(false);
  });
});
