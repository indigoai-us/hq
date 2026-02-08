/**
 * Observability module exports
 *
 * Provides health checks, metrics, tracing, and alerting
 */

// Types
export type {
  HealthStatus,
  ComponentHealth,
  HealthCheckResponse,
  LivenessResponse,
  ReadinessResponse,
  MetricType,
  MetricDefinition,
  MetricDataPoint,
  MetricsProvider,
  AlertSeverity,
  Alert,
  AlertProvider,
  AlertRule,
  RequestContext,
  LogEntry,
} from './types.js';

// Health checks
export {
  registerHealthCheck,
  unregisterHealthCheck,
  clearHealthChecks,
  runHealthChecks,
  isReady,
  isLive,
  BuiltInChecks,
  type HealthCheckFn,
} from './health.js';

// Metrics
export {
  MockCloudWatchMetrics,
  getMetrics,
  resetMetrics,
  ApiMetrics,
  type MetricsConfig,
} from './metrics.js';

// Alerts
export {
  MockAlertProvider,
  getAlertProvider,
  resetAlertProvider,
  AlertNames,
  alertOnError,
  alertCritical,
  type AlertConfig,
} from './alerts.js';

// Tracing
export {
  registerTracing,
  getCorrelationId,
  getRequestId,
  getTraceContext,
  createChildLogger,
  CORRELATION_ID_HEADER,
  REQUEST_ID_HEADER,
} from './tracing.js';

// Request metrics hook
export { registerRequestMetrics } from './request-metrics.js';
