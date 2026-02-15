import { apiRequest } from "@/lib/api-client";

export interface FileContentResponse {
  path: string;
  content: string;
  size: number;
  mimeType?: string;
  lastModified?: string;
}

export interface FileListResponse {
  files: Array<{ key: string; size: number; lastModified: string; etag: string }>;
  count: number;
  totalSize: number;
  prefix: string;
}

export async function fetchFileContent(filePath: string): Promise<FileContentResponse> {
  return apiRequest<FileContentResponse>(
    `/api/files/content?path=${encodeURIComponent(filePath)}`,
  );
}

export async function fetchFileCount(): Promise<number> {
  const result = await apiRequest<FileListResponse>("/api/files/list?prefix=");
  return result.count;
}
