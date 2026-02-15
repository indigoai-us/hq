/**
 * useFileViewer - Hook for loading and managing file content state.
 *
 * Handles:
 * - Fetching file content from API
 * - Detecting file type from extension
 * - Loading/error states
 * - Retry on failure
 * - Share functionality via RN Share API
 */
import { useState, useEffect, useCallback } from "react";
import { Share, Platform } from "react-native";
import { fetchFileContent } from "../services/files";
import type { FileContentResponse } from "../services/files";

/** Detected file type for rendering decisions */
export type FileType = "markdown" | "json" | "code" | "text";

/** Mapping of file extensions to code language labels */
const CODE_EXTENSIONS: Record<string, string> = {
  ts: "TypeScript",
  tsx: "TypeScript (JSX)",
  js: "JavaScript",
  jsx: "JavaScript (JSX)",
  py: "Python",
  rb: "Ruby",
  go: "Go",
  rs: "Rust",
  java: "Java",
  kt: "Kotlin",
  swift: "Swift",
  sh: "Shell",
  bash: "Shell",
  zsh: "Shell",
  css: "CSS",
  scss: "SCSS",
  html: "HTML",
  xml: "XML",
  sql: "SQL",
  yaml: "YAML",
  yml: "YAML",
  toml: "TOML",
  dockerfile: "Dockerfile",
  graphql: "GraphQL",
  gql: "GraphQL",
  c: "C",
  cpp: "C++",
  h: "C Header",
  hpp: "C++ Header",
};

/** Detect file type from the file path extension */
export function detectFileType(filePath: string): FileType {
  const fileName = filePath.split("/").pop() ?? filePath;
  const ext = fileName.includes(".")
    ? fileName.split(".").pop()?.toLowerCase() ?? ""
    : fileName.toLowerCase();

  if (ext === "md" || ext === "mdx") return "markdown";
  if (ext === "json") return "json";
  if (ext in CODE_EXTENSIONS) return "code";
  return "text";
}

/** Get a human-readable language label for a code file */
export function getLanguageLabel(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  return CODE_EXTENSIONS[ext] ?? "Plain Text";
}

/** Extract the file name from a full path */
export function getFileName(filePath: string): string {
  return filePath.split("/").pop() ?? filePath;
}

interface UseFileViewerResult {
  /** File content response from API */
  file: FileContentResponse | null;
  /** Detected file type */
  fileType: FileType;
  /** Language label for code files */
  languageLabel: string;
  /** File name extracted from path */
  fileName: string;
  /** Loading state */
  loading: boolean;
  /** Error message */
  error: string | null;
  /** Retry fetching the file */
  retry: () => void;
  /** Share the file content */
  shareFile: () => Promise<void>;
  /** Formatted content (pretty-printed JSON, etc.) */
  formattedContent: string;
}

export function useFileViewer(filePath: string): UseFileViewerResult {
  const [file, setFile] = useState<FileContentResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fileType = detectFileType(filePath);
  const languageLabel = getLanguageLabel(filePath);
  const fileName = getFileName(filePath);

  const loadFile = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchFileContent(filePath);
      setFile(response);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load file";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [filePath]);

  useEffect(() => {
    loadFile();
  }, [loadFile]);

  const retry = useCallback(() => {
    loadFile();
  }, [loadFile]);

  const shareFile = useCallback(async () => {
    if (!file) return;
    try {
      await Share.share(
        Platform.OS === "ios"
          ? {
              title: fileName,
              message: file.content,
            }
          : {
              title: fileName,
              message: file.content,
            },
      );
    } catch {
      // User cancelled or share failed - no-op
    }
  }, [file, fileName]);

  // Format content based on file type
  const formattedContent = (() => {
    if (!file) return "";
    if (fileType === "json") {
      try {
        const parsed = JSON.parse(file.content);
        return JSON.stringify(parsed, null, 2);
      } catch {
        return file.content;
      }
    }
    return file.content;
  })();

  return {
    file,
    fileType,
    languageLabel,
    fileName,
    loading,
    error,
    retry,
    shareFile,
    formattedContent,
  };
}
