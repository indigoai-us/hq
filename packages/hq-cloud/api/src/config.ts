interface Config {
  port: number;
  host: string;
  nodeEnv: string;
  logLevel: string;
  corsOrigin: string | string[] | boolean;
  wsHeartbeatInterval: number;
  wsPingTimeout: number;
}

function getEnv(key: string, defaultValue: string): string {
  return process.env[key] ?? defaultValue;
}

function getEnvNumber(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (value === undefined) {
    return defaultValue;
  }
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

export const config: Config = {
  port: getEnvNumber('PORT', 3000),
  host: getEnv('HOST', '0.0.0.0'),
  nodeEnv: getEnv('NODE_ENV', 'development'),
  logLevel: getEnv('LOG_LEVEL', 'info'),
  corsOrigin: getEnv('CORS_ORIGIN', '*') === '*' ? true : getEnv('CORS_ORIGIN', '*').split(','),
  wsHeartbeatInterval: getEnvNumber('WS_HEARTBEAT_INTERVAL', 30000),
  wsPingTimeout: getEnvNumber('WS_PING_TIMEOUT', 10000),
};
