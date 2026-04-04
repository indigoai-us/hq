/**
 * Registry API client — communicates with the module registry at admin.getindigo.ai
 * Read-only, no authentication required.
 */

const REGISTRY_URL =
  import.meta.env.VITE_REGISTRY_URL || "https://admin.getindigo.ai";

// --- Types ---

export interface Publisher {
  id: string;
  name: string;
  avatarUrl?: string;
  verified: boolean;
}

export type PackageCategory =
  | "worker-packs"
  | "knowledge-bases"
  | "tools"
  | "skills";

export interface Package {
  name: string;
  description: string;
  version: string;
  category: PackageCategory;
  publisher: Publisher;
  readme?: string;
  lastUpdated: string;
  dependencies?: string[];
  repo?: string;
  branch?: string;
  trusted: boolean;
}

export interface SearchFilters {
  category?: PackageCategory;
  publisher?: string;
}

export interface SearchResult {
  packages: Package[];
  total: number;
  cursor?: string;
}

export interface CategoryInfo {
  id: PackageCategory;
  label: string;
  count: number;
}

// --- Internal helpers ---

async function registryRequest(path: string): Promise<Response> {
  const url = new URL(path, REGISTRY_URL);
  const response = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(
      (body as { error?: string }).error ||
        `Registry request failed: ${response.status}`
    );
  }

  return response;
}

// --- Public API ---

export async function searchPackages(
  query?: string,
  filters?: SearchFilters,
  cursor?: string
): Promise<SearchResult> {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (filters?.category) params.set("category", filters.category);
  if (filters?.publisher) params.set("publisher", filters.publisher);
  if (cursor) params.set("cursor", cursor);

  const qs = params.toString();
  const res = await registryRequest(`/api/packages${qs ? `?${qs}` : ""}`);
  return res.json();
}

export async function getPackage(name: string): Promise<Package> {
  const res = await registryRequest(
    `/api/packages/${encodeURIComponent(name)}`
  );
  return res.json();
}

export async function listCategories(): Promise<CategoryInfo[]> {
  const res = await registryRequest("/api/categories");
  return res.json();
}

export async function getPublisher(id: string): Promise<Publisher> {
  const res = await registryRequest(
    `/api/publishers/${encodeURIComponent(id)}`
  );
  return res.json();
}
