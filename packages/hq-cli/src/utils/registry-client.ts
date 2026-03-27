/**
 * Registry client module — HTTP client for admin.getindigo.ai
 * US-010: Shared HTTP client used by install, update, search, and publish commands.
 */

import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface RegistryAuth {
  token: string;
  refreshToken?: string;
  expiresAt?: string;
}

export interface RegistryPackage {
  name: string;
  type: string;
  description: string;
  version: string;
  author?: string;
  downloadCount?: number;
  publishedAt?: string;
}

export interface PackageListMeta {
  total: number;
  limit: number;
  offset: number;
}

export interface PackageListResponse {
  data: RegistryPackage[];
  meta: PackageListMeta;
}

export interface DownloadInfo {
  url: string;
  checksum?: string;
  size?: number;
}

// ─── Errors ─────────────────────────────────────────────────────────────────

export class RegistryError extends Error {
  constructor(message: string, public readonly statusCode?: number) {
    super(message);
    this.name = 'RegistryError';
  }
}

export class RegistryAuthError extends RegistryError {
  constructor(message = 'Authentication required — run `hq login`') {
    super(message, 401);
    this.name = 'RegistryAuthError';
  }
}

export class RegistryNotFoundError extends RegistryError {
  constructor(resource: string) {
    super(`Not found: ${resource}`, 404);
    this.name = 'RegistryNotFoundError';
  }
}

export class ChecksumError extends Error {
  constructor(public readonly expected: string, public readonly actual: string) {
    super(`Checksum mismatch: expected ${expected}, got ${actual}`);
    this.name = 'ChecksumError';
  }
}

// ─── Client ─────────────────────────────────────────────────────────────────

const DEFAULT_REGISTRY_URL = 'https://admin.getindigo.ai';
const AUTH_FILE = path.join(homedir(), '.hq', 'auth.json');
const MAX_RETRIES = 2;
const REQUEST_TIMEOUT_MS = 30_000;
const DOWNLOAD_TIMEOUT_MS = 120_000;

export class RegistryClient {
  readonly baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = (
      baseUrl ?? process.env['HQ_REGISTRY_URL'] ?? DEFAULT_REGISTRY_URL
    ).replace(/\/$/, '');
  }

  // ── Auth ─────────────────────────────────────────────────────────────────

  private async loadAuth(): Promise<RegistryAuth | null> {
    try {
      const raw = await readFile(AUTH_FILE, 'utf8');
      return JSON.parse(raw) as RegistryAuth;
    } catch {
      return null;
    }
  }

  private async authHeaders(): Promise<Record<string, string>> {
    const auth = await this.loadAuth();
    if (!auth?.token) return {};
    return { Authorization: `Bearer ${auth.token}` };
  }

  // ── Core fetch with retry ────────────────────────────────────────────────

  private async fetchWithRetry(
    url: string,
    options: RequestInit = {},
    attempt = 0
  ): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(url, { ...options, signal: controller.signal });
    } catch (err: unknown) {
      clearTimeout(timer);
      const isAbort = err instanceof Error && err.name === 'AbortError';
      if (!isAbort && attempt < MAX_RETRIES) {
        return this.fetchWithRetry(url, options, attempt + 1);
      }
      throw new RegistryError(
        isAbort
          ? `Request timed out after ${REQUEST_TIMEOUT_MS}ms`
          : `Network error: ${String(err)}`
      );
    }
    clearTimeout(timer);

    // Retry on 5xx
    if (response.status >= 500 && attempt < MAX_RETRIES) {
      return this.fetchWithRetry(url, options, attempt + 1);
    }

    return response;
  }

  private async apiRequest<T>(
    method: string,
    apiPath: string,
    body?: unknown
  ): Promise<T> {
    const authHeaders = await this.authHeaders();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...authHeaders,
    };

    const init: RequestInit = { method, headers };
    if (body !== undefined) {
      init.body = JSON.stringify(body);
    }

    const response = await this.fetchWithRetry(`${this.baseUrl}${apiPath}`, init);

    if (response.status === 401) throw new RegistryAuthError();
    if (response.status === 404) throw new RegistryNotFoundError(apiPath);
    if (response.status >= 400) {
      const text = await response.text().catch(() => '');
      let message = `Registry error ${response.status}`;
      try {
        const json = JSON.parse(text) as { error?: string };
        if (json.error) message = json.error;
      } catch { /* keep default message */ }
      throw new RegistryError(message, response.status);
    }

    return response.json() as Promise<T>;
  }

  // ── Public API ───────────────────────────────────────────────────────────

  async listPackages(query?: string): Promise<PackageListResponse> {
    const qs = query ? `?q=${encodeURIComponent(query)}` : '';
    return this.apiRequest<PackageListResponse>('GET', `/api/packages${qs}`);
  }

  async getPackage(name: string): Promise<RegistryPackage> {
    return this.apiRequest<RegistryPackage>(
      'GET',
      `/api/packages/${encodeURIComponent(name)}`
    );
  }

  async getDownloadInfo(name: string): Promise<DownloadInfo> {
    return this.apiRequest<DownloadInfo>(
      'GET',
      `/api/packages/${encodeURIComponent(name)}/download`
    );
  }

  async publishPackage(formData: FormData): Promise<RegistryPackage> {
    const authHeaders = await this.authHeaders();
    if (!authHeaders['Authorization']) throw new RegistryAuthError();

    const response = await this.fetchWithRetry(`${this.baseUrl}/api/packages`, {
      method: 'POST',
      headers: authHeaders, // no Content-Type — let fetch set multipart boundary
      body: formData,
    });

    if (response.status === 401) throw new RegistryAuthError();
    if (response.status >= 400) {
      const text = await response.text().catch(() => '');
      let message = `Publish failed with status ${response.status}`;
      try {
        const json = JSON.parse(text) as { error?: string };
        if (json.error) message = json.error;
      } catch { /* keep default message */ }
      throw new RegistryError(message, response.status);
    }

    return response.json() as Promise<RegistryPackage>;
  }

  async publishVersion(name: string, formData: FormData): Promise<RegistryPackage> {
    const authHeaders = await this.authHeaders();
    if (!authHeaders['Authorization']) throw new RegistryAuthError();

    const response = await this.fetchWithRetry(
      `${this.baseUrl}/api/packages/${encodeURIComponent(name)}/versions`,
      { method: 'PUT', headers: authHeaders, body: formData }
    );

    if (response.status === 401) throw new RegistryAuthError();
    if (response.status === 404) throw new RegistryNotFoundError(name);
    if (response.status >= 400) {
      const text = await response.text().catch(() => '');
      let message = `Version publish failed with status ${response.status}`;
      try {
        const json = JSON.parse(text) as { error?: string };
        if (json.error) message = json.error;
      } catch { /* keep default message */ }
      throw new RegistryError(message, response.status);
    }

    return response.json() as Promise<RegistryPackage>;
  }

  // ── Download + SHA256 validation ─────────────────────────────────────────

  async downloadTarball(
    presignedUrl: string,
    destPath: string,
    expectedChecksum?: string
  ): Promise<void> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(presignedUrl, { signal: controller.signal });
    } catch (err: unknown) {
      clearTimeout(timer);
      throw new RegistryError(`Download failed: ${String(err)}`);
    }
    clearTimeout(timer);

    if (!response.ok) {
      throw new RegistryError(`Download failed with status ${response.status}`);
    }
    if (!response.body) {
      throw new RegistryError('Download response has no body');
    }

    const hash = createHash('sha256');
    const fileStream = createWriteStream(destPath);
    const reader = response.body.getReader();

    await new Promise<void>((resolve, reject) => {
      fileStream.on('error', reject);
      fileStream.on('finish', resolve);

      const pump = async () => {
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) { fileStream.end(); break; }
            hash.update(value);
            if (!fileStream.write(value)) {
              await new Promise<void>(r => fileStream.once('drain', r));
            }
          }
        } catch (err) {
          fileStream.destroy(err instanceof Error ? err : new Error(String(err)));
          reject(err);
        }
      };
      pump().catch(reject);
    });

    if (expectedChecksum) {
      const actual = hash.digest('hex');
      if (actual !== expectedChecksum) {
        throw new ChecksumError(expectedChecksum, actual);
      }
    }
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

export const registryClient = new RegistryClient();
