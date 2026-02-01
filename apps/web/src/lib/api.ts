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
