/**
 * Observability types for health checks, metrics, and tracing
 */

/**
 * Health check status levels
 */
export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';

/**
 * Individual component health check result
 */
export interface ComponentHealth {
  status: HealthStatus;
  latencyMs?: number;
  message?: string;
  lastCheck?: string;
}

/**
 * Overall health response including component checks
 */
export interface HealthCheckResponse {
  status: HealthStatus;
  timestamp: string;
  version: string;
  uptime: number;
  components: Record<string, ComponentHealth>;
}

/**
 * Liveness check response (is the process running)
 */
export interface LivenessResponse {
  live: boolean;
}

/**
 * Readiness check response (can the service handle traffic)
 */
export interface ReadinessResponse {
  ready: boolean;
  checks?: Record<string, boolean>;
}

/**
 * Metric types supported
 */
export type MetricType = 'counter' | 'gauge' | 'histogram' | 'timer';

/**
 * Metric definition
 */
export interface MetricDefinition {
  name: string;
  type: MetricType;
  description: string;
  unit?: string;
  dimensions?: string[];
}

/**
 * Metric data point
 */
export interface MetricDataPoint {
  name: string;
  value: number;
  timestamp: Date;
  dimensions?: Record<string, string>;
  unit?: string;
}

/**
 * Metrics provider interface (CloudWatch, DataDog, etc.)
 */
export interface MetricsProvider {
  /**
   * Increment a counter metric
   */
  increment(name: string, value?: number, dimensions?: Record<string, string>): void;

  /**
   * Set a gauge metric value
   */
  gauge(name: string, value: number, dimensions?: Record<string, string>): void;

  /**
   * Record a histogram value
   */
  histogram(name: string, value: number, dimensions?: Record<string, string>): void;

  /**
   * Record a timer value in milliseconds
   */
  timing(name: string, durationMs: number, dimensions?: Record<string, string>): void;

  /**
   * Start a timer and return a function to stop it
   */
  startTimer(name: string, dimensions?: Record<string, string>): () => void;

  /**
   * Flush any buffered metrics
   */
  flush(): Promise<void>;
}

/**
 * Alert severity levels
 */
export type AlertSeverity = 'info' | 'warning' | 'error' | 'critical';

/**
 * Alert definition
 */
export interface Alert {
  id: string;
  name: string;
  severity: AlertSeverity;
  message: string;
  timestamp: Date;
  context?: Record<string, unknown>;
}

/**
 * Alert provider interface
 */
export interface AlertProvider {
  /**
   * Send an alert
   */
  send(alert: Omit<Alert, 'id' | 'timestamp'>): Promise<void>;

  /**
   * Configure alert rules
   */
  configure(rules: AlertRule[]): void;
}

/**
 * Alert rule definition
 */
export interface AlertRule {
  name: string;
  condition: string;
  severity: AlertSeverity;
  throttleMs?: number;
}

/**
 * Request context for tracing
 */
export interface RequestContext {
  correlationId: string;
  requestId: string;
  startTime: number;
  method: string;
  path: string;
  userAgent?: string;
  clientIp?: string;
}

/**
 * Log entry structure for structured logging
 */
export interface LogEntry {
  level: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  message: string;
  timestamp: string;
  correlationId?: string;
  requestId?: string;
  duration?: number;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
  context?: Record<string, unknown>;
}
