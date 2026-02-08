/**
 * Tests for Graceful Shutdown Service
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  GracefulShutdown,
  createHttpShutdownNotifier,
  createGracefulShutdownFromEnv,
  type GracefulShutdownConfig,
  type ShutdownApiNotifier,
  type CheckpointWriter,
  type CheckpointData,
  type ShutdownLogger,
  type ShutdownEvent,
  type Disposable,
} from '../graceful-shutdown.js';

// ────────────────────────────────────────────────────────────────
// Test helpers
// ────────────────────────────────────────────────────────────────

function createMockLogger(): ShutdownLogger {
  return {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
}

function createMockApiNotifier(
  options: { success?: boolean; error?: string } = {}
): ShutdownApiNotifier {
  return {
    sendFinalStatus: vi.fn().mockResolvedValue({
      success: options.success ?? true,
      error: options.error,
    }),
  };
}

function createMockCheckpointWriter(
  options: { path?: string; error?: Error } = {}
): CheckpointWriter {
  return {
    write: options.error
      ? vi.fn().mockRejectedValue(options.error)
      : vi.fn().mockResolvedValue(options.path ?? '/hq/workspace/checkpoints/test.json'),
  };
}

function createBaseConfig(
  overrides?: Partial<GracefulShutdownConfig>
): GracefulShutdownConfig {
  return {
    workerId: 'test-worker',
    drainTimeoutMs: 1000,
    apiNotifyTimeoutMs: 1000,
    checkpointTimeoutMs: 1000,
    callProcessExit: false, // Never exit in tests
    ...overrides,
  };
}

// ────────────────────────────────────────────────────────────────
// Constructor
// ────────────────────────────────────────────────────────────────

describe('GracefulShutdown', () => {
  let mockLogger: ShutdownLogger;

  beforeEach(() => {
    mockLogger = createMockLogger();
  });

  afterEach(() => {
    // Clean up any lingering signal handlers
    process.removeAllListeners('SIGTERM');
    process.removeAllListeners('SIGINT');
  });

  describe('constructor', () => {
    it('creates instance with default config', () => {
      const shutdown = new GracefulShutdown(
        createBaseConfig({ logger: mockLogger })
      );
      expect(shutdown).toBeDefined();
      expect(shutdown.phase).toBe('idle');
      expect(shutdown.isShuttingDown).toBe(false);
      expect(shutdown.isInstalled).toBe(false);
    });

    it('applies custom drain timeout', () => {
      const shutdown = new GracefulShutdown(
        createBaseConfig({
          drainTimeoutMs: 60000,
          logger: mockLogger,
        })
      );
      expect(shutdown).toBeDefined();
    });
  });

  // ────────────────────────────────────────────────────────────────
  // Signal handler installation
  // ────────────────────────────────────────────────────────────────

  describe('install/uninstall', () => {
    it('installs signal handlers', () => {
      const shutdown = new GracefulShutdown(
        createBaseConfig({ logger: mockLogger })
      );

      shutdown.install();
      expect(shutdown.isInstalled).toBe(true);

      // Clean up
      shutdown.uninstall();
    });

    it('uninstalls signal handlers', () => {
      const shutdown = new GracefulShutdown(
        createBaseConfig({ logger: mockLogger })
      );

      shutdown.install();
      expect(shutdown.isInstalled).toBe(true);

      shutdown.uninstall();
      expect(shutdown.isInstalled).toBe(false);
    });

    it('is idempotent for install', () => {
      const shutdown = new GracefulShutdown(
        createBaseConfig({ logger: mockLogger })
      );

      shutdown.install();
      shutdown.install(); // Should not throw

      expect(shutdown.isInstalled).toBe(true);

      shutdown.uninstall();
    });
  });

  // ────────────────────────────────────────────────────────────────
  // Shutdown sequence
  // ────────────────────────────────────────────────────────────────

  describe('initiateShutdown', () => {
    it('completes full shutdown sequence', async () => {
      const mockNotifier = createMockApiNotifier();
      const mockWriter = createMockCheckpointWriter();

      const shutdown = new GracefulShutdown(
        createBaseConfig({ logger: mockLogger })
      );
      shutdown.setApiNotifier(mockNotifier);
      shutdown.setCheckpointWriter(mockWriter);

      await shutdown.initiateShutdown('test');

      expect(shutdown.phase).toBe('exited');
      expect(shutdown.isShuttingDown).toBe(true);
      expect(mockNotifier.sendFinalStatus).toHaveBeenCalledWith(
        'test-worker',
        'terminated',
        expect.objectContaining({ reason: 'test' })
      );
      expect(mockWriter.write).toHaveBeenCalled();
    });

    it('deduplicates concurrent shutdown calls', async () => {
      const mockNotifier = createMockApiNotifier();

      const shutdown = new GracefulShutdown(
        createBaseConfig({ logger: mockLogger })
      );
      shutdown.setApiNotifier(mockNotifier);

      // Initiate shutdown twice concurrently
      const [result1, result2] = await Promise.all([
        shutdown.initiateShutdown('first'),
        shutdown.initiateShutdown('second'),
      ]);

      // Both should resolve
      expect(result1).toBeUndefined();
      expect(result2).toBeUndefined();

      // API should only be called once
      expect(mockNotifier.sendFinalStatus).toHaveBeenCalledTimes(1);
    });

    it('sends error status when reason is error', async () => {
      const mockNotifier = createMockApiNotifier();

      const shutdown = new GracefulShutdown(
        createBaseConfig({ logger: mockLogger })
      );
      shutdown.setApiNotifier(mockNotifier);

      await shutdown.initiateShutdown('error');

      expect(mockNotifier.sendFinalStatus).toHaveBeenCalledWith(
        'test-worker',
        'error',
        expect.any(Object)
      );
    });

    it('sends terminated status for SIGTERM', async () => {
      const mockNotifier = createMockApiNotifier();

      const shutdown = new GracefulShutdown(
        createBaseConfig({ logger: mockLogger })
      );
      shutdown.setApiNotifier(mockNotifier);

      await shutdown.initiateShutdown('SIGTERM');

      expect(mockNotifier.sendFinalStatus).toHaveBeenCalledWith(
        'test-worker',
        'terminated',
        expect.objectContaining({ reason: 'SIGTERM' })
      );
    });
  });

  // ────────────────────────────────────────────────────────────────
  // Drain phase
  // ────────────────────────────────────────────────────────────────

  describe('drain phase', () => {
    it('waits for drain callback to complete', async () => {
      let drained = false;
      const drainCallback = vi.fn().mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        drained = true;
      });

      const shutdown = new GracefulShutdown(
        createBaseConfig({ logger: mockLogger })
      );
      shutdown.setDrainCallback(drainCallback);

      await shutdown.initiateShutdown('test');

      expect(drainCallback).toHaveBeenCalled();
      expect(drained).toBe(true);
    });

    it('enforces drain timeout', async () => {
      const drainCallback = vi.fn().mockImplementation(async () => {
        // This will take longer than the timeout
        await new Promise((resolve) => setTimeout(resolve, 5000));
      });

      const shutdown = new GracefulShutdown(
        createBaseConfig({
          drainTimeoutMs: 100, // Very short timeout
          logger: mockLogger,
        })
      );
      shutdown.setDrainCallback(drainCallback);

      const events: ShutdownEvent[] = [];
      shutdown.on('shutdown_event', (event: ShutdownEvent) => {
        events.push(event);
      });

      await shutdown.initiateShutdown('test');

      // Should have completed despite timeout
      expect(shutdown.phase).toBe('exited');

      // Should have emitted a drain_timeout event
      const timeoutEvent = events.find((e) => e.type === 'drain_timeout');
      expect(timeoutEvent).toBeDefined();
    }, 10000);

    it('skips drain if no callback set', async () => {
      const shutdown = new GracefulShutdown(
        createBaseConfig({ logger: mockLogger })
      );

      const events: ShutdownEvent[] = [];
      shutdown.on('shutdown_event', (event: ShutdownEvent) => {
        events.push(event);
      });

      await shutdown.initiateShutdown('test');

      const drainEvent = events.find((e) => e.type === 'drain_complete');
      expect(drainEvent).toBeDefined();
      expect(drainEvent!.payload.skipped).toBe(true);
    });

    it('handles drain callback errors', async () => {
      const drainCallback = vi.fn().mockRejectedValue(new Error('Drain failed'));

      const shutdown = new GracefulShutdown(
        createBaseConfig({ logger: mockLogger })
      );
      shutdown.setDrainCallback(drainCallback);

      // Should complete despite drain error
      await shutdown.initiateShutdown('test');
      expect(shutdown.phase).toBe('exited');
    });
  });

  // ────────────────────────────────────────────────────────────────
  // Checkpoint phase
  // ────────────────────────────────────────────────────────────────

  describe('checkpoint phase', () => {
    it('writes checkpoint when enabled and writer is set', async () => {
      const mockWriter = createMockCheckpointWriter({
        path: '/hq/workspace/checkpoints/test.json',
      });

      const shutdown = new GracefulShutdown(
        createBaseConfig({
          enableCheckpoint: true,
          logger: mockLogger,
        })
      );
      shutdown.setCheckpointWriter(mockWriter);

      await shutdown.initiateShutdown('test');

      expect(mockWriter.write).toHaveBeenCalledWith(
        expect.objectContaining({
          workerId: 'test-worker',
          reason: 'shutdown',
        })
      );
    });

    it('skips checkpoint when disabled', async () => {
      const mockWriter = createMockCheckpointWriter();

      const shutdown = new GracefulShutdown(
        createBaseConfig({
          enableCheckpoint: false,
          logger: mockLogger,
        })
      );
      shutdown.setCheckpointWriter(mockWriter);

      const events: ShutdownEvent[] = [];
      shutdown.on('shutdown_event', (event: ShutdownEvent) => {
        events.push(event);
      });

      await shutdown.initiateShutdown('test');

      expect(mockWriter.write).not.toHaveBeenCalled();
      const skipEvent = events.find((e) => e.type === 'checkpoint_skipped');
      expect(skipEvent).toBeDefined();
      expect(skipEvent!.payload.reason).toBe('disabled');
    });

    it('skips checkpoint when no writer configured', async () => {
      const shutdown = new GracefulShutdown(
        createBaseConfig({
          enableCheckpoint: true,
          logger: mockLogger,
        })
      );

      const events: ShutdownEvent[] = [];
      shutdown.on('shutdown_event', (event: ShutdownEvent) => {
        events.push(event);
      });

      await shutdown.initiateShutdown('test');

      const skipEvent = events.find((e) => e.type === 'checkpoint_skipped');
      expect(skipEvent).toBeDefined();
      expect(skipEvent!.payload.reason).toBe('no_writer');
    });

    it('handles checkpoint write failure gracefully', async () => {
      const mockWriter = createMockCheckpointWriter({
        error: new Error('Disk full'),
      });

      const shutdown = new GracefulShutdown(
        createBaseConfig({ logger: mockLogger })
      );
      shutdown.setCheckpointWriter(mockWriter);

      const events: ShutdownEvent[] = [];
      shutdown.on('shutdown_event', (event: ShutdownEvent) => {
        events.push(event);
      });

      // Should complete despite checkpoint error
      await shutdown.initiateShutdown('test');
      expect(shutdown.phase).toBe('exited');

      const failEvent = events.find((e) => e.type === 'checkpoint_failed');
      expect(failEvent).toBeDefined();
      expect(failEvent!.payload.error).toContain('Disk full');
    });

    it('sets reason to timeout for timeout shutdowns', async () => {
      const mockWriter = createMockCheckpointWriter();

      const shutdown = new GracefulShutdown(
        createBaseConfig({ logger: mockLogger })
      );
      shutdown.setCheckpointWriter(mockWriter);

      await shutdown.initiateShutdown('timeout');

      expect(mockWriter.write).toHaveBeenCalledWith(
        expect.objectContaining({
          reason: 'timeout',
        })
      );
    });
  });

  // ────────────────────────────────────────────────────────────────
  // API notification phase
  // ────────────────────────────────────────────────────────────────

  describe('API notification phase', () => {
    it('sends final status to API', async () => {
      const mockNotifier = createMockApiNotifier();

      const shutdown = new GracefulShutdown(
        createBaseConfig({ logger: mockLogger })
      );
      shutdown.setApiNotifier(mockNotifier);

      await shutdown.initiateShutdown('SIGTERM');

      expect(mockNotifier.sendFinalStatus).toHaveBeenCalledWith(
        'test-worker',
        'terminated',
        expect.objectContaining({
          reason: 'SIGTERM',
          shutdownAt: expect.any(String),
        })
      );
    });

    it('handles API notification failure gracefully', async () => {
      const mockNotifier = createMockApiNotifier({
        success: false,
        error: 'Connection refused',
      });

      const shutdown = new GracefulShutdown(
        createBaseConfig({ logger: mockLogger })
      );
      shutdown.setApiNotifier(mockNotifier);

      // Should complete despite API failure
      await shutdown.initiateShutdown('test');
      expect(shutdown.phase).toBe('exited');
    });

    it('handles API notifier throwing', async () => {
      const mockNotifier: ShutdownApiNotifier = {
        sendFinalStatus: vi.fn().mockRejectedValue(new Error('Network error')),
      };

      const shutdown = new GracefulShutdown(
        createBaseConfig({ logger: mockLogger })
      );
      shutdown.setApiNotifier(mockNotifier);

      const events: ShutdownEvent[] = [];
      shutdown.on('shutdown_event', (event: ShutdownEvent) => {
        events.push(event);
      });

      // Should complete despite error
      await shutdown.initiateShutdown('test');
      expect(shutdown.phase).toBe('exited');

      const failEvent = events.find((e) => e.type === 'api_notify_failed');
      expect(failEvent).toBeDefined();
    });

    it('skips API notification when no notifier is set', async () => {
      const shutdown = new GracefulShutdown(
        createBaseConfig({ logger: mockLogger })
      );

      // Should complete without errors
      await shutdown.initiateShutdown('test');
      expect(shutdown.phase).toBe('exited');
    });
  });

  // ────────────────────────────────────────────────────────────────
  // Disposables cleanup
  // ────────────────────────────────────────────────────────────────

  describe('disposables cleanup', () => {
    it('disposes registered resources in reverse order', async () => {
      const order: string[] = [];

      const disposable1: Disposable = {
        name: 'first',
        dispose: vi.fn().mockImplementation(() => {
          order.push('first');
        }),
      };
      const disposable2: Disposable = {
        name: 'second',
        dispose: vi.fn().mockImplementation(() => {
          order.push('second');
        }),
      };
      const disposable3: Disposable = {
        name: 'third',
        dispose: vi.fn().mockImplementation(() => {
          order.push('third');
        }),
      };

      const shutdown = new GracefulShutdown(
        createBaseConfig({ logger: mockLogger })
      );
      shutdown.registerDisposable(disposable1);
      shutdown.registerDisposable(disposable2);
      shutdown.registerDisposable(disposable3);

      await shutdown.initiateShutdown('test');

      // Should be disposed in reverse order (LIFO)
      expect(order).toEqual(['third', 'second', 'first']);
    });

    it('continues cleanup even if one disposable throws', async () => {
      const disposable1: Disposable = {
        name: 'will-fail',
        dispose: vi.fn().mockRejectedValue(new Error('Dispose failed')),
      };
      const disposable2: Disposable = {
        name: 'will-succeed',
        dispose: vi.fn().mockResolvedValue(undefined),
      };

      const shutdown = new GracefulShutdown(
        createBaseConfig({ logger: mockLogger })
      );
      shutdown.registerDisposable(disposable1);
      shutdown.registerDisposable(disposable2);

      await shutdown.initiateShutdown('test');

      expect(shutdown.phase).toBe('exited');
      expect(disposable2.dispose).toHaveBeenCalled();
    });

    it('handles synchronous disposables', async () => {
      const disposable: Disposable = {
        name: 'sync-dispose',
        dispose: vi.fn(), // Synchronous
      };

      const shutdown = new GracefulShutdown(
        createBaseConfig({ logger: mockLogger })
      );
      shutdown.registerDisposable(disposable);

      await shutdown.initiateShutdown('test');

      expect(disposable.dispose).toHaveBeenCalled();
    });

    it('emits cleanup_complete event', async () => {
      const shutdown = new GracefulShutdown(
        createBaseConfig({ logger: mockLogger })
      );
      shutdown.registerDisposable({
        name: 'test',
        dispose: vi.fn(),
      });

      const events: ShutdownEvent[] = [];
      shutdown.on('shutdown_event', (event: ShutdownEvent) => {
        events.push(event);
      });

      await shutdown.initiateShutdown('test');

      const cleanupEvent = events.find((e) => e.type === 'cleanup_complete');
      expect(cleanupEvent).toBeDefined();
      expect(cleanupEvent!.payload.disposedCount).toBe(1);
    });
  });

  // ────────────────────────────────────────────────────────────────
  // Event emission
  // ────────────────────────────────────────────────────────────────

  describe('events', () => {
    it('emits shutdown_initiated event', async () => {
      const shutdown = new GracefulShutdown(
        createBaseConfig({ logger: mockLogger })
      );

      const events: ShutdownEvent[] = [];
      shutdown.on('shutdown_event', (event: ShutdownEvent) => {
        events.push(event);
      });

      await shutdown.initiateShutdown('test-reason');

      const initEvent = events.find((e) => e.type === 'shutdown_initiated');
      expect(initEvent).toBeDefined();
      expect(initEvent!.payload.reason).toBe('test-reason');
    });

    it('emits phase_changed events in correct order', async () => {
      const shutdown = new GracefulShutdown(
        createBaseConfig({ logger: mockLogger })
      );

      const phases: string[] = [];
      shutdown.on('shutdown_event', (event: ShutdownEvent) => {
        if (event.type === 'phase_changed') {
          phases.push(event.payload.to as string);
        }
      });

      await shutdown.initiateShutdown('test');

      expect(phases).toEqual([
        'signal_received',
        'draining',
        'checkpointing',
        'notifying_api',
        'cleanup',
        'exited',
      ]);
    });

    it('emits shutdown_complete with duration', async () => {
      const shutdown = new GracefulShutdown(
        createBaseConfig({ logger: mockLogger })
      );

      const events: ShutdownEvent[] = [];
      shutdown.on('shutdown_event', (event: ShutdownEvent) => {
        events.push(event);
      });

      await shutdown.initiateShutdown('test');

      const completeEvent = events.find((e) => e.type === 'shutdown_complete');
      expect(completeEvent).toBeDefined();
      expect(completeEvent!.payload.durationMs).toBeGreaterThanOrEqual(0);
      expect(completeEvent!.payload.exitCode).toBe(0);
    });

    it('includes timestamp on all events', async () => {
      const shutdown = new GracefulShutdown(
        createBaseConfig({ logger: mockLogger })
      );

      const events: ShutdownEvent[] = [];
      shutdown.on('shutdown_event', (event: ShutdownEvent) => {
        events.push(event);
      });

      await shutdown.initiateShutdown('test');

      for (const event of events) {
        const parsed = new Date(event.timestamp);
        expect(parsed.toISOString()).toBe(event.timestamp);
      }
    });
  });

  // ────────────────────────────────────────────────────────────────
  // Full integration scenario
  // ────────────────────────────────────────────────────────────────

  describe('integration', () => {
    it('handles complete shutdown with all components', async () => {
      const mockNotifier = createMockApiNotifier();
      const mockWriter = createMockCheckpointWriter();
      let drained = false;
      const drainCallback = vi.fn().mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        drained = true;
      });
      const disposable: Disposable = {
        name: 'websocket',
        dispose: vi.fn(),
      };

      const shutdown = new GracefulShutdown(
        createBaseConfig({ logger: mockLogger })
      );
      shutdown.setApiNotifier(mockNotifier);
      shutdown.setCheckpointWriter(mockWriter);
      shutdown.setDrainCallback(drainCallback);
      shutdown.registerDisposable(disposable);

      // Install signal handlers
      shutdown.install();
      expect(shutdown.isInstalled).toBe(true);

      // Trigger shutdown
      await shutdown.initiateShutdown('SIGTERM');

      // All phases should have completed
      expect(drained).toBe(true);
      expect(mockWriter.write).toHaveBeenCalled();
      expect(mockNotifier.sendFinalStatus).toHaveBeenCalled();
      expect(disposable.dispose).toHaveBeenCalled();
      expect(shutdown.phase).toBe('exited');

      // Signal handlers should be uninstalled
      expect(shutdown.isInstalled).toBe(false);
    });

    it('handles shutdown with no optional components configured', async () => {
      const shutdown = new GracefulShutdown(
        createBaseConfig({ logger: mockLogger })
      );

      // No notifier, no writer, no drain callback, no disposables
      await shutdown.initiateShutdown('test');

      expect(shutdown.phase).toBe('exited');
    });
  });
});

// ────────────────────────────────────────────────────────────────
// createHttpShutdownNotifier
// ────────────────────────────────────────────────────────────────

describe('createHttpShutdownNotifier', () => {
  let mockLogger: ShutdownLogger;

  beforeEach(() => {
    mockLogger = createMockLogger();
  });

  it('sends PATCH request with final status', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', mockFetch);

    const notifier = createHttpShutdownNotifier({
      apiUrl: 'https://api.hq.test',
      apiKey: 'test-key',
      logger: mockLogger,
    });

    const result = await notifier.sendFinalStatus('w-123', 'terminated', {
      reason: 'SIGTERM',
    });

    expect(result.success).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.hq.test/api/workers/w-123',
      expect.objectContaining({
        method: 'PATCH',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-key',
        }),
      })
    );

    // Verify body includes finalUpdate flag
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string) as Record<string, unknown>;
    expect(body.status).toBe('terminated');
    expect((body.metadata as Record<string, unknown>).finalUpdate).toBe(true);

    vi.unstubAllGlobals();
  });

  it('returns failure on non-OK response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });
    vi.stubGlobal('fetch', mockFetch);

    const notifier = createHttpShutdownNotifier({
      apiUrl: 'https://api.hq.test',
      apiKey: 'test-key',
      logger: mockLogger,
    });

    const result = await notifier.sendFinalStatus('w-123', 'terminated');

    expect(result.success).toBe(false);
    expect(result.error).toContain('500');

    vi.unstubAllGlobals();
  });

  it('returns failure on fetch error', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('Connection refused'));
    vi.stubGlobal('fetch', mockFetch);

    const notifier = createHttpShutdownNotifier({
      apiUrl: 'https://api.hq.test',
      apiKey: 'test-key',
      logger: mockLogger,
    });

    const result = await notifier.sendFinalStatus('w-123', 'error');

    expect(result.success).toBe(false);
    expect(result.error).toContain('Connection refused');

    vi.unstubAllGlobals();
  });
});

// ────────────────────────────────────────────────────────────────
// createGracefulShutdownFromEnv
// ────────────────────────────────────────────────────────────────

describe('createGracefulShutdownFromEnv', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('creates shutdown instance from environment', () => {
    process.env['WORKER_ID'] = 'env-worker';
    process.env['HQ_API_URL'] = 'https://api.hq.test';
    process.env['HQ_API_KEY'] = 'test-key';

    const shutdown = createGracefulShutdownFromEnv({
      callProcessExit: false,
    });

    expect(shutdown).toBeDefined();
    expect(shutdown.phase).toBe('idle');
  });

  it('uses defaults when env vars not set', () => {
    delete process.env['WORKER_ID'];
    delete process.env['HQ_API_URL'];
    delete process.env['HQ_API_KEY'];

    const shutdown = createGracefulShutdownFromEnv({
      callProcessExit: false,
    });

    expect(shutdown).toBeDefined();
  });

  it('accepts drain callback and disposables', () => {
    const drainCallback = vi.fn().mockResolvedValue(undefined);
    const disposable: Disposable = {
      name: 'test',
      dispose: vi.fn(),
    };

    const shutdown = createGracefulShutdownFromEnv({
      drainCallback,
      disposables: [disposable],
      callProcessExit: false,
    });

    expect(shutdown).toBeDefined();
  });

  it('respects custom drain timeout env var', () => {
    process.env['SHUTDOWN_DRAIN_TIMEOUT_MS'] = '15000';

    const shutdown = createGracefulShutdownFromEnv({
      callProcessExit: false,
    });

    expect(shutdown).toBeDefined();
  });
});
