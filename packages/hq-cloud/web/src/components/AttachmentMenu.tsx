"use client";

import { useEffect, useRef } from "react";

interface AttachmentMenuProps {
  open: boolean;
  onClose: () => void;
  onSelect: (type: string) => void;
}

const options = [
  { id: "photos", label: "Photos", emoji: "🖼️" },
  { id: "camera", label: "Camera", emoji: "📷" },
  { id: "files", label: "Files", emoji: "📎" },
  { id: "agent", label: "+ Agent", emoji: "🤖" },
  { id: "project", label: "+ Project", emoji: "📁" },
];

export function AttachmentMenu({ open, onClose, onSelect }: AttachmentMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={ref}
      className="absolute bottom-full left-0 mb-2 bg-bg-card border border-border-subtle rounded-lg shadow-floating p-1 min-w-[160px]"
    >
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          onClick={() => {
            onSelect(opt.id);
            onClose();
          }}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-text-primary hover:bg-overlay-light rounded transition-colors"
        >
          <span>{opt.emoji}</span>
          <span>{opt.label}</span>
        </button>
      ))}
    </div>
  );
}
