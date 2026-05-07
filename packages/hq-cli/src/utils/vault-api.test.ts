import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { getEntityUid, resolveCallerPersonUid } from './vault-api.js';

const fetchMock = vi.fn();
const originalFetch = globalThis.fetch;

function mockResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('resolveCallerPersonUid', () => {
  it('returns the canonical person uid (oldest createdAt, uid tie-break)', async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse(200, {
        entities: [
          { uid: 'prs_b', type: 'person', createdAt: '2026-01-02T00:00:00Z' },
          { uid: 'prs_a', type: 'person', createdAt: '2026-01-01T00:00:00Z' },
          { uid: 'prs_c', type: 'person', createdAt: '2026-01-01T00:00:00Z' },
        ],
      }),
    );

    const uid = await resolveCallerPersonUid('tok');
    expect(uid).toBe('prs_a');
  });

  it('throws when the caller has no person entity', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(200, { entities: [] }));
    await expect(resolveCallerPersonUid('tok')).rejects.toThrow(
      /No person entity/,
    );
  });

  it('throws when the API returns an error status', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(401, { error: 'unauth' }));
    await expect(resolveCallerPersonUid('tok')).rejects.toThrow(
      /Failed to fetch person entity/,
    );
  });

  it('filters out non-person entries before sorting', async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse(200, {
        entities: [
          { uid: 'cmp_a', type: 'company', createdAt: '2025-01-01T00:00:00Z' },
          { uid: 'prs_a', type: 'person', createdAt: '2026-01-01T00:00:00Z' },
        ],
      }),
    );
    const uid = await resolveCallerPersonUid('tok');
    expect(uid).toBe('prs_a');
  });
});

describe('getEntityUid', () => {
  it('routes to person resolution when personal=true', async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse(200, {
        entities: [
          { uid: 'prs_a', type: 'person', createdAt: '2026-01-01T00:00:00Z' },
        ],
      }),
    );
    const uid = await getEntityUid('tok', { personal: true });
    expect(uid).toBe('prs_a');
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toMatch(/\/entity\/by-type\/person/);
  });

  it('routes to company-slug resolution when companySlug is set', async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse(200, { entity: { uid: 'cmp_acme' } }),
    );
    const uid = await getEntityUid('tok', { companySlug: 'acme' });
    expect(uid).toBe('cmp_acme');
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toMatch(/\/entity\/by-slug\/company\/acme/);
  });

  it('falls back to membership lookup when neither personal nor slug is set', async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse(200, {
        memberships: [
          {
            companyUid: 'cmp_only',
            role: 'member',
            status: 'active',
            membershipKey: 'k',
          },
        ],
      }),
    );
    const uid = await getEntityUid('tok', {});
    expect(uid).toBe('cmp_only');
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toMatch(/\/membership\/me/);
  });
});
