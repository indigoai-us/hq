/**
 * File service - API calls for fetching file contents.
 * Used by the FileViewer screen to load and display file contents.
 */
import { apiRequest } from "./api";

/** Response shape from the file content API */
export interface FileContentResponse {
  /** The file path */
  path: string;
  /** Raw file content as a string */
  content: string;
  /** File size in bytes */
  size: number;
  /** MIME type or detected file type */
  mimeType?: string;
  /** Last modified ISO8601 timestamp */
  lastModified?: string;
}

/**
 * Fetch file contents from the API.
 * @param filePath - Absolute path to the file in HQ
 */
export async function fetchFileContent(
  filePath: string,
): Promise<FileContentResponse> {
  return apiRequest<FileContentResponse>(
    `/api/files/content?path=${encodeURIComponent(filePath)}`,
  );
}
