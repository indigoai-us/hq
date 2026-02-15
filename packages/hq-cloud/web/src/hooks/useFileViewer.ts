"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import type { FileContentResponse } from "@/services/files";
import { fetchFileContent } from "@/services/files";

export type FileType = "markdown" | "json" | "code" | "text";

interface UseFileViewerResult {
  file: FileContentResponse | null;
  fileType: FileType;
  languageLabel: string;
  fileName: string;
  loading: boolean;
  error: string | null;
  retry: () => void;
  shareFile: () => Promise<void>;
  formattedContent: string;
}

const EXTENSION_MAP: Record<string, FileType> = {
  md: "markdown",
  mdx: "markdown",
  json: "json",
  ts: "code",
  tsx: "code",
  js: "code",
  jsx: "code",
  py: "code",
  go: "code",
  rs: "code",
  rb: "code",
  sh: "code",
  bash: "code",
  zsh: "code",
  yaml: "code",
  yml: "code",
  toml: "code",
  css: "code",
  html: "code",
  sql: "code",
  graphql: "code",
  gql: "code",
  dockerfile: "code",
};

const LANGUAGE_LABELS: Record<string, string> = {
  ts: "TypeScript",
  tsx: "TypeScript (JSX)",
  js: "JavaScript",
  jsx: "JavaScript (JSX)",
  py: "Python",
  go: "Go",
  rs: "Rust",
  rb: "Ruby",
  sh: "Shell",
  bash: "Bash",
  zsh: "Zsh",
  yaml: "YAML",
  yml: "YAML",
  toml: "TOML",
  css: "CSS",
  html: "HTML",
  sql: "SQL",
  graphql: "GraphQL",
  gql: "GraphQL",
  dockerfile: "Dockerfile",
};

function getExtension(filePath: string): string {
  const name = filePath.split("/").pop() ?? "";
  if (name.toLowerCase() === "dockerfile") return "dockerfile";
  const parts = name.split(".");
  return parts.length > 1 ? parts.pop()!.toLowerCase() : "";
}

function detectFileType(filePath: string): FileType {
  const ext = getExtension(filePath);
  return EXTENSION_MAP[ext] ?? "text";
}

function getLanguageLabel(filePath: string): string {
  const ext = getExtension(filePath);
  return LANGUAGE_LABELS[ext] ?? ext.toUpperCase();
}

function getFileName(filePath: string): string {
  return filePath.split("/").pop() ?? filePath;
}

export function useFileViewer(filePath: string): UseFileViewerResult {
  const [file, setFile] = useState<FileContentResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadFile = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchFileContent(filePath);
      setFile(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load file");
    } finally {
      setLoading(false);
    }
  }, [filePath]);

  useEffect(() => {
    void loadFile();
  }, [loadFile]);

  const retry = useCallback(() => {
    void loadFile();
  }, [loadFile]);

  const fileType = useMemo(() => detectFileType(filePath), [filePath]);
  const languageLabel = useMemo(() => getLanguageLabel(filePath), [filePath]);
  const fileName = useMemo(() => getFileName(filePath), [filePath]);

  const formattedContent = useMemo(() => {
    if (!file) return "";
    if (fileType === "json") {
      try {
        return JSON.stringify(JSON.parse(file.content), null, 2);
      } catch {
        return file.content;
      }
    }
    return file.content;
  }, [file, fileType]);

  const shareFile = useCallback(async () => {
    if (!file) return;

    if (navigator.share) {
      try {
        await navigator.share({
          title: fileName,
          text: file.content,
        });
      } catch {
        // Share cancelled or failed
      }
    } else {
      // Fallback: copy to clipboard
      await navigator.clipboard.writeText(file.content);
    }
  }, [file, fileName]);

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
