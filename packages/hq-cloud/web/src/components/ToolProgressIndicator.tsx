import type { ToolProgress } from "@/types/session";

interface ToolProgressIndicatorProps {
  progress: ToolProgress;
}

export function ToolProgressIndicator({ progress }: ToolProgressIndicatorProps) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-bg-secondary border border-border-subtle mr-auto max-w-[85%]">
      {/* Spinning indicator */}
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className="text-accent-purple animate-spin shrink-0"
      >
        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
      </svg>
      <span className="text-xs text-text-secondary truncate">
        {progress.message}
      </span>
    </div>
  );
}
