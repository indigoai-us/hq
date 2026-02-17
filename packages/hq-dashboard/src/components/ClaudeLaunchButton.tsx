"use client";

import { useCallback, useRef, useState } from "react";

interface ClaudeLaunchButtonProps {
  slug: string;
  name: string;
}

export function ClaudeLaunchButton({ slug, name }: ClaudeLaunchButtonProps) {
  const [toast, setToast] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const command = `cd C:\\hq && claude --dangerously-skip-permissions -p "I am working on ${name}. Run /run-project ${slug} to check the status and determine our next steps."`;

  const copyToClipboard = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(command);
      setToast(true);
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setToast(false), 3000);
    } catch {
      // clipboard not available
    }
  }, [command]);

  const handleLaunch = useCallback(() => {
    // Try protocol handler, fall back to clipboard
    const protocolUrl = `hq://launch?project=${encodeURIComponent(slug)}&name=${encodeURIComponent(name)}`;
    const iframe = document.createElement("iframe");
    iframe.style.display = "none";
    iframe.src = protocolUrl;
    document.body.appendChild(iframe);
    setTimeout(() => {
      document.body.removeChild(iframe);
    }, 2000);
  }, [slug, name]);

  return (
    <div className="relative flex items-center gap-1">
      {/* Launch button */}
      <button
        onClick={handleLaunch}
        title="Open in Claude (requires hq:// protocol handler)"
        className="p-1.5 rounded-md text-text-tertiary hover:text-accent-blue hover:bg-overlay-light transition-colors"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="2" y="3" width="12" height="10" rx="1.5" />
          <path d="M5 8l2 2 2-2" />
          <path d="M2 5.5h12" />
        </svg>
      </button>

      {/* Copy command button */}
      <button
        onClick={copyToClipboard}
        title="Copy Claude command to clipboard"
        className="p-1.5 rounded-md text-text-tertiary hover:text-accent-green hover:bg-overlay-light transition-colors"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="5" y="5" width="8" height="8" rx="1" />
          <path d="M3 11V4a1 1 0 011-1h7" />
        </svg>
      </button>

      {/* Toast */}
      {toast && (
        <div className="absolute right-0 top-full mt-1 px-2 py-1 bg-accent-green text-text-inverse text-[10px] font-medium rounded whitespace-nowrap z-20 animate-fade-in">
          Command copied
        </div>
      )}
    </div>
  );
}
