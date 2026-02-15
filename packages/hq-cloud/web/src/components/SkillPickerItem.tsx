import type { WorkerSkill } from "@/types/worker";
import { Card } from "./Card";

interface SkillPickerItemProps {
  skill: WorkerSkill;
  onSelect: (skill: WorkerSkill) => void;
}

export function SkillPickerItem({ skill, onSelect }: SkillPickerItemProps) {
  return (
    <Card onClick={() => onSelect(skill)} className="p-4">
      <p className="text-base font-semibold text-text-primary">{skill.name}</p>
      <p className="text-sm text-text-secondary mt-0.5">{skill.description}</p>
      {skill.parameters && skill.parameters.length > 0 && (
        <p className="text-xs text-text-tertiary mt-1">
          {skill.parameters.length} parameter{skill.parameters.length !== 1 ? "s" : ""}
        </p>
      )}
    </Card>
  );
}
