import { describe, it, expect, vi, beforeEach } from 'vitest';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { promisify } from 'util';

// ── Mock strategy ─────────────────────────────────────────────────────────────
// vi.mock factories are hoisted by vitest, so we must create the mock object
// inside the factory (or use vi.hoisted).
// Node's execFile has a util.promisify.custom symbol that causes promisify(execFile)
// to delegate to a custom async function. We attach that symbol in the factory
// via a module-level async fn that we can swap per-test via mockResolvedValue etc.
// ─────────────────────────────────────────────────────────────────────────────

// vi.hoisted runs at hoist time — safe to use inside vi.mock factories below.
const { mockExecFileAsync } = vi.hoisted(() => {
  const mockExecFileAsync = vi.fn<() => Promise<{ stdout: string; stderr: string }>>();
  return { mockExecFileAsync };
});

vi.mock('child_process', async () => {
  const { promisify: p } = await import('util');
  const execFile = vi.fn();
  // Attach the custom promisify symbol so promisify(execFile) routes to our controllable async fn
  (execFile as unknown as Record<symbol, unknown>)[p.custom] = mockExecFileAsync;
  return { execFile };
});

import { buildDockerArgs, runContainer } from './container-runner.js';
import { MountSecurityError } from './mount-security.js';
import { runtime } from './container-runtime.js';
import type { ContainerRunOptions } from './types.js';

function makeOptions(overrides: Partial<ContainerRunOptions> = {}): ContainerRunOptions {
  return {
    image: 'hq-cloud-agent:latest',
    groupId: 'group-test',
    sessionId: 'session-1',
    messageId: 42,
    mounts: [],
    env: {},
    timeoutMs: 30000,
    ...overrides,
  };
}

// On macOS, os.tmpdir() returns /var/folders/... which resolves (via symlink) to /private/var/folders/...
const allowedBases = [fs.realpathSync(os.tmpdir()), path.resolve('./data')];

describe('buildDockerArgs', () => {
  it('includes run --rm --name', () => {
    const args = buildDockerArgs('test-container', makeOptions(), allowedBases);
    expect(args).toContain('run');
    expect(args).toContain('--rm');
    expect(args).toContain('--name');
    expect(args).toContain('test-container');
  });

  it('adds environment variables', () => {
    const opts = makeOptions({ env: { FOO: 'bar', BAZ: 'qux' } });
    const args = buildDockerArgs('ctr', opts, allowedBases);
    expect(args).toContain('-e');
    expect(args).toContain('FOO=bar');
    expect(args).toContain('BAZ=qux');
  });

  it('adds volume mounts with :ro for readOnly', () => {
    const src = fs.realpathSync(os.tmpdir());
    const opts = makeOptions({
      mounts: [{ src, dst: '/workspace', readOnly: true }],
    });
    const args = buildDockerArgs('ctr', opts, allowedBases);
    expect(args).toContain('-v');
    expect(args.some((a) => a.includes(':ro'))).toBe(true);
  });

  it('adds volume mounts without :ro for readWrite', () => {
    const src = fs.realpathSync(os.tmpdir());
    const opts = makeOptions({
      mounts: [{ src, dst: '/workspace', readOnly: false }],
    });
    const args = buildDockerArgs('ctr', opts, allowedBases);
    const volArg = args.find((a) => a.includes('/workspace'));
    expect(volArg).toBeDefined();
    expect(volArg!.endsWith(':ro')).toBe(false);
  });

  it('throws MountSecurityError for paths outside allowed bases', () => {
    const opts = makeOptions({
      mounts: [{ src: '/etc/passwd', dst: '/secrets', readOnly: true }],
    });
    expect(() => buildDockerArgs('ctr', opts, allowedBases)).toThrow(MountSecurityError);
  });

  it('includes the image at the end', () => {
    const opts = makeOptions({ image: 'my-image:v2' });
    const args = buildDockerArgs('ctr', opts, allowedBases);
    expect(args[args.length - 1]).toBe('my-image:v2');
  });

  it('includes resource limit flags', () => {
    const args = buildDockerArgs('ctr', makeOptions(), allowedBases);
    expect(args).toContain('--memory');
    expect(args).toContain('--cpus');
  });
});

describe('runContainer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns exitCode 0 on success', async () => {
    mockExecFileAsync.mockResolvedValue({ stdout: 'stdout output', stderr: '' });

    const result = await runContainer(makeOptions(), allowedBases);
    expect(result.exitCode).toBe(0);
    expect(result.timedOut).toBe(false);
    expect(result.stdout).toBe('stdout output');
  });

  it('returns timedOut=true when process is killed', async () => {
    const err = Object.assign(new Error('timeout'), { killed: true, stdout: '', stderr: '' });
    mockExecFileAsync.mockRejectedValue(err);

    const result = await runContainer(makeOptions(), allowedBases);
    expect(result.timedOut).toBe(true);
  });

  it('returns exitCode 1 on non-timeout failure', async () => {
    const err = Object.assign(new Error('docker error'), {
      code: 1,
      killed: false,
      stdout: '',
      stderr: 'docker: image not found',
    });
    mockExecFileAsync.mockRejectedValue(err);

    const result = await runContainer(makeOptions(), allowedBases);
    expect(result.exitCode).toBe(1);
    expect(result.timedOut).toBe(false);
    expect(result.stderr).toBe('docker: image not found');
  });

  it('deregisters container from runtime on success', async () => {
    mockExecFileAsync.mockResolvedValue({ stdout: '', stderr: '' });
    await runContainer(makeOptions(), allowedBases);
    expect(runtime.count).toBe(0);
  });

  it('deregisters container from runtime on failure', async () => {
    const err = Object.assign(new Error('fail'), { code: 1, killed: false, stdout: '', stderr: '' });
    mockExecFileAsync.mockRejectedValue(err);
    await runContainer(makeOptions(), allowedBases);
    expect(runtime.count).toBe(0);
  });
});
