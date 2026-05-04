import { DEFAULT_VAULT_API_URL } from './cognito-session.js';

export interface VaultApiOptions {
  token: string;
  path: string;
  method?: string;
  body?: Record<string, unknown>;
  query?: Record<string, string>;
}

export async function vaultApiFetch(opts: VaultApiOptions): Promise<Response> {
  const url = new URL(opts.path, DEFAULT_VAULT_API_URL);
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      url.searchParams.set(k, v);
    }
  }
  return fetch(url.toString(), {
    method: opts.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${opts.token}`,
      'Content-Type': 'application/json',
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
}

interface MembershipEntry {
  companyUid: string;
  role: string;
  status: string;
  membershipKey: string;
}

async function resolveCompanyUid(token: string, slug: string): Promise<string> {
  const res = await vaultApiFetch({
    token,
    path: `/entity/by-slug/company/${encodeURIComponent(slug)}`,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      `Failed to resolve company slug '${slug}': ${(body as Record<string, string>).error ?? res.statusText}`,
    );
  }
  const data = (await res.json()) as { entity: { uid: string } };
  return data.entity.uid;
}

async function resolveCompanyFromMemberships(token: string): Promise<string> {
  const res = await vaultApiFetch({
    token,
    path: '/membership/me',
  });
  if (!res.ok) {
    throw new Error("Failed to fetch memberships — run `hq login` and try again");
  }
  const data = (await res.json()) as { memberships: MembershipEntry[] };
  const active = data.memberships.filter((m) => m.status === 'active');
  if (active.length === 0) {
    throw new Error('No active company memberships found. Use --company <slug> to specify.');
  }
  if (active.length === 1) {
    return active[0].companyUid;
  }
  const uids = active.map((m) => m.companyUid).join(', ');
  throw new Error(
    `Multiple companies found (${uids}). Use --company <slug> to specify which one.`,
  );
}

export async function getCompanyUid(
  token: string,
  companySlug: string | undefined,
): Promise<string> {
  if (companySlug) {
    return resolveCompanyUid(token, companySlug);
  }
  return resolveCompanyFromMemberships(token);
}
