import type { NavigatorNodeType } from "@/types/navigator";

interface TreeNodeIconProps {
  type: NavigatorNodeType;
}

const typeEmojis: Record<NavigatorNodeType, string> = {
  company: "🏢",
  project: "📁",
  worker: "🤖",
  knowledge: "📚",
  file: "📄",
};

export function TreeNodeIcon({ type }: TreeNodeIconProps) {
  return <span className="text-sm">{typeEmojis[type]}</span>;
}
