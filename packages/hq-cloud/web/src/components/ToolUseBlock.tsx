"use client";

import { useState } from "react";

interface ToolUseBlockProps {
  toolName: string;
  input: Record<string, unknown>;
  output?: string;
  isError?: boolean;
}

function formatToolInput(input: Record<string, unknown>): string {
  // Show commonly meaningful fields first
  if (input.command) return String(input.command);
  if (input.file_path) return String(input.file_path);
  if (input.pattern) return String(input.pattern);
  if (input.query) return String(input.query);
  if (input.url) return String(input.url);
  if (input.content && typeof input.content === "string") {
    const text = input.content;
    return text.length > 300 ? text.slice(0, 300) + "..." : text;
  }
  const str = JSON.stringify(input, null, 2);
  return str.length > 500 ? str.slice(0, 500) + "..." : str;
}

function truncateOutput(output: string): string {
  if (output.length > 1000) {
    return output.slice(0, 1000) + "\n... (truncated)";
  }
  return output;
}

export function ToolUseBlock({ toolName, input, output, isError }: ToolUseBlockProps) {
  const [expanded, setExpanded] = useState(false);
  const inputDisplay = formatToolInput(input);
  const hasContent = inputDisplay || output;

  return (
    <div className="rounded-md border border-border-subtle bg-bg-secondary overflow-hidden">
      {/* Header - always visible */}
      <button
        type="button"
        onClick={() => hasContent && setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-bg-tertiary transition-colors"
      >
        {/* Expand/collapse chevron */}
        {hasContent && (
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="currentColor"
            className={`text-text-tertiary shrink-0 transition-transform ${expanded ? "rotate-90" : ""}`}
          >
            <path d="M4 2l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}

        {/* Tool icon */}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent-purple shrink-0">
          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
        </svg>

        <span className="text-xs font-mono text-accent-purple font-medium">{toolName}</span>

        {isError && (
          <span className="text-xs text-accent-red font-medium ml-auto">error</span>
        )}
      </button>

      {/* Collapsible content */}
      {expanded && hasContent && (
        <div className="border-t border-border-subtle">
          {/* Input */}
          {inputDisplay && (
            <div className="px-3 py-2">
              <span className="text-[10px] text-text-tertiary uppercase tracking-wide block mb-1">Input</span>
              <pre className="text-xs text-text-secondary font-mono whitespace-pre-wrap break-all max-h-48 overflow-auto">
                {inputDisplay}
              </pre>
            </div>
          )}

          {/* Output */}
          {output && (
            <div className="px-3 py-2 border-t border-border-subtle">
              <span className="text-[10px] text-text-tertiary uppercase tracking-wide block mb-1">Output</span>
              <pre className={`text-xs font-mono whitespace-pre-wrap break-all max-h-48 overflow-auto ${isError ? "text-accent-red" : "text-text-secondary"}`}>
                {truncateOutput(output)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
