/**
 * API client — communicates with HQ Cloud API
 */

const API_URL = import.meta.env.VITE_API_URL || "";

interface FileEntry {
  path: string;
  size: number;
  lastModified: string;
}

interface ListResponse {
  files: FileEntry[];
  cursor?: string;
  truncated: boolean;
}

async function request(path: string, token: string, options?: RequestInit) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${response.status}`);
  }

  return response;
}

export async function listFiles(
  token: string,
  cursor?: string
): Promise<ListResponse> {
  const params = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  const res = await request(`/api/files${params}`, token);
  return res.json();
}

export async function getFile(token: string, filePath: string): Promise<string> {
  const res = await request(`/api/files/${filePath}`, token);
  return res.text();
}

export async function putFile(
  token: string,
  filePath: string,
  content: string
): Promise<void> {
  await request(`/api/files/${filePath}`, token, {
    method: "PUT",
    body: content,
  });
}

export async function deleteFile(
  token: string,
  filePath: string
): Promise<void> {
  await request(`/api/files/${filePath}`, token, {
    method: "DELETE",
  });
}

// --- Team API ---

interface TeamListItem {
  id: string;
  name: string;
  plan?: string;
}

interface TeamMember {
  userId: string;
  username: string;
  role: string;
  joinedAt?: string;
}

export async function listTeams(token: string): Promise<TeamListItem[]> {
  const res = await request("/api/teams", token);
  const data = await res.json();
  return data.teams ?? [];
}

export async function getTeamMembers(
  token: string,
  teamId: string
): Promise<TeamMember[]> {
  const res = await request(`/api/teams/${teamId}/members`, token);
  const data = await res.json();
  return data.members ?? [];
}

export async function createInvite(
  token: string,
  teamId: string
): Promise<{ token: string }> {
  const res = await request(`/api/teams/${teamId}/invites`, token, {
    method: "POST",
  });
  return res.json();
}

export async function removeMember(
  token: string,
  teamId: string,
  userId: string
): Promise<void> {
  await request(`/api/teams/${teamId}/members/${userId}`, token, {
    method: "DELETE",
  });
}

// --- Entitlements API ---

export interface Pack {
  paths: string[];
  description: string;
}

export interface EntitlementsManifest {
  packs: Record<string, Pack>;
  assignments: Record<string, string[]>; // userId or "role:member" → pack names
}

export async function getEntitlements(
  token: string,
  teamId: string
): Promise<EntitlementsManifest> {
  const res = await request(`/api/teams/${teamId}/entitlements`, token);
  return res.json();
}

export async function setEntitlements(
  token: string,
  teamId: string,
  manifest: EntitlementsManifest
): Promise<void> {
  await request(`/api/teams/${teamId}/entitlements`, token, {
    method: "POST",
    body: JSON.stringify(manifest),
  });
}
