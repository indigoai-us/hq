/**
 * Metrics abstraction with CloudWatch mock implementation
 */

import type { MetricsProvider, MetricDataPoint } from './types.js';

/**
 * Metrics configuration
 */
export interface MetricsConfig {
  enabled: boolean;
  namespace: string;
  flushIntervalMs: number;
  bufferSize: number;
}

/**
 * Default metrics configuration
 */
const DEFAULT_CONFIG: MetricsConfig = {
  enabled: true,
  namespace: 'HQCloud/API',
  flushIntervalMs: 60000,
  bufferSize: 100,
};

/**
 * Mock CloudWatch metrics provider
 * In production, this would send metrics to actual CloudWatch
 */
export class MockCloudWatchMetrics implements MetricsProvider {
  private buffer: MetricDataPoint[] = [];
  private config: MetricsConfig;
  private flushTimer?: NodeJS.Timeout;

  constructor(config: Partial<MetricsConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    if (this.config.enabled && this.config.flushIntervalMs > 0) {
      this.flushTimer = setInterval(() => {
        void this.flush();
      }, this.config.flushIntervalMs);
    }
  }

  /**
   * Increment a counter metric
   */
  increment(name: string, value = 1, dimensions?: Record<string, string>): void {
    this.addDataPoint({
      name: `${name}.count`,
      value,
      timestamp: new Date(),
      dimensions,
      unit: 'Count',
    });
  }

  /**
   * Set a gauge metric value
   */
  gauge(name: string, value: number, dimensions?: Record<string, string>): void {
    this.addDataPoint({
      name,
      value,
      timestamp: new Date(),
      dimensions,
      unit: 'None',
    });
  }

  /**
   * Record a histogram value
   */
  histogram(name: string, value: number, dimensions?: Record<string, string>): void {
    this.addDataPoint({
      name,
      value,
      timestamp: new Date(),
      dimensions,
      unit: 'None',
    });
  }

  /**
   * Record a timer value in milliseconds
   */
  timing(name: string, durationMs: number, dimensions?: Record<string, string>): void {
    this.addDataPoint({
      name: `${name}.duration`,
      value: durationMs,
      timestamp: new Date(),
      dimensions,
      unit: 'Milliseconds',
    });
  }

  /**
   * Start a timer and return a function to stop it
   */
  startTimer(name: string, dimensions?: Record<string, string>): () => void {
    const startTime = Date.now();
    return () => {
      const duration = Date.now() - startTime;
      this.timing(name, duration, dimensions);
    };
  }

  /**
   * Flush buffered metrics
   * In production, this would send to CloudWatch
   */
  async flush(): Promise<void> {
    if (this.buffer.length === 0) {
      return;
    }

    const metricsToFlush = [...this.buffer];
    this.buffer = [];

    // Mock: In production, this would call CloudWatch PutMetricData API
    // For now, we just log the metrics if in debug mode
    if (process.env.METRICS_DEBUG === 'true') {
      console.log(`[Metrics] Flushing ${metricsToFlush.length} data points to ${this.config.namespace}`);
      for (const metric of metricsToFlush) {
        console.log(`  ${metric.name}: ${metric.value} ${metric.unit ?? ''}`);
      }
    }

    // Simulate async CloudWatch call
    await Promise.resolve();
  }

  /**
   * Get buffered metrics (for testing)
   */
  getBuffer(): MetricDataPoint[] {
    return [...this.buffer];
  }

  /**
   * Clear buffer (for testing)
   */
  clearBuffer(): void {
    this.buffer = [];
  }

  /**
   * Stop the flush timer
   */
  stop(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = undefined;
    }
  }

  private addDataPoint(dataPoint: MetricDataPoint): void {
    if (!this.config.enabled) {
      return;
    }

    this.buffer.push(dataPoint);

    // Auto-flush if buffer is full
    if (this.buffer.length >= this.config.bufferSize) {
      void this.flush();
    }
  }
}

/**
 * Singleton metrics instance
 */
let metricsInstance: MockCloudWatchMetrics | null = null;

/**
 * Get the metrics provider instance
 */
export function getMetrics(): MockCloudWatchMetrics {
  if (!metricsInstance) {
    metricsInstance = new MockCloudWatchMetrics();
  }
  return metricsInstance;
}

/**
 * Reset metrics instance (for testing)
 */
export function resetMetrics(): void {
  if (metricsInstance) {
    metricsInstance.stop();
    metricsInstance = null;
  }
}

/**
 * Standard API metrics
 */
export const ApiMetrics = {
  /** HTTP request count */
  REQUEST_COUNT: 'api.request',
  /** HTTP request duration */
  REQUEST_DURATION: 'api.request',
  /** HTTP error count */
  ERROR_COUNT: 'api.error',
  /** Active connections */
  ACTIVE_CONNECTIONS: 'api.connections.active',
  /** WebSocket connections */
  WEBSOCKET_CONNECTIONS: 'api.websocket.connections',
  /** Worker count by status */
  WORKER_COUNT: 'api.workers',
  /** Queue depth */
  QUEUE_DEPTH: 'api.queue.depth',
} as const;
