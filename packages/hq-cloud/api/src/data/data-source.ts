/**
 * DataSource Interface
 *
 * Abstracts filesystem vs S3 access for reading HQ content.
 * hq-reader.ts uses this interface so the same parsing logic
 * works against local files (tests) or S3 (production).
 */

export interface DirEntry {
  name: string;
  isDirectory: boolean;
}

export interface DataSource {
  readFile(relativePath: string): Promise<string>;
  listDir(relativePath: string): Promise<DirEntry[]>;
  exists(relativePath: string): Promise<boolean>;
  isDirectory(relativePath: string): Promise<boolean>;
  fileSize(relativePath: string): Promise<number>;
}
