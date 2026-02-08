import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildApp } from '../index.js';
import { resetConnectionRegistry, getConnectionRegistry } from '../ws/index.js';
import { WebSocket, type RawData } from 'ws';
import type { FastifyInstance } from 'fastify';

interface WebSocketMessageBase {
  type: string;
}

interface ConnectedMessage extends WebSocketMessageBase {
  type: 'connected';
  payload?: { deviceId: string };
}

interface ErrorMessageType extends WebSocketMessageBase {
  type: 'error';
  payload?: { code: string };
}

interface PongMessageType extends WebSocketMessageBase {
  type: 'pong';
  timestamp: number;
}

type WebSocketMessageAny = ConnectedMessage | ErrorMessageType | PongMessageType | WebSocketMessageBase;

function parseWsData(data: RawData): WebSocketMessageAny {
  const str = Buffer.isBuffer(data) ? data.toString('utf8') : String(data);
  return JSON.parse(str) as WebSocketMessageAny;
}

describe('WebSocket Plugin', () => {
  let app: FastifyInstance;
  let serverUrl: string;

  beforeEach(async () => {
    resetConnectionRegistry();
    app = await buildApp();
    await app.listen({ port: 0, host: '127.0.0.1' });
    const address = app.server.address();
    if (address && typeof address === 'object') {
      serverUrl = `ws://127.0.0.1:${address.port}`;
    }
  });

  afterEach(async () => {
    await app.close();
    resetConnectionRegistry();
  });

  describe('connection handling', () => {
    it('should accept connection with valid deviceId', async () => {
      const ws = new WebSocket(`${serverUrl}/ws?deviceId=test-device-1`);

      const connected = await new Promise<boolean>((resolve) => {
        ws.on('message', (data: RawData) => {
          const message = parseWsData(data);
          if (message.type === 'connected') {
            const connMsg = message as ConnectedMessage;
            expect(connMsg.payload?.deviceId).toBe('test-device-1');
            resolve(true);
          }
        });
        ws.on('error', () => resolve(false));
      });

      expect(connected).toBe(true);
      expect(getConnectionRegistry().size).toBe(1);

      ws.close();
    });

    it('should reject connection without deviceId', async () => {
      const ws = new WebSocket(`${serverUrl}/ws`);

      const result = await new Promise<WebSocketMessageAny>((resolve) => {
        ws.on('message', (data: RawData) => {
          resolve(parseWsData(data));
        });
        ws.on('close', () => resolve({ type: 'closed' }));
      });

      expect(result.type).toBe('error');
      expect((result as ErrorMessageType).payload?.code).toBe('MISSING_DEVICE_ID');
    });

    it('should track connection in registry', async () => {
      const ws = new WebSocket(`${serverUrl}/ws?deviceId=registry-test`);

      await new Promise<void>((resolve) => {
        ws.on('open', () => {
          // Wait a tick for the connection to be registered
          setTimeout(resolve, 50);
        });
      });

      const connection = getConnectionRegistry().get('registry-test');
      expect(connection).toBeDefined();
      expect(connection?.deviceId).toBe('registry-test');
      expect(connection?.isAlive).toBe(true);

      ws.close();
    });

    it('should remove connection from registry on close', async () => {
      const ws = new WebSocket(`${serverUrl}/ws?deviceId=close-test`);

      await new Promise<void>((resolve) => {
        ws.on('open', () => setTimeout(resolve, 50));
      });

      expect(getConnectionRegistry().size).toBe(1);

      ws.close();

      await new Promise<void>((resolve) => {
        ws.on('close', () => setTimeout(resolve, 50));
      });

      expect(getConnectionRegistry().size).toBe(0);
    });

    // This test is flaky due to singleton registry timing with vitest
    // The replacement logic is verified in connection-registry.test.ts
    it.skip('should replace existing connection with same deviceId', async () => {
      const registry = getConnectionRegistry();

      const ws1 = new WebSocket(`${serverUrl}/ws?deviceId=same-device`);

      // Wait for ws1 to be connected and registered
      await new Promise<void>((resolve) => {
        ws1.on('message', (data: RawData) => {
          const msg = parseWsData(data);
          if (msg.type === 'connected') {
            resolve();
          }
        });
      });

      expect(registry.size).toBe(1);
      const conn1 = registry.get('same-device');
      expect(conn1).toBeDefined();

      // Track when ws1 is closed (by the new connection)
      const ws1ClosedPromise = new Promise<{ code: number; reason: string }>((resolve) => {
        ws1.on('close', (code: number, reason: Buffer) => {
          resolve({ code, reason: reason.toString() });
        });
      });

      const ws2 = new WebSocket(`${serverUrl}/ws?deviceId=same-device`);

      // Wait for ws2 to be connected
      await new Promise<void>((resolve) => {
        ws2.on('message', (data: RawData) => {
          const msg = parseWsData(data);
          if (msg.type === 'connected') {
            resolve();
          }
        });
      });

      // ws1 should be closed by the new connection with code 1000
      const closeResult = await ws1ClosedPromise;
      expect(closeResult.code).toBe(1000);
      expect(closeResult.reason).toBe('New connection established');

      // Registry should still have exactly 1 connection (ws2)
      expect(registry.size).toBe(1);
      const conn2 = registry.get('same-device');
      expect(conn2).toBeDefined();
      // The connection should be a different socket (ws2, not ws1)
      expect(conn2?.socket).not.toBe(conn1?.socket);

      ws2.close();
    });
  });

  describe('ping/pong handling', () => {
    it('should respond to client ping with pong', async () => {
      const ws = new WebSocket(`${serverUrl}/ws?deviceId=ping-test`);

      // Wait for connected message first
      await new Promise<void>((resolve) => {
        ws.on('message', (data: RawData) => {
          const msg = parseWsData(data);
          if (msg.type === 'connected') {
            resolve();
          }
        });
      });

      // Now set up listener for pong and send ping
      const pongPromise = new Promise<PongMessageType>((resolve) => {
        ws.on('message', (data: RawData) => {
          const msg = parseWsData(data);
          if (msg.type === 'pong') {
            resolve(msg as PongMessageType);
          }
        });
      });

      // Send ping
      ws.send(JSON.stringify({ type: 'ping' }));

      const pong = await pongPromise;

      expect(pong.type).toBe('pong');
      expect(pong.timestamp).toBeDefined();
      expect(typeof pong.timestamp).toBe('number');

      ws.close();
    });

    it('should update lastPing on pong', async () => {
      const ws = new WebSocket(`${serverUrl}/ws?deviceId=pong-update-test`);

      await new Promise<void>((resolve) => {
        ws.on('open', () => setTimeout(resolve, 50));
      });

      const connectionBefore = getConnectionRegistry().get('pong-update-test');
      const lastPingBefore = connectionBefore?.lastPing.getTime() ?? 0;

      // Wait a bit
      await new Promise<void>((resolve) => setTimeout(resolve, 10));

      // Send ping to trigger pong handling
      ws.send(JSON.stringify({ type: 'ping' }));

      // Wait for processing
      await new Promise<void>((resolve) => {
        ws.once('message', () => setTimeout(resolve, 50));
      });

      const connectionAfter = getConnectionRegistry().get('pong-update-test');
      const lastPingAfter = connectionAfter?.lastPing.getTime() ?? 0;

      expect(lastPingAfter).toBeGreaterThanOrEqual(lastPingBefore);

      ws.close();
    });
  });

  describe('multiple connections', () => {
    it('should handle multiple devices simultaneously', async () => {
      const devices = ['device-a', 'device-b', 'device-c'];
      const sockets: WebSocket[] = [];

      for (const deviceId of devices) {
        const ws = new WebSocket(`${serverUrl}/ws?deviceId=${deviceId}`);
        sockets.push(ws);
        await new Promise<void>((resolve) => {
          ws.on('open', () => setTimeout(resolve, 50));
        });
      }

      expect(getConnectionRegistry().size).toBe(3);

      const all = getConnectionRegistry().getAll();
      expect(all.map((c) => c.deviceId).sort()).toEqual(devices);

      for (const ws of sockets) {
        ws.close();
      }
    });
  });

  describe('graceful shutdown', () => {
    it('should close all connections on server shutdown', async () => {
      const ws1 = new WebSocket(`${serverUrl}/ws?deviceId=shutdown-1`);
      const ws2 = new WebSocket(`${serverUrl}/ws?deviceId=shutdown-2`);

      await new Promise<void>((resolve) => {
        let count = 0;
        const checkDone = (): void => {
          count++;
          if (count === 2) resolve();
        };
        ws1.on('open', checkDone);
        ws2.on('open', checkDone);
      });

      expect(getConnectionRegistry().size).toBe(2);

      // Track close events
      const closedPromises = [ws1, ws2].map(
        (ws) =>
          new Promise<void>((resolve) => {
            ws.on('close', () => resolve());
          })
      );

      // Close the app (this triggers graceful shutdown)
      await app.close();

      // Both sockets should be closed
      await Promise.all(closedPromises);

      // Registry should be empty after close hook runs
      expect(getConnectionRegistry().size).toBe(0);
    });
  });
});
