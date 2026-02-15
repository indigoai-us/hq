"use client";

import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useFileViewer } from "@/hooks/useFileViewer";
import { ActionButton } from "@/components/ActionButton";

const MarkdownView = dynamic(() => import("@/components/MarkdownView").then(m => ({ default: m.MarkdownView })), { ssr: false });
const CodeBlock = dynamic(() => import("@/components/CodeBlock").then(m => ({ default: m.CodeBlock })), { ssr: false });

function fileTypeBadgeColor(fileType: string): string {
  switch (fileType) {
    case "markdown": return "bg-accent-blue/30";
    case "json": return "bg-accent-yellow/30";
    case "code": return "bg-accent-purple/30";
    default: return "bg-bg-elevated";
  }
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FileViewerContent() {
  const searchParams = useSearchParams();
  const filePath = searchParams.get("path") ?? "";

  const { file, fileType, languageLabel, loading, error, retry, shareFile, formattedContent } =
    useFileViewer(filePath);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="text-text-secondary text-sm">Loading file...</span>
      </div>
    );
  }

  if (error || !file) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 px-6">
        <span className="text-xl">📄</span>
        <span className="text-text-primary font-semibold">Error loading file</span>
        <span className="text-text-secondary text-sm text-center">{error ?? "File not found"}</span>
        <span className="text-[11px] font-mono text-text-tertiary text-center break-all">{filePath}</span>
        <ActionButton label="Retry" variant="primary" onClick={retry} />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Meta bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border-subtle">
        <div className="flex items-center gap-2">
          <span className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-wider text-text-primary ${fileTypeBadgeColor(fileType)}`}>
            {fileType.toUpperCase()}
          </span>
          {fileType === "code" && (
            <span className="text-xs text-text-secondary">{languageLabel}</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-text-tertiary">{formatFileSize(file.size)}</span>
          <button
            type="button"
            onClick={() => void shareFile()}
            className="text-accent-blue text-sm font-semibold hover:underline"
          >
            Share
          </button>
        </div>
      </div>

      {/* File path */}
      <div className="px-4 py-1 bg-bg-secondary">
        <span className="text-[11px] text-text-tertiary font-mono break-all">{filePath}</span>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto px-4 py-4">
        {fileType === "markdown" && (
          <article className="prose prose-invert prose-sm max-w-none [&_h1]:text-text-primary [&_h2]:text-text-primary [&_h3]:text-text-primary [&_p]:text-text-secondary [&_li]:text-text-secondary [&_a]:text-accent-blue [&_code]:text-accent-purple [&_code]:bg-bg-elevated [&_code]:px-1 [&_code]:rounded [&_pre]:bg-bg-secondary [&_pre]:border [&_pre]:border-border-subtle [&_blockquote]:border-border-active [&_blockquote]:text-text-tertiary [&_hr]:border-border-subtle [&_strong]:text-text-primary [&_table]:text-text-secondary [&_th]:text-text-primary">
            <MarkdownView content={formattedContent} />
          </article>
        )}

        {fileType === "json" && (
          <CodeBlock language="json">
            {formattedContent}
          </CodeBlock>
        )}

        {fileType === "code" && (
          <CodeBlock
            language={languageLabel.toLowerCase().replace(/\s*\(jsx\)/i, "x").replace("typescript", "tsx").replace("javascript", "jsx")}
            showLineNumbers
          >
            {formattedContent}
          </CodeBlock>
        )}

        {fileType === "text" && (
          <pre className="text-[13px] font-mono text-text-primary whitespace-pre-wrap leading-[18px]">
            {formattedContent}
          </pre>
        )}
      </div>
    </div>
  );
}

export default function FileViewerPage() {
  return <FileViewerContent />;
}
