import { describe, it, expect, beforeEach, vi } from 'vitest';
import { InMemoryConnectionRegistry } from '../ws/connection-registry.js';
import type { WebSocket } from 'ws';

// Mock WebSocket
function createMockSocket(readyState = 1): WebSocket {
  return {
    readyState,
    OPEN: 1,
    CLOSED: 3,
    close: vi.fn(),
    terminate: vi.fn(),
    send: vi.fn(),
    ping: vi.fn(),
    on: vi.fn(),
  } as unknown as WebSocket;
}

describe('InMemoryConnectionRegistry', () => {
  let registry: InMemoryConnectionRegistry;

  beforeEach(() => {
    registry = new InMemoryConnectionRegistry();
  });

  describe('add', () => {
    it('should add a new connection', () => {
      const socket = createMockSocket();
      registry.add('device-1', socket);

      expect(registry.size).toBe(1);
      const connection = registry.get('device-1');
      expect(connection).toBeDefined();
      expect(connection?.deviceId).toBe('device-1');
      expect(connection?.socket).toBe(socket);
      expect(connection?.isAlive).toBe(true);
    });

    it('should replace existing connection with same deviceId', () => {
      const socket1 = createMockSocket();
      const socket2 = createMockSocket();

      registry.add('device-1', socket1);
      registry.add('device-1', socket2);

      expect(registry.size).toBe(1);
      expect(registry.get('device-1')?.socket).toBe(socket2);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(socket1.close).toHaveBeenCalledWith(1000, 'New connection established');
    });

    it('should handle multiple different devices', () => {
      const socket1 = createMockSocket();
      const socket2 = createMockSocket();
      const socket3 = createMockSocket();

      registry.add('device-1', socket1);
      registry.add('device-2', socket2);
      registry.add('device-3', socket3);

      expect(registry.size).toBe(3);
    });
  });

  describe('remove', () => {
    it('should remove a connection', () => {
      const socket = createMockSocket();
      registry.add('device-1', socket);
      registry.remove('device-1');

      expect(registry.size).toBe(0);
      expect(registry.get('device-1')).toBeUndefined();
    });

    it('should handle removing non-existent connection', () => {
      expect(() => registry.remove('non-existent')).not.toThrow();
    });
  });

  describe('get', () => {
    it('should return connection for valid deviceId', () => {
      const socket = createMockSocket();
      registry.add('device-1', socket);

      const connection = registry.get('device-1');
      expect(connection?.deviceId).toBe('device-1');
    });

    it('should return undefined for non-existent deviceId', () => {
      expect(registry.get('non-existent')).toBeUndefined();
    });
  });

  describe('getAll', () => {
    it('should return all connections', () => {
      registry.add('device-1', createMockSocket());
      registry.add('device-2', createMockSocket());
      registry.add('device-3', createMockSocket());

      const all = registry.getAll();
      expect(all).toHaveLength(3);
      expect(all.map((c) => c.deviceId).sort()).toEqual(['device-1', 'device-2', 'device-3']);
    });

    it('should return empty array when no connections', () => {
      expect(registry.getAll()).toEqual([]);
    });
  });

  describe('updatePing', () => {
    it('should update lastPing timestamp', () => {
      const socket = createMockSocket();
      registry.add('device-1', socket);

      const initialPing = registry.get('device-1')?.lastPing;

      // Wait a bit to ensure timestamp difference
      vi.useFakeTimers();
      vi.advanceTimersByTime(100);

      registry.updatePing('device-1');

      const updatedPing = registry.get('device-1')?.lastPing;
      expect(updatedPing?.getTime()).toBeGreaterThan(initialPing?.getTime() ?? 0);

      vi.useRealTimers();
    });

    it('should mark connection as alive', () => {
      const socket = createMockSocket();
      registry.add('device-1', socket);
      registry.markDead('device-1');

      expect(registry.get('device-1')?.isAlive).toBe(false);

      registry.updatePing('device-1');

      expect(registry.get('device-1')?.isAlive).toBe(true);
    });

    it('should handle non-existent deviceId', () => {
      expect(() => registry.updatePing('non-existent')).not.toThrow();
    });
  });

  describe('markDead', () => {
    it('should mark connection as not alive', () => {
      const socket = createMockSocket();
      registry.add('device-1', socket);

      expect(registry.get('device-1')?.isAlive).toBe(true);

      registry.markDead('device-1');

      expect(registry.get('device-1')?.isAlive).toBe(false);
    });

    it('should handle non-existent deviceId', () => {
      expect(() => registry.markDead('non-existent')).not.toThrow();
    });
  });

  describe('clear', () => {
    it('should remove all connections and close sockets', () => {
      const socket1 = createMockSocket();
      const socket2 = createMockSocket();

      registry.add('device-1', socket1);
      registry.add('device-2', socket2);

      registry.clear();

      expect(registry.size).toBe(0);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(socket1.close).toHaveBeenCalledWith(1001, 'Server shutting down');
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(socket2.close).toHaveBeenCalledWith(1001, 'Server shutting down');
    });
  });

  describe('connection lifecycle', () => {
    it('should track connection timestamps correctly', () => {
      vi.useFakeTimers();
      const socket = createMockSocket();

      registry.add('device-1', socket);
      const connection = registry.get('device-1');

      expect(connection?.connectedAt).toBeInstanceOf(Date);
      expect(connection?.lastPing).toBeInstanceOf(Date);
      expect(connection?.connectedAt.getTime()).toBe(connection?.lastPing.getTime());

      vi.useRealTimers();
    });

    it('should handle full connection lifecycle', () => {
      const socket = createMockSocket();

      // Connect
      registry.add('device-1', socket);
      expect(registry.size).toBe(1);
      expect(registry.get('device-1')?.isAlive).toBe(true);

      // Server marks as dead (waiting for pong)
      registry.markDead('device-1');
      expect(registry.get('device-1')?.isAlive).toBe(false);

      // Client responds with pong
      registry.updatePing('device-1');
      expect(registry.get('device-1')?.isAlive).toBe(true);

      // Client disconnects
      registry.remove('device-1');
      expect(registry.size).toBe(0);
    });
  });
});
