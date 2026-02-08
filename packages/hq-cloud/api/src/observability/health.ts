/**
 * Health check service with component dependency checks
 */

import type { HealthStatus, ComponentHealth, HealthCheckResponse } from './types.js';

/**
 * Health check function type
 */
export type HealthCheckFn = () => Promise<ComponentHealth> | ComponentHealth;

/**
 * Registered health checks
 */
const healthChecks: Map<string, HealthCheckFn> = new Map();

/**
 * Service version
 */
const SERVICE_VERSION = process.env.npm_package_version ?? '0.1.0';

/**
 * Service start time for uptime calculation
 */
const startTime = Date.now();

/**
 * Register a health check for a component
 */
export function registerHealthCheck(name: string, check: HealthCheckFn): void {
  healthChecks.set(name, check);
}

/**
 * Unregister a health check
 */
export function unregisterHealthCheck(name: string): void {
  healthChecks.delete(name);
}

/**
 * Clear all health checks (for testing)
 */
export function clearHealthChecks(): void {
  healthChecks.clear();
}

/**
 * Run all health checks and return aggregated status
 */
export async function runHealthChecks(): Promise<HealthCheckResponse> {
  const components: Record<string, ComponentHealth> = {};
  let overallStatus: HealthStatus = 'healthy';

  // Run all registered checks
  for (const [name, check] of healthChecks) {
    try {
      const startTime = Date.now();
      const result = await check();
      const latencyMs = Date.now() - startTime;

      components[name] = {
        ...result,
        latencyMs: result.latencyMs ?? latencyMs,
        lastCheck: new Date().toISOString(),
      };

      // Degrade overall status if any component is not healthy
      if (result.status === 'unhealthy') {
        overallStatus = 'unhealthy';
      } else if (result.status === 'degraded' && overallStatus === 'healthy') {
        overallStatus = 'degraded';
      }
    } catch (error) {
      components[name] = {
        status: 'unhealthy',
        message: error instanceof Error ? error.message : 'Check failed',
        lastCheck: new Date().toISOString(),
      };
      overallStatus = 'unhealthy';
    }
  }

  // If no checks registered, add a self check
  if (healthChecks.size === 0) {
    components['self'] = {
      status: 'healthy',
      message: 'Service is running',
      lastCheck: new Date().toISOString(),
    };
  }

  return {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    version: SERVICE_VERSION,
    uptime: (Date.now() - startTime) / 1000,
    components,
  };
}

/**
 * Check if service is ready to accept traffic
 * Returns false if any critical component is unhealthy
 */
export async function isReady(): Promise<{ ready: boolean; checks: Record<string, boolean> }> {
  const checks: Record<string, boolean> = {};
  let ready = true;

  for (const [name, check] of healthChecks) {
    try {
      const result = await check();
      checks[name] = result.status !== 'unhealthy';
      if (result.status === 'unhealthy') {
        ready = false;
      }
    } catch {
      checks[name] = false;
      ready = false;
    }
  }

  // If no checks, service is ready
  if (healthChecks.size === 0) {
    checks['self'] = true;
  }

  return { ready, checks };
}

/**
 * Check if service is alive (simple liveness check)
 */
export function isLive(): boolean {
  // Simple check - if we can execute this, we're alive
  return true;
}

/**
 * Built-in health checks for common dependencies
 */
export const BuiltInChecks = {
  /**
   * Memory usage check - degrades if usage is high
   */
  memory: (): ComponentHealth => {
    const usage = process.memoryUsage();
    const heapUsedMB = usage.heapUsed / 1024 / 1024;
    const heapTotalMB = usage.heapTotal / 1024 / 1024;
    const usagePercent = (heapUsedMB / heapTotalMB) * 100;

    let status: HealthStatus = 'healthy';
    if (usagePercent > 90) {
      status = 'unhealthy';
    } else if (usagePercent > 75) {
      status = 'degraded';
    }

    return {
      status,
      message: `Heap: ${heapUsedMB.toFixed(1)}MB / ${heapTotalMB.toFixed(1)}MB (${usagePercent.toFixed(1)}%)`,
    };
  },

  /**
   * Event loop check - measures event loop lag
   */
  eventLoop: (): Promise<ComponentHealth> => {
    return new Promise((resolve) => {
      const start = Date.now();
      setImmediate(() => {
        const lag = Date.now() - start;
        let status: HealthStatus = 'healthy';
        if (lag > 100) {
          status = 'unhealthy';
        } else if (lag > 50) {
          status = 'degraded';
        }

        resolve({
          status,
          latencyMs: lag,
          message: `Event loop lag: ${lag}ms`,
        });
      });
    });
  },

  /**
   * Create a database connection check (stub)
   */
  createDatabaseCheck: (connectionFn: () => Promise<boolean>): HealthCheckFn => {
    return async (): Promise<ComponentHealth> => {
      const startTime = Date.now();
      try {
        const connected = await connectionFn();
        return {
          status: connected ? 'healthy' : 'unhealthy',
          latencyMs: Date.now() - startTime,
          message: connected ? 'Connected' : 'Connection failed',
        };
      } catch (error) {
        return {
          status: 'unhealthy',
          latencyMs: Date.now() - startTime,
          message: error instanceof Error ? error.message : 'Connection failed',
        };
      }
    };
  },

  /**
   * Create an external service check
   */
  createExternalServiceCheck: (
    name: string,
    checkFn: () => Promise<boolean>,
    timeoutMs = 5000
  ): HealthCheckFn => {
    return async (): Promise<ComponentHealth> => {
      const startTime = Date.now();
      try {
        const result = await Promise.race([
          checkFn(),
          new Promise<boolean>((_, reject) =>
            setTimeout(() => reject(new Error('Timeout')), timeoutMs)
          ),
        ]);

        return {
          status: result ? 'healthy' : 'degraded',
          latencyMs: Date.now() - startTime,
          message: result ? `${name} is available` : `${name} check failed`,
        };
      } catch (error) {
        return {
          status: 'degraded',
          latencyMs: Date.now() - startTime,
          message: error instanceof Error ? error.message : 'Check failed',
        };
      }
    };
  },
};
