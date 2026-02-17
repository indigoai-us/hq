/**
 * API client for hq-cloud.
 * Reads stored credentials and attaches Authorization header to all requests.
 *
 * Base URL resolution order:
 * 1. HQ_CLOUD_API_URL environment variable
 * 2. ~/.hq/config.json "apiUrl" field
 * 3. Default production URL
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { readCredentials } from './credentials.js';

/** Default API base URL (production) */
const DEFAULT_API_URL = 'https://api.hq.getindigo.ai';

/** Path to optional config file */
const CONFIG_PATH = path.join(os.homedir(), '.hq', 'config.json');

/**
 * Resolve the hq-cloud API base URL.
 */
export function getApiUrl(): string {
  // 1. Environment variable takes precedence
  if (process.env['HQ_CLOUD_API_URL']) {
    return process.env['HQ_CLOUD_API_URL'].replace(/\/+$/, '');
  }

  // 2. Config file
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
      const config = JSON.parse(raw) as { apiUrl?: string };
      if (config.apiUrl) {
        return config.apiUrl.replace(/\/+$/, '');
      }
    }
  } catch {
    // Ignore config read errors
  }

  // 3. Default
  return DEFAULT_API_URL;
}

/** Standard response shape from the API */
export interface ApiResponse<T = unknown> {
  ok: boolean;
  status: number;
  data?: T;
  error?: string;
}

/**
 * Make an authenticated request to the hq-cloud API.
 * Throws if not logged in. Returns parsed JSON response.
 */
export async function apiRequest<T = unknown>(
  method: string,
  urlPath: string,
  body?: unknown,
): Promise<ApiResponse<T>> {
  const creds = readCredentials();
  if (!creds) {
    throw new Error('Not logged in. Run "hq auth login" first.');
  }

  const baseUrl = getApiUrl();
  const url = `${baseUrl}${urlPath.startsWith('/') ? urlPath : '/' + urlPath}`;

  const headers: Record<string, string> = {
    'Authorization': `Bearer ${creds.token}`,
    'Content-Type': 'application/json',
  };

  const fetchOptions: RequestInit = {
    method,
    headers,
  };

  if (body !== undefined && method !== 'GET') {
    fetchOptions.body = JSON.stringify(body);
  }

  const response = await fetch(url, fetchOptions);

  let data: T | undefined;
  try {
    data = await response.json() as T;
  } catch {
    // Response may not be JSON
  }

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: (data as Record<string, string> | undefined)?.message
        ?? (data as Record<string, string> | undefined)?.error
        ?? `HTTP ${response.status}`,
    };
  }

  return {
    ok: true,
    status: response.status,
    data,
  };
}
