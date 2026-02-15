import type { AgentType } from "@/types/agent";

interface AgentTypeIconProps {
  type: AgentType;
  size?: number;
}

const typeConfig: Record<AgentType, { emoji: string; color: string }> = {
  research: { emoji: "🔍", color: "bg-accent-purple/20" },
  content: { emoji: "✏️", color: "bg-accent-blue/20" },
  ops: { emoji: "⚙️", color: "bg-accent-yellow/20" },
  code: { emoji: "💻", color: "bg-accent-green/20" },
  social: { emoji: "📱", color: "bg-accent-red/20" },
};

export function AgentTypeIcon({ type, size = 32 }: AgentTypeIconProps) {
  const config = typeConfig[type] ?? typeConfig.code;

  return (
    <div
      className={`flex items-center justify-center rounded-md ${config.color}`}
      style={{ width: size, height: size }}
    >
      <span style={{ fontSize: size * 0.5 }}>{config.emoji}</span>
    </div>
  );
}
