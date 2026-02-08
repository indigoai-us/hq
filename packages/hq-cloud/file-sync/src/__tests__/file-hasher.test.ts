import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';
import { hashFile, hashBuffer } from '../upload/file-hasher.js';

describe('hashFile', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hq-hasher-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should compute SHA-256 hash of a file', async () => {
    const content = 'hello world';
    const filePath = path.join(tmpDir, 'test.txt');
    fs.writeFileSync(filePath, content);

    const result = await hashFile(filePath, 'sha256');

    // Compute expected hash manually
    const expected = crypto.createHash('sha256').update(content).digest('hex');

    expect(result.hash).toBe(expected);
    expect(result.algorithm).toBe('sha256');
    expect(result.sizeBytes).toBe(Buffer.byteLength(content));
  });

  it('should compute MD5 hash of a file', async () => {
    const content = 'md5 test content';
    const filePath = path.join(tmpDir, 'md5.txt');
    fs.writeFileSync(filePath, content);

    const result = await hashFile(filePath, 'md5');

    const expected = crypto.createHash('md5').update(content).digest('hex');

    expect(result.hash).toBe(expected);
    expect(result.algorithm).toBe('md5');
    expect(result.sizeBytes).toBe(Buffer.byteLength(content));
  });

  it('should default to SHA-256 when no algorithm specified', async () => {
    const content = 'default algo';
    const filePath = path.join(tmpDir, 'default.txt');
    fs.writeFileSync(filePath, content);

    const result = await hashFile(filePath);

    expect(result.algorithm).toBe('sha256');
    const expected = crypto.createHash('sha256').update(content).digest('hex');
    expect(result.hash).toBe(expected);
  });

  it('should handle empty files', async () => {
    const filePath = path.join(tmpDir, 'empty.txt');
    fs.writeFileSync(filePath, '');

    const result = await hashFile(filePath, 'sha256');

    const expected = crypto.createHash('sha256').update('').digest('hex');
    expect(result.hash).toBe(expected);
    expect(result.sizeBytes).toBe(0);
  });

  it('should handle binary files', async () => {
    const content = Buffer.from([0x00, 0xFF, 0x42, 0xDE, 0xAD, 0xBE, 0xEF]);
    const filePath = path.join(tmpDir, 'binary.bin');
    fs.writeFileSync(filePath, content);

    const result = await hashFile(filePath, 'sha256');

    const expected = crypto.createHash('sha256').update(content).digest('hex');
    expect(result.hash).toBe(expected);
    expect(result.sizeBytes).toBe(content.length);
  });

  it('should reject for non-existent files', async () => {
    const filePath = path.join(tmpDir, 'does-not-exist.txt');

    await expect(hashFile(filePath)).rejects.toThrow('Failed to hash file');
  });

  it('should produce consistent hashes for same content', async () => {
    const content = 'consistency check';
    const file1 = path.join(tmpDir, 'file1.txt');
    const file2 = path.join(tmpDir, 'file2.txt');
    fs.writeFileSync(file1, content);
    fs.writeFileSync(file2, content);

    const result1 = await hashFile(file1);
    const result2 = await hashFile(file2);

    expect(result1.hash).toBe(result2.hash);
    expect(result1.sizeBytes).toBe(result2.sizeBytes);
  });

  it('should produce different hashes for different content', async () => {
    const file1 = path.join(tmpDir, 'a.txt');
    const file2 = path.join(tmpDir, 'b.txt');
    fs.writeFileSync(file1, 'content A');
    fs.writeFileSync(file2, 'content B');

    const result1 = await hashFile(file1);
    const result2 = await hashFile(file2);

    expect(result1.hash).not.toBe(result2.hash);
  });

  it('should handle large files efficiently', async () => {
    // Create a 1MB file
    const filePath = path.join(tmpDir, 'large.bin');
    const content = Buffer.alloc(1024 * 1024, 'x');
    fs.writeFileSync(filePath, content);

    const result = await hashFile(filePath);

    expect(result.sizeBytes).toBe(1024 * 1024);
    expect(result.hash).toBeTruthy();
    expect(result.hash).toHaveLength(64); // SHA-256 hex is 64 chars
  });
});

describe('hashBuffer', () => {
  it('should compute SHA-256 hash of a buffer', () => {
    const content = Buffer.from('buffer test');
    const result = hashBuffer(content, 'sha256');

    const expected = crypto.createHash('sha256').update(content).digest('hex');

    expect(result.hash).toBe(expected);
    expect(result.algorithm).toBe('sha256');
    expect(result.sizeBytes).toBe(content.length);
  });

  it('should compute MD5 hash of a buffer', () => {
    const content = Buffer.from('md5 buffer');
    const result = hashBuffer(content, 'md5');

    const expected = crypto.createHash('md5').update(content).digest('hex');

    expect(result.hash).toBe(expected);
    expect(result.algorithm).toBe('md5');
  });

  it('should default to SHA-256', () => {
    const content = Buffer.from('default');
    const result = hashBuffer(content);

    expect(result.algorithm).toBe('sha256');
  });

  it('should handle empty buffer', () => {
    const result = hashBuffer(Buffer.alloc(0));

    const expected = crypto.createHash('sha256').update(Buffer.alloc(0)).digest('hex');
    expect(result.hash).toBe(expected);
    expect(result.sizeBytes).toBe(0);
  });

  it('should match hashFile for same content', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hq-hashbuf-'));
    const content = Buffer.from('match test');
    const filePath = path.join(tmpDir, 'match.txt');
    fs.writeFileSync(filePath, content);

    const bufResult = hashBuffer(content, 'sha256');
    const fileResult = await hashFile(filePath, 'sha256');

    expect(bufResult.hash).toBe(fileResult.hash);
    expect(bufResult.sizeBytes).toBe(fileResult.sizeBytes);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
