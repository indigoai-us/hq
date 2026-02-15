"use client";

import { useRouter } from "next/navigation";
import { useSpawnWorker } from "@/hooks/useSpawnWorker";
import { SectionHeader } from "@/components/SectionHeader";
import { WorkerPickerItem } from "@/components/WorkerPickerItem";
import { SkillPickerItem } from "@/components/SkillPickerItem";
import { ParameterInput } from "@/components/ParameterInput";
import { SpawnConfirmation } from "@/components/SpawnConfirmation";
import { ActionButton } from "@/components/ActionButton";

const stepLabels: Record<string, string> = {
  "pick-worker": "Select Worker",
  "pick-skill": "Select Skill",
  configure: "Configure",
  confirm: "Confirm",
};

export default function SpawnPage() {
  const router = useRouter();
  const {
    workers,
    loading,
    error,
    step,
    selectedWorker,
    selectedSkill,
    parameters,
    spawning,
    selectWorker,
    selectSkill,
    setParameter,
    goBack,
    goToConfirm,
    confirmSpawn,
    canProceed,
  } = useSpawnWorker();

  const handleConfirm = async () => {
    const result = await confirmSpawn();
    if (result) {
      router.push(`/agents/${result.agentId}`);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="text-text-secondary text-sm">Loading workers...</span>
      </div>
    );
  }

  return (
    <div className="px-4 py-4">
      {/* Step header */}
      <div className="flex items-center gap-3 mb-4">
        {step !== "pick-worker" && (
          <button
            type="button"
            onClick={goBack}
            className="text-accent-blue text-sm hover:underline"
          >
            ← Back
          </button>
        )}
        <SectionHeader title={stepLabels[step]} />
      </div>

      {/* Desktop step indicator */}
      <div className="hidden lg:flex items-center gap-2 mb-6">
        {["pick-worker", "pick-skill", "configure", "confirm"].map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold ${
                s === step
                  ? "bg-accent-blue text-text-primary"
                  : "bg-bg-elevated text-text-tertiary"
              }`}
            >
              {i + 1}
            </div>
            <span className={`text-xs ${s === step ? "text-text-primary" : "text-text-tertiary"}`}>
              {stepLabels[s]}
            </span>
            {i < 3 && <div className="w-8 h-px bg-border-subtle" />}
          </div>
        ))}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-accent-red/10 border border-accent-red/30 rounded-md">
          <span className="text-sm text-accent-red">{error}</span>
        </div>
      )}

      {/* Step content */}
      {step === "pick-worker" && (
        <div className="space-y-3">
          {workers.length === 0 ? (
            <div className="text-text-secondary text-sm text-center py-8">
              No active workers available
            </div>
          ) : (
            workers.map((w) => (
              <WorkerPickerItem key={w.id} worker={w} onSelect={selectWorker} />
            ))
          )}
        </div>
      )}

      {step === "pick-skill" && selectedWorker && (
        <div className="space-y-3">
          {selectedWorker.skills.map((s) => (
            <SkillPickerItem key={s.id} skill={s} onSelect={selectSkill} />
          ))}
        </div>
      )}

      {step === "configure" && selectedSkill && (
        <div>
          <div className="bg-bg-card rounded-lg border border-border-subtle p-4 mb-4">
            {selectedSkill.parameters?.map((param) => (
              <ParameterInput
                key={param.name}
                param={param}
                value={parameters[param.name] ?? param.defaultValue ?? ""}
                onChange={setParameter}
              />
            ))}
          </div>
          <ActionButton
            label="Continue"
            variant="primary"
            disabled={!canProceed}
            onClick={goToConfirm}
          />
        </div>
      )}

      {step === "confirm" && selectedWorker && selectedSkill && (
        <div className="space-y-4">
          <SpawnConfirmation
            worker={selectedWorker}
            skill={selectedSkill}
            parameters={parameters}
          />
          <ActionButton
            label={spawning ? "Spawning..." : "Spawn Worker"}
            variant="primary"
            disabled={spawning}
            onClick={() => void handleConfirm()}
            className="w-full"
          />
        </div>
      )}
    </div>
  );
}
