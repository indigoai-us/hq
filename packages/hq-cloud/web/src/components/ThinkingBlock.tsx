"use client";

import { useState } from "react";

interface ThinkingBlockProps {
  content: string;
}

export function ThinkingBlock({ content }: ThinkingBlockProps) {
  const [expanded, setExpanded] = useState(false);
  const preview = content.length > 80 ? content.slice(0, 80) + "..." : content;

  return (
    <div className="rounded-md border border-border-subtle bg-bg-secondary/50 overflow-hidden opacity-60 hover:opacity-80 transition-opacity">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-bg-tertiary/50 transition-colors"
      >
        {/* Expand/collapse chevron */}
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="currentColor"
          className={`text-text-tertiary shrink-0 transition-transform ${expanded ? "rotate-90" : ""}`}
        >
          <path d="M4 2l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>

        {/* Brain icon */}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-text-tertiary shrink-0">
          <path d="M12 2a7 7 0 0 0-7 7c0 3 2 5.5 4 7.5S12 22 12 22s3-3.5 5-5.5 4-4.5 4-7.5a7 7 0 0 0-7-7z" />
        </svg>

        <span className="text-[11px] text-text-tertiary italic">
          {expanded ? "Thinking..." : preview}
        </span>
      </button>

      {expanded && (
        <div className="border-t border-border-subtle px-3 py-2">
          <p className="text-xs text-text-tertiary whitespace-pre-wrap italic leading-relaxed max-h-64 overflow-auto">
            {content}
          </p>
        </div>
      )}
    </div>
  );
}
