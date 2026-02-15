"use client";

import { useState, useCallback, useRef } from "react";
import { AttachmentMenu } from "./AttachmentMenu";

interface GlobalInputBarProps {
  onSend: (content: string) => void;
  sending?: boolean;
  placeholder?: string;
}

export function GlobalInputBar({
  onSend,
  sending = false,
  placeholder = "Ask anything...",
}: GlobalInputBarProps) {
  const [text, setText] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    onSend(trimmed);
    setText("");
  }, [text, sending, onSend]);

  const handleVoice = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!SR) return;

    const recognition = new SR();
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onresult = (event: { results: { 0: { 0: { transcript: string } } } }) => {
      const transcript = event.results[0][0].transcript;
      setText((prev) => (prev ? prev + " " + transcript : transcript));
      setIsListening(false);
    };

    recognition.onerror = () => {
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    setIsListening(true);
    recognition.start();
  }, []);

  const handleAttachment = useCallback((_type: string) => {
    // Attachment handling - placeholder for file picker integration
  }, []);

  return (
    <div className="relative border-t border-border-subtle bg-bg-secondary px-3 py-2">
      <div className="flex items-center gap-2">
        {/* Attachment button */}
        <button
          type="button"
          onClick={() => setMenuOpen(!menuOpen)}
          className="p-1.5 text-icon-default hover:text-icon-active transition-colors"
          aria-label="Attach"
        >
          📎
        </button>

        <AttachmentMenu
          open={menuOpen}
          onClose={() => setMenuOpen(false)}
          onSelect={handleAttachment}
        />

        {/* Text input */}
        <input
          ref={inputRef}
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSend();
          }}
          placeholder={placeholder}
          disabled={sending}
          className="flex-1 bg-bg-tertiary text-text-primary text-sm px-3 py-2 rounded-md border border-border-subtle focus:border-accent-blue focus:outline-none"
        />

        {/* Microphone */}
        <button
          type="button"
          onClick={handleVoice}
          className={`p-1.5 transition-colors ${isListening ? "text-accent-red" : "text-icon-default hover:text-icon-active"}`}
          aria-label="Voice input"
        >
          🎤
        </button>

        {/* Send */}
        {text.trim() && (
          <button
            type="button"
            onClick={handleSend}
            disabled={sending}
            className="px-3 py-1.5 bg-accent-blue text-text-primary text-sm font-semibold rounded-md"
          >
            Send
          </button>
        )}
      </div>
    </div>
  );
}
