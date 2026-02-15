"use client";

import { useState, useCallback, useRef } from "react";
import { OptionButton } from "./OptionButton";

interface ChatInputProps {
  onSend: (content: string) => void;
  sending?: boolean;
  options?: string[];
  onOptionSelect?: (option: string) => void;
  placeholder?: string;
}

export function ChatInput({
  onSend,
  sending = false,
  options,
  onOptionSelect,
  placeholder = "Type a message...",
}: ChatInputProps) {
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    onSend(trimmed);
    setText("");
    inputRef.current?.focus();
  }, [text, sending, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  return (
    <div className="border-t border-border-subtle bg-bg-secondary p-3">
      {/* Quick-reply options */}
      {options && options.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {options.map((opt) => (
            <OptionButton
              key={opt}
              label={opt}
              disabled={sending}
              onClick={() => onOptionSelect?.(opt)}
            />
          ))}
        </div>
      )}

      <div className="flex items-end gap-2">
        <textarea
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={1}
          disabled={sending}
          className="flex-1 bg-bg-tertiary text-text-primary text-sm px-3 py-2 rounded-md border border-border-subtle focus:border-accent-blue focus:outline-none resize-none max-h-32 min-h-[36px]"
          style={{ height: "auto" }}
          onInput={(e) => {
            const target = e.target as HTMLTextAreaElement;
            target.style.height = "auto";
            target.style.height = Math.min(target.scrollHeight, 128) + "px";
          }}
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={sending || !text.trim()}
          className={`
            px-3 py-2 rounded-md text-sm font-semibold transition-all
            ${text.trim() ? "bg-accent-blue text-text-primary" : "bg-btn-muted text-text-tertiary"}
            ${sending ? "opacity-50 cursor-not-allowed" : ""}
          `}
        >
          {sending ? "..." : "Send"}
        </button>
      </div>
    </div>
  );
}
