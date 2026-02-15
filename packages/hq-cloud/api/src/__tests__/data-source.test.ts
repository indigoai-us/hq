import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { LocalDataSource } from '../data/local-data-source.js';
import { S3DataSource } from '../data/s3-data-source.js';

// --- LocalDataSource tests ---

describe('LocalDataSource', () => {
  let tempDir: string;
  let ds: LocalDataSource;

  function writeFile(relativePath: string, content: string): void {
    const fullPath = path.join(tempDir, relativePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);
  }

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'datasource-test-'));
    ds = new LocalDataSource(tempDir);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('readFile should return file contents', async () => {
    writeFile('hello.txt', 'world');
    expect(await ds.readFile('hello.txt')).toBe('world');
  });

  it('listDir should return entries with isDirectory flag', async () => {
    writeFile('dir1/file.txt', 'content');
    writeFile('root.txt', 'root');

    const entries = await ds.listDir('.');
    const names = entries.map((e) => e.name);
    expect(names).toContain('dir1');
    expect(names).toContain('root.txt');

    const dir1 = entries.find((e) => e.name === 'dir1');
    expect(dir1?.isDirectory).toBe(true);

    const rootTxt = entries.find((e) => e.name === 'root.txt');
    expect(rootTxt?.isDirectory).toBe(false);
  });

  it('exists should return true for existing file', async () => {
    writeFile('exists.txt', 'yes');
    expect(await ds.exists('exists.txt')).toBe(true);
  });

  it('exists should return false for non-existing file', async () => {
    expect(await ds.exists('nope.txt')).toBe(false);
  });

  it('isDirectory should return true for directories', async () => {
    writeFile('mydir/file.txt', 'content');
    expect(await ds.isDirectory('mydir')).toBe(true);
  });

  it('isDirectory should return false for files', async () => {
    writeFile('file.txt', 'content');
    expect(await ds.isDirectory('file.txt')).toBe(false);
  });

  it('fileSize should return correct size', async () => {
    writeFile('sized.txt', '12345');
    expect(await ds.fileSize('sized.txt')).toBe(5);
  });

  it('should reject path traversal', async () => {
    await expect(ds.readFile('../../../etc/passwd')).rejects.toThrow('Path traversal not allowed');
  });
});

// --- S3DataSource tests (mocked S3 SDK) ---

vi.mock('@aws-sdk/client-s3', () => {
  const mockSend = vi.fn();
  return {
    S3Client: vi.fn().mockImplementation(() => ({ send: mockSend })),
    GetObjectCommand: vi.fn().mockImplementation((input) => ({ _type: 'GetObject', ...input })),
    ListObjectsV2Command: vi.fn().mockImplementation((input) => ({ _type: 'ListObjectsV2', ...input })),
    HeadObjectCommand: vi.fn().mockImplementation((input) => ({ _type: 'HeadObject', ...input })),
    __mockSend: mockSend,
  };
});

describe('S3DataSource', () => {
  let ds: S3DataSource;
  let mockSend: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    const s3Module = await import('@aws-sdk/client-s3');
    mockSend = (s3Module as unknown as { __mockSend: ReturnType<typeof vi.fn> }).__mockSend;
    mockSend.mockReset();

    ds = new S3DataSource({
      bucketName: 'test-bucket',
      region: 'us-east-1',
      prefix: 'user123/hq/',
    });
  });

  it('readFile should call GetObject and return content', async () => {
    mockSend.mockResolvedValueOnce({
      Body: { transformToString: vi.fn().mockResolvedValue('file content') },
    });

    const content = await ds.readFile('workers/registry.yaml');
    expect(content).toBe('file content');
  });

  it('listDir should return dirs from CommonPrefixes and files from Contents', async () => {
    mockSend.mockResolvedValueOnce({
      CommonPrefixes: [{ Prefix: 'user123/hq/workers/dev-team/' }],
      Contents: [{ Key: 'user123/hq/workers/registry.yaml' }],
    });

    const entries = await ds.listDir('workers');
    expect(entries).toContainEqual({ name: 'dev-team', isDirectory: true });
    expect(entries).toContainEqual({ name: 'registry.yaml', isDirectory: false });
  });

  it('exists should return true when HeadObject succeeds', async () => {
    mockSend.mockResolvedValueOnce({});

    expect(await ds.exists('workers/registry.yaml')).toBe(true);
  });

  it('exists should check prefix when HeadObject fails', async () => {
    mockSend
      .mockRejectedValueOnce(new Error('NotFound'))
      .mockResolvedValueOnce({ KeyCount: 1 });

    expect(await ds.exists('workers')).toBe(true);
  });

  it('exists should return false when neither file nor dir', async () => {
    mockSend
      .mockRejectedValueOnce(new Error('NotFound'))
      .mockResolvedValueOnce({ KeyCount: 0 });

    expect(await ds.exists('nonexistent')).toBe(false);
  });

  it('fileSize should return ContentLength', async () => {
    mockSend.mockResolvedValueOnce({ ContentLength: 42 });

    expect(await ds.fileSize('test.txt')).toBe(42);
  });

  it('isDirectory should check prefix', async () => {
    mockSend.mockResolvedValueOnce({ KeyCount: 3 });

    expect(await ds.isDirectory('workers')).toBe(true);
  });
});
