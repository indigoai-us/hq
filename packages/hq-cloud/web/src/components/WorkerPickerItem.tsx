import type { WorkerDefinition } from "@/types/worker";
import { Card } from "./Card";

interface WorkerPickerItemProps {
  worker: WorkerDefinition;
  onSelect: (worker: WorkerDefinition) => void;
}

const categoryColors: Record<string, string> = {
  code: "bg-accent-green/20 text-accent-green",
  content: "bg-accent-blue/20 text-accent-blue",
  social: "bg-accent-red/20 text-accent-red",
  research: "bg-accent-purple/20 text-accent-purple",
  ops: "bg-accent-yellow/20 text-accent-yellow",
};

export function WorkerPickerItem({ worker, onSelect }: WorkerPickerItemProps) {
  return (
    <Card onClick={() => onSelect(worker)} className="p-4">
      <div className="flex items-start gap-3">
        <span
          className={`px-2 py-0.5 rounded text-xs font-medium ${categoryColors[worker.category] ?? "bg-bg-elevated text-text-secondary"}`}
        >
          {worker.category}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-base font-semibold text-text-primary">{worker.name}</p>
          <p className="text-sm text-text-secondary mt-0.5">{worker.description}</p>
          <p className="text-xs text-text-tertiary mt-1">
            {worker.skills.length} skill{worker.skills.length !== 1 ? "s" : ""}
          </p>
        </div>
      </div>
    </Card>
  );
}
