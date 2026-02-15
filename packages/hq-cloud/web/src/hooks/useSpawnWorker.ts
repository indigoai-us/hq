"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import type { WorkerDefinition, WorkerSkill, SpawnWorkerResponse } from "@/types/worker";
import { fetchWorkers, spawnWorker } from "@/services/workers";

export type SpawnStep = "pick-worker" | "pick-skill" | "configure" | "confirm";

interface UseSpawnWorkerReturn {
  workers: WorkerDefinition[];
  loading: boolean;
  error: string | null;
  step: SpawnStep;
  selectedWorker: WorkerDefinition | null;
  selectedSkill: WorkerSkill | null;
  parameters: Record<string, string>;
  spawning: boolean;
  selectWorker: (worker: WorkerDefinition) => void;
  selectSkill: (skill: WorkerSkill) => void;
  setParameter: (name: string, value: string) => void;
  goBack: () => void;
  goToConfirm: () => void;
  confirmSpawn: () => Promise<SpawnWorkerResponse | null>;
  reset: () => void;
  canProceed: boolean;
}

export function useSpawnWorker(): UseSpawnWorkerReturn {
  const [workers, setWorkers] = useState<WorkerDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<SpawnStep>("pick-worker");
  const [selectedWorker, setSelectedWorker] = useState<WorkerDefinition | null>(null);
  const [selectedSkill, setSelectedSkill] = useState<WorkerSkill | null>(null);
  const [parameters, setParameters] = useState<Record<string, string>>({});
  const [spawning, setSpawning] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchWorkers();
        if (mounted) setWorkers(data);
      } catch (err: unknown) {
        if (mounted) {
          setError(err instanceof Error ? err.message : "Failed to load workers");
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void load();
    return () => { mounted = false; };
  }, []);

  const selectWorker = useCallback((worker: WorkerDefinition) => {
    setSelectedWorker(worker);
    setSelectedSkill(null);
    setParameters({});

    // Auto-select if only one skill
    if (worker.skills.length === 1) {
      setSelectedSkill(worker.skills[0]);
      const defaults: Record<string, string> = {};
      for (const param of worker.skills[0].parameters ?? []) {
        if (param.defaultValue) defaults[param.name] = param.defaultValue;
      }
      setParameters(defaults);
      setStep(worker.skills[0].parameters?.length ? "configure" : "confirm");
    } else {
      setStep("pick-skill");
    }
  }, []);

  const selectSkill = useCallback((skill: WorkerSkill) => {
    setSelectedSkill(skill);
    const defaults: Record<string, string> = {};
    for (const param of skill.parameters ?? []) {
      if (param.defaultValue) defaults[param.name] = param.defaultValue;
    }
    setParameters(defaults);
    setStep(skill.parameters?.length ? "configure" : "confirm");
  }, []);

  const setParameter = useCallback((name: string, value: string) => {
    setParameters((prev) => ({ ...prev, [name]: value }));
  }, []);

  const goBack = useCallback(() => {
    switch (step) {
      case "pick-skill":
        setSelectedWorker(null);
        setStep("pick-worker");
        break;
      case "configure":
        if (selectedWorker?.skills.length === 1) {
          setSelectedWorker(null);
          setSelectedSkill(null);
          setStep("pick-worker");
        } else {
          setSelectedSkill(null);
          setStep("pick-skill");
        }
        break;
      case "confirm":
        if (selectedSkill?.parameters?.length) {
          setStep("configure");
        } else if (selectedWorker?.skills.length === 1) {
          setSelectedWorker(null);
          setSelectedSkill(null);
          setStep("pick-worker");
        } else {
          setSelectedSkill(null);
          setStep("pick-skill");
        }
        break;
    }
  }, [step, selectedWorker, selectedSkill]);

  const goToConfirm = useCallback(() => {
    setStep("confirm");
  }, []);

  const confirmSpawn = useCallback(async (): Promise<SpawnWorkerResponse | null> => {
    if (!selectedWorker || !selectedSkill) return null;

    setSpawning(true);
    setError(null);

    try {
      const result = await spawnWorker({
        workerId: selectedWorker.id,
        skillId: selectedSkill.id,
        parameters: Object.keys(parameters).length > 0 ? parameters : undefined,
      });
      return result;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to spawn worker");
      return null;
    } finally {
      setSpawning(false);
    }
  }, [selectedWorker, selectedSkill, parameters]);

  const reset = useCallback(() => {
    setStep("pick-worker");
    setSelectedWorker(null);
    setSelectedSkill(null);
    setParameters({});
    setError(null);
  }, []);

  const canProceed = useMemo(() => {
    if (step !== "configure" || !selectedSkill) return true;
    const requiredParams = selectedSkill.parameters?.filter((p) => p.required) ?? [];
    return requiredParams.every((p) => parameters[p.name]?.trim());
  }, [step, selectedSkill, parameters]);

  return {
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
    reset,
    canProceed,
  };
}
