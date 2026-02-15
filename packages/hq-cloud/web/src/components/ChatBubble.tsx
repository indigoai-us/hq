import type { AgentMessage } from "@/types/agent";

interface ChatBubbleProps {
  message: AgentMessage;
}

function formatTime(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

const roleBg: Record<string, string> = {
  user: "bg-accent-blue/20",
  agent: "bg-bg-card",
  system: "bg-bg-secondary",
  tool: "bg-bg-secondary",
};

const roleAlign: Record<string, string> = {
  user: "ml-auto",
  agent: "mr-auto",
  system: "mx-auto",
  tool: "mr-auto",
};

export function ChatBubble({ message }: ChatBubbleProps) {
  const isUser = message.role === "user";
  const isTool = message.role === "tool";

  return (
    <div className={`max-w-[80%] ${roleAlign[message.role] ?? "mr-auto"}`}>
      <div
        className={`px-3 py-2 rounded-lg ${roleBg[message.role] ?? "bg-bg-card"} border border-border-subtle`}
      >
        {isTool && message.toolName && (
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-xs font-mono text-accent-purple">{message.toolName}</span>
            {message.toolStatus && (
              <span
                className={`text-xs ${
                  message.toolStatus === "completed"
                    ? "text-accent-green"
                    : message.toolStatus === "failed"
                      ? "text-accent-red"
                      : "text-accent-yellow"
                }`}
              >
                {message.toolStatus}
              </span>
            )}
          </div>
        )}

        <p className={`text-sm whitespace-pre-wrap ${isUser ? "text-text-primary" : "text-text-primary"}`}>
          {message.content}
        </p>
      </div>

      <span className={`block text-[11px] text-text-tertiary mt-0.5 ${isUser ? "text-right" : ""}`}>
        {formatTime(message.timestamp)}
      </span>
    </div>
  );
}
