/**
 * Registry client — reads registry URL from packages/sources.yaml and provides
 * API methods for the HQ package registry (US-004 base, US-005 full client).
 *
 * Auth tokens are NEVER written to stdout or logs.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { findHqRoot } from './hq-root.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SourceEntry {
  name: string;
  url: string;
  type: string;
  auth: string;
}

interface SourcesFile {
  sources: SourceEntry[];
}

export interface PackageMeta {
  slug: string;
  name: string;
  description: string;
  tier: string;
  latest_version: string;
  author?: string;
}

export interface PackageListResponse {
  packages: PackageMeta[];
}

export interface PackageResponse {
  package: PackageMeta;
  versions: { version: string; published_at: string }[];
}

export interface EntitlementEntry {
  slug: string;
  tier: string;
  granted_at: string;
  expires_at?: string;
}

export interface EntitlementListResponse {
  entitlements: EntitlementEntry[];
}

export interface EntitlementCheckResponse {
  entitled: boolean;
  tier?: string;
  expires_at?: string;
}

export interface DownloadResponse {
  url: string;
  sha256: string;
  signature?: string;
}

// ---------------------------------------------------------------------------
// URL helper (unchanged from US-004)
// ---------------------------------------------------------------------------

/**
 * Read the registry URL from packages/sources.yaml in the user's HQ root.
 * Returns the URL of the first source entry.
 * Throws if sources.yaml is missing or has no sources.
 */
export function getRegistryUrl(): string {
  const hqRoot = findHqRoot();
  const sourcesPath = path.join(hqRoot, 'packages', 'sources.yaml');

  if (!fs.existsSync(sourcesPath)) {
    throw new Error(
      `No packages/sources.yaml found at ${sourcesPath}. Is your HQ packages directory set up?`
    );
  }

  const content = fs.readFileSync(sourcesPath, 'utf-8');
  const parsed = yaml.load(content) as SourcesFile;

  if (!parsed?.sources?.length) {
    throw new Error('No sources defined in packages/sources.yaml');
  }

  return parsed.sources[0].url;
}

// ---------------------------------------------------------------------------
// RegistryClient
// ---------------------------------------------------------------------------

export class RegistryClient {
  private baseUrl: string;
  private authToken?: string;

  constructor(baseUrl: string, authToken?: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.authToken = authToken;
  }

  // ---- helpers ----

  private headers(auth: boolean): Record<string, string> {
    const h: Record<string, string> = {
      Accept: 'application/json',
    };
    if (auth && this.authToken) {
      h['Authorization'] = `Bearer ${this.authToken}`;
    }
    return h;
  }

  private async request<T>(
    method: string,
    urlPath: string,
    opts: { auth?: boolean; body?: unknown; timeout?: number } = {}
  ): Promise<T> {
    const auth = opts.auth ?? false;
    const url = `${this.baseUrl}${urlPath}`;

    const init: RequestInit = {
      method,
      headers: this.headers(auth),
      signal: AbortSignal.timeout(opts.timeout ?? 30_000),
    };

    if (opts.body) {
      (init.headers as Record<string, string>)['Content-Type'] =
        'application/json';
      init.body = JSON.stringify(opts.body);
    }

    const res = await fetch(url, init);

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(
        `Registry API ${method} ${urlPath} failed (${res.status}): ${text}`
      );
    }

    return (await res.json()) as T;
  }

  // ---- public (no auth) ----

  async listPackages(opts?: {
    tier?: string;
    q?: string;
  }): Promise<PackageListResponse> {
    const params = new URLSearchParams();
    if (opts?.tier) params.set('tier', opts.tier);
    if (opts?.q) params.set('q', opts.q);
    const qs = params.toString();
    return this.request<PackageListResponse>(
      'GET',
      `/packages${qs ? `?${qs}` : ''}`
    );
  }

  async getPackage(slug: string): Promise<PackageResponse> {
    return this.request<PackageResponse>('GET', `/packages/${encodeURIComponent(slug)}`);
  }

  // ---- auth required ----

  async getMyEntitlements(): Promise<EntitlementListResponse> {
    return this.request<EntitlementListResponse>('GET', '/entitlements', {
      auth: true,
    });
  }

  async checkEntitlement(slug: string): Promise<EntitlementCheckResponse> {
    return this.request<EntitlementCheckResponse>(
      'GET',
      `/entitlements/${encodeURIComponent(slug)}`,
      { auth: true }
    );
  }

  async getDownloadUrl(
    slug: string,
    version?: string
  ): Promise<DownloadResponse> {
    const params = new URLSearchParams();
    if (version) params.set('version', version);
    const qs = params.toString();
    return this.request<DownloadResponse>(
      'GET',
      `/packages/${encodeURIComponent(slug)}/download${qs ? `?${qs}` : ''}`,
      { auth: true }
    );
  }
}
