"use client";

import type { SessionMessage, ContentBlock } from "@/types/session";
import { ToolUseBlock } from "./ToolUseBlock";
import { ThinkingBlock } from "./ThinkingBlock";
import { MarkdownView } from "./MarkdownView";

interface SessionMessageBubbleProps {
  message: SessionMessage;
  /** Map of tool_use_id to tool_result content for pairing */
  toolResults?: Map<string, { content: string; isError: boolean }>;
}

function formatTime(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function renderContentBlocks(
  blocks: ContentBlock[],
  toolResults?: Map<string, { content: string; isError: boolean }>,
) {
  return blocks.map((block, i) => {
    switch (block.type) {
      case "text":
        if (!block.text.trim()) return null;
        return (
          <div key={`text-${i}`} className="text-sm text-text-primary prose prose-invert prose-sm max-w-none">
            <MarkdownView content={block.text} />
          </div>
        );
      case "tool_use": {
        const result = toolResults?.get(block.id);
        return (
          <ToolUseBlock
            key={`tool-${block.id}`}
            toolName={block.name}
            input={block.input}
            output={result?.content}
            isError={result?.isError}
          />
        );
      }
      case "tool_result":
        // Tool results are rendered as part of their associated tool_use block
        // This standalone rendering is for tool_results without a paired tool_use
        return (
          <div key={`result-${i}`} className="rounded-md border border-border-subtle bg-bg-secondary px-3 py-2">
            <span className="text-[10px] text-text-tertiary uppercase tracking-wide block mb-1">Tool Result</span>
            <pre className={`text-xs font-mono whitespace-pre-wrap break-all max-h-48 overflow-auto ${block.is_error ? "text-accent-red" : "text-text-secondary"}`}>
              {block.content.length > 500 ? block.content.slice(0, 500) + "..." : block.content}
            </pre>
          </div>
        );
      case "thinking":
        return (
          <ThinkingBlock key={`think-${i}`} content={block.thinking} />
        );
      default:
        return null;
    }
  });
}

export function SessionMessageBubble({ message, toolResults }: SessionMessageBubbleProps) {
  const isUser = message.type === "user";
  const isAssistant = message.type === "assistant";
  const isSystem = message.type === "system" || message.type === "error";
  const isPermission = message.type === "permission_request" || message.type === "permission_response";
  const isToolUse = message.type === "tool_use";
  const isToolResult = message.type === "tool_result";

  const alignClass = isUser ? "ml-auto" : "mr-auto";
  const maxWidth = isUser ? "max-w-[80%]" : "max-w-[90%]";

  // User messages
  if (isUser) {
    return (
      <div className={`${maxWidth} ${alignClass}`} data-testid="session-message-user">
        <div className="px-3 py-2 rounded-lg bg-accent-blue/20 border border-border-subtle">
          <p className="text-sm whitespace-pre-wrap text-text-primary">{message.content}</p>
        </div>
        <span className="block text-[11px] text-text-tertiary mt-0.5 text-right">
          {formatTime(message.timestamp)}
        </span>
      </div>
    );
  }

  // Assistant messages with content blocks
  if (isAssistant && message.contentBlocks && message.contentBlocks.length > 0) {
    return (
      <div className={`${maxWidth} ${alignClass} space-y-2`} data-testid="session-message-assistant">
        {renderContentBlocks(message.contentBlocks, toolResults)}
        <span className="block text-[11px] text-text-tertiary mt-0.5">
          {formatTime(message.timestamp)}
        </span>
      </div>
    );
  }

  // Assistant text message (no content blocks)
  if (isAssistant) {
    return (
      <div className={`${maxWidth} ${alignClass}`} data-testid="session-message-assistant">
        <div className="px-3 py-2 rounded-lg bg-bg-card border border-border-subtle">
          <div className="text-sm text-text-primary prose prose-invert prose-sm max-w-none">
            <MarkdownView content={message.content} />
          </div>
        </div>
        <span className="block text-[11px] text-text-tertiary mt-0.5">
          {formatTime(message.timestamp)}
        </span>
      </div>
    );
  }

  // Tool use message (standalone, not in content block)
  if (isToolUse) {
    const toolName = (message.metadata?.toolName as string) ?? "tool";
    const toolInput = (message.metadata?.input as Record<string, unknown>) ?? {};
    const toolOutput = message.content;
    return (
      <div className={`${maxWidth} ${alignClass}`} data-testid="session-message-tool">
        <ToolUseBlock
          toolName={toolName}
          input={toolInput}
          output={toolOutput || undefined}
        />
        <span className="block text-[11px] text-text-tertiary mt-0.5">
          {formatTime(message.timestamp)}
        </span>
      </div>
    );
  }

  // Tool result message (standalone)
  if (isToolResult) {
    const isError = message.metadata?.is_error === true;
    return (
      <div className={`${maxWidth} ${alignClass}`} data-testid="session-message-tool-result">
        <div className="rounded-md border border-border-subtle bg-bg-secondary px-3 py-2">
          <pre className={`text-xs font-mono whitespace-pre-wrap break-all max-h-48 overflow-auto ${isError ? "text-accent-red" : "text-text-secondary"}`}>
            {message.content.length > 500 ? message.content.slice(0, 500) + "..." : message.content}
          </pre>
        </div>
        <span className="block text-[11px] text-text-tertiary mt-0.5">
          {formatTime(message.timestamp)}
        </span>
      </div>
    );
  }

  // Permission messages
  if (isPermission) {
    return (
      <div className={`${maxWidth} ${alignClass}`} data-testid="session-message-permission">
        <div className="px-3 py-2 rounded-lg bg-bg-secondary border border-accent-yellow/30">
          <span className="text-xs text-accent-yellow font-medium">
            {message.type === "permission_request" ? "Permission Requested" : "Permission Responded"}
          </span>
          <p className="text-sm whitespace-pre-wrap text-text-primary mt-1">{message.content}</p>
        </div>
        <span className="block text-[11px] text-text-tertiary mt-0.5">
          {formatTime(message.timestamp)}
        </span>
      </div>
    );
  }

  // System / error / fallback
  return (
    <div className={`${maxWidth} mx-auto`} data-testid={`session-message-${message.type}`}>
      <div className={`px-3 py-2 rounded-lg border border-border-subtle ${isSystem ? "bg-bg-secondary" : "bg-bg-card"}`}>
        {message.type === "error" && (
          <span className="text-xs text-accent-red font-medium block mb-1">Error</span>
        )}
        <p className="text-sm whitespace-pre-wrap text-text-secondary">{message.content}</p>
      </div>
      <span className="block text-[11px] text-text-tertiary mt-0.5 text-center">
        {formatTime(message.timestamp)}
      </span>
    </div>
  );
}
