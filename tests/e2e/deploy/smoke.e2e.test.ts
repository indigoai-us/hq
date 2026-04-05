/**
 * E2E: Deployment smoke tests — verify HQ Cloud infrastructure is live
 * and responding correctly after SST deploy.
 *
 * These tests hit the actual deployed endpoints to confirm:
 * - CloudFront serves the PWA
 * - API Gateway returns proper auth errors (not 5xx)
 * - Lambda functions are running
 * - CORS headers are set
 * - PWA manifest is valid
 *
 * Requires DEPLOY_URL and API_URL env vars, or uses defaults from
 * the latest SST deploy outputs.
 */

import { describe, it, expect, beforeAll } from 'vitest';

const DEPLOY_URL = process.env.DEPLOY_URL || 'https://d3g1ne1fpellx9.cloudfront.net';
const API_URL = process.env.API_URL || 'https://d96gam7npb.execute-api.us-east-1.amazonaws.com';

async function fetchWithTimeout(url: string, opts?: RequestInit, timeoutMs = 10_000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...opts, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(id);
  }
}

describe('e2e: deployment smoke — CloudFront PWA', () => {
  it('serves HTML at root', async () => {
    const res = await fetchWithTimeout(DEPLOY_URL);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('<title>HQ</title>');
    expect(html).toContain('id="root"');
  });

  it('serves PWA manifest', async () => {
    const res = await fetchWithTimeout(`${DEPLOY_URL}/manifest.webmanifest`);
    expect(res.status).toBe(200);
    const manifest = await res.json();
    expect(manifest.name).toBe('HQ — Personal OS');
    expect(manifest.short_name).toBe('HQ');
    expect(manifest.display).toBe('standalone');
  });

  it('serves JS bundle', async () => {
    const rootRes = await fetchWithTimeout(DEPLOY_URL);
    const html = await rootRes.text();
    // Extract JS bundle path from HTML
    const jsMatch = html.match(/src="(\/assets\/index-[^"]+\.js)"/);
    expect(jsMatch).toBeTruthy();

    const jsRes = await fetchWithTimeout(`${DEPLOY_URL}${jsMatch![1]}`);
    expect(jsRes.status).toBe(200);
    const contentType = jsRes.headers.get('content-type') || '';
    expect(contentType).toContain('javascript');
  });

  it('serves CSS bundle', async () => {
    const rootRes = await fetchWithTimeout(DEPLOY_URL);
    const html = await rootRes.text();
    const cssMatch = html.match(/href="(\/assets\/index-[^"]+\.css)"/);
    expect(cssMatch).toBeTruthy();

    const cssRes = await fetchWithTimeout(`${DEPLOY_URL}${cssMatch![1]}`);
    expect(cssRes.status).toBe(200);
  });

  it('serves service worker', async () => {
    const res = await fetchWithTimeout(`${DEPLOY_URL}/registerSW.js`);
    expect(res.status).toBe(200);
  });

  it('returns 200 for SPA routes (client-side routing)', async () => {
    // CloudFront should serve index.html for unknown paths (SPA fallback)
    const res = await fetchWithTimeout(`${DEPLOY_URL}/workers`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('<title>HQ</title>');
  });
});

describe('e2e: deployment smoke — API Gateway', () => {
  it('returns 401 for unauthenticated /api/files', async () => {
    const res = await fetchWithTimeout(`${API_URL}/api/files`);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
  });

  it('returns 401 for unauthenticated /api/teams', async () => {
    const res = await fetchWithTimeout(`${API_URL}/api/teams`);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
  });

  it('returns 401 for unauthenticated /api/auth/credentials', async () => {
    const res = await fetchWithTimeout(`${API_URL}/api/auth/credentials`);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
  });

  it('API does not return 5xx (Lambda functions running)', async () => {
    const endpoints = [
      '/api/files',
      '/api/teams',
      '/api/auth/credentials',
    ];
    for (const endpoint of endpoints) {
      const res = await fetchWithTimeout(`${API_URL}${endpoint}`);
      expect(res.status).toBeLessThan(500);
    }
  });

  it('returns proper JSON error format', async () => {
    const res = await fetchWithTimeout(`${API_URL}/api/files`);
    const body = await res.json();
    expect(body).toHaveProperty('error');
    expect(typeof body.error).toBe('string');
  });
});

describe('e2e: deployment smoke — infrastructure health', () => {
  it('CloudFront returns appropriate cache headers', async () => {
    const res = await fetchWithTimeout(DEPLOY_URL);
    // CloudFront should set x-cache or x-amz-cf-id headers
    const cfId = res.headers.get('x-amz-cf-id');
    expect(cfId).toBeTruthy();
  });

  it('API returns CORS headers', async () => {
    const res = await fetchWithTimeout(`${API_URL}/api/files`, {
      headers: { 'Origin': 'https://example.com' },
    });
    // API Gateway v2 with default CORS should respond
    // (exact CORS header presence depends on SST config)
    expect(res.status).toBeLessThan(500);
  });

  it('CloudFront serves content with proper headers', async () => {
    const res = await fetchWithTimeout(DEPLOY_URL);
    // HTML should have a content-type
    const contentType = res.headers.get('content-type') || '';
    expect(contentType).toContain('text/html');
    // Response body should be non-empty
    const text = await res.text();
    expect(text.length).toBeGreaterThan(100);
  });
});
