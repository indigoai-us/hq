/**
 * Alert provider stub for error alerting
 * In production, this would integrate with PagerDuty, Slack, etc.
 */

import type { Alert, AlertProvider, AlertRule, AlertSeverity } from './types.js';
import { randomUUID } from 'crypto';

/**
 * Alert configuration
 */
export interface AlertConfig {
  enabled: boolean;
  defaultThrottleMs: number;
  webhookUrl?: string;
  slackChannel?: string;
}

/**
 * Default alert configuration
 */
const DEFAULT_CONFIG: AlertConfig = {
  enabled: true,
  defaultThrottleMs: 60000, // 1 minute between duplicate alerts
};

/**
 * Mock alert provider
 * Logs alerts and can be configured with webhook endpoints
 */
export class MockAlertProvider implements AlertProvider {
  private config: AlertConfig;
  private rules: AlertRule[] = [];
  private lastAlerts: Map<string, number> = new Map();
  private alertHistory: Alert[] = [];

  constructor(config: Partial<AlertConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Send an alert
   */
  async send(alertInput: Omit<Alert, 'id' | 'timestamp'>): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    const alert: Alert = {
      ...alertInput,
      id: randomUUID(),
      timestamp: new Date(),
    };

    // Check throttling
    const throttleKey = `${alert.name}:${alert.severity}`;
    const lastSent = this.lastAlerts.get(throttleKey);
    const now = Date.now();

    if (lastSent) {
      const throttleMs = this.getThrottleForAlert(alert.name);
      if (now - lastSent < throttleMs) {
        // Throttled, skip sending
        return;
      }
    }

    this.lastAlerts.set(throttleKey, now);
    this.alertHistory.push(alert);

    // In production, this would send to external services
    // For now, log the alert
    const logFn = this.getLogFunction(alert.severity);
    logFn(`[ALERT] ${alert.severity.toUpperCase()}: ${alert.name} - ${alert.message}`, {
      alertId: alert.id,
      context: alert.context,
    });

    // Mock webhook call
    if (this.config.webhookUrl) {
      await this.sendToWebhook(alert);
    }
  }

  /**
   * Configure alert rules
   */
  configure(rules: AlertRule[]): void {
    this.rules = rules;
  }

  /**
   * Get alert history (for testing)
   */
  getHistory(): Alert[] {
    return [...this.alertHistory];
  }

  /**
   * Clear history (for testing)
   */
  clearHistory(): void {
    this.alertHistory = [];
    this.lastAlerts.clear();
  }

  private getThrottleForAlert(name: string): number {
    const rule = this.rules.find((r) => r.name === name);
    return rule?.throttleMs ?? this.config.defaultThrottleMs;
  }

  private getLogFunction(severity: AlertSeverity): typeof console.log {
    switch (severity) {
      case 'critical':
      case 'error':
        return console.error;
      case 'warning':
        return console.warn;
      default:
        return console.log;
    }
  }

  private async sendToWebhook(alert: Alert): Promise<void> {
    // Mock webhook implementation
    // In production, this would actually POST to the webhook URL
    if (process.env.ALERTS_DEBUG === 'true') {
      console.log(`[Alerts] Would send to webhook: ${this.config.webhookUrl}`, alert);
    }
    await Promise.resolve();
  }
}

/**
 * Singleton alert provider instance
 */
let alertInstance: MockAlertProvider | null = null;

/**
 * Get the alert provider instance
 */
export function getAlertProvider(): MockAlertProvider {
  if (!alertInstance) {
    alertInstance = new MockAlertProvider();
  }
  return alertInstance;
}

/**
 * Reset alert provider (for testing)
 */
export function resetAlertProvider(): void {
  if (alertInstance) {
    alertInstance.clearHistory();
    alertInstance = null;
  }
}

/**
 * Standard alert names
 */
export const AlertNames = {
  /** High error rate detected */
  HIGH_ERROR_RATE: 'high_error_rate',
  /** Service unhealthy */
  SERVICE_UNHEALTHY: 'service_unhealthy',
  /** Rate limit exceeded frequently */
  RATE_LIMIT_ABUSE: 'rate_limit_abuse',
  /** Database connection failed */
  DATABASE_CONNECTION_FAILED: 'database_connection_failed',
  /** External service unavailable */
  EXTERNAL_SERVICE_DOWN: 'external_service_down',
  /** Worker spawn failed */
  WORKER_SPAWN_FAILED: 'worker_spawn_failed',
} as const;

/**
 * Helper to send error alerts
 */
export async function alertOnError(
  error: Error,
  context?: Record<string, unknown>
): Promise<void> {
  const alertProvider = getAlertProvider();
  await alertProvider.send({
    name: 'error',
    severity: 'error',
    message: error.message,
    context: {
      errorName: error.name,
      stack: error.stack,
      ...context,
    },
  });
}

/**
 * Helper to send critical alerts
 */
export async function alertCritical(
  name: string,
  message: string,
  context?: Record<string, unknown>
): Promise<void> {
  const alertProvider = getAlertProvider();
  await alertProvider.send({
    name,
    severity: 'critical',
    message,
    context,
  });
}
