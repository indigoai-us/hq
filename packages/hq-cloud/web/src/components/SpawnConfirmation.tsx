import type { WorkerDefinition, WorkerSkill } from "@/types/worker";
import { Card } from "./Card";

interface SpawnConfirmationProps {
  worker: WorkerDefinition;
  skill: WorkerSkill;
  parameters: Record<string, string>;
}

export function SpawnConfirmation({ worker, skill, parameters }: SpawnConfirmationProps) {
  const paramEntries = Object.entries(parameters).filter(([, v]) => v);

  return (
    <Card className="p-4">
      <p className="text-xs text-text-tertiary uppercase tracking-wider font-semibold mb-3">
        Confirm Spawn
      </p>

      <div className="space-y-2">
        <div>
          <span className="text-xs text-text-tertiary">Worker</span>
          <p className="text-sm text-text-primary font-medium">{worker.name}</p>
        </div>

        <div>
          <span className="text-xs text-text-tertiary">Skill</span>
          <p className="text-sm text-text-primary font-medium">{skill.name}</p>
        </div>

        {paramEntries.length > 0 && (
          <div>
            <span className="text-xs text-text-tertiary">Parameters</span>
            {paramEntries.map(([key, val]) => (
              <div key={key} className="flex justify-between mt-1">
                <span className="text-xs text-text-secondary">{key}</span>
                <span className="text-xs text-text-primary font-mono">{val}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
