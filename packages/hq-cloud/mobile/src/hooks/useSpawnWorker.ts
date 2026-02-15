/**
 * useSpawnWorker - Hook for the worker spawn flow.
 * Manages worker registry loading, selection state, and spawn execution.
 * MOB-011: Spawn worker from mobile
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchWorkers, spawnWorker } from "../services/workers";
import type {
  WorkerDefinition,
  WorkerSkill,
  SpawnWorkerResponse,
} from "../types";

/** Steps in the spawn flow */
export type SpawnStep = "pick-worker" | "pick-skill" | "configure" | "confirm";

interface UseSpawnWorkerReturn {
  /** All available workers from the registry */
  workers: WorkerDefinition[];
  /** Whether the worker list is loading */
  loading: boolean;
  /** Error from loading or spawning */
  error: string | null;
  /** Current step in the spawn flow */
  step: SpawnStep;
  /** Currently selected worker */
  selectedWorker: WorkerDefinition | null;
  /** Currently selected skill */
  selectedSkill: WorkerSkill | null;
  /** Current parameter values */
  parameters: Record<string, string>;
  /** Whether a spawn request is in progress */
  spawning: boolean;
  /** Select a worker and advance to skill selection */
  selectWorker: (worker: WorkerDefinition) => void;
  /** Select a skill and advance to configure/confirm */
  selectSkill: (skill: WorkerSkill) => void;
  /** Update a parameter value */
  setParameter: (name: string, value: string) => void;
  /** Go back one step */
  goBack: () => void;
  /** Advance to confirmation step */
  goToConfirm: () => void;
  /** Execute the spawn */
  confirmSpawn: () => Promise<SpawnWorkerResponse | null>;
  /** Reset the flow to the beginning */
  reset: () => void;
  /** Whether all required parameters are filled */
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

  // Fetch workers from registry on mount
  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchWorkers();
        if (!cancelled) {
          setWorkers(data);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : "Failed to load workers";
          setError(message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectWorker = useCallback((worker: WorkerDefinition) => {
    setSelectedWorker(worker);
    setSelectedSkill(null);
    setParameters({});
    // If worker has only one skill, auto-select it
    if (worker.skills.length === 1) {
      setSelectedSkill(worker.skills[0]);
      // If the skill has parameters, go to configure; otherwise confirm
      if (worker.skills[0].parameters && worker.skills[0].parameters.length > 0) {
        setStep("configure");
      } else {
        setStep("confirm");
      }
    } else {
      setStep("pick-skill");
    }
  }, []);

  const selectSkill = useCallback((skill: WorkerSkill) => {
    setSelectedSkill(skill);
    setParameters({});
    // If skill has parameters, go to configure; otherwise confirm
    if (skill.parameters && skill.parameters.length > 0) {
      setStep("configure");
    } else {
      setStep("confirm");
    }
  }, []);

  const setParameter = useCallback((name: string, value: string) => {
    setParameters((prev) => ({ ...prev, [name]: value }));
  }, []);

  const goBack = useCallback(() => {
    switch (step) {
      case "pick-skill":
        setSelectedWorker(null);
        setSelectedSkill(null);
        setParameters({});
        setStep("pick-worker");
        break;
      case "configure":
        if (selectedWorker && selectedWorker.skills.length === 1) {
          // Only one skill - go back to worker picker
          setSelectedWorker(null);
          setSelectedSkill(null);
          setParameters({});
          setStep("pick-worker");
        } else {
          setSelectedSkill(null);
          setParameters({});
          setStep("pick-skill");
        }
        break;
      case "confirm":
        if (selectedSkill?.parameters && selectedSkill.parameters.length > 0) {
          setStep("configure");
        } else if (selectedWorker && selectedWorker.skills.length === 1) {
          setSelectedWorker(null);
          setSelectedSkill(null);
          setParameters({});
          setStep("pick-worker");
        } else {
          setSelectedSkill(null);
          setStep("pick-skill");
        }
        break;
      default:
        break;
    }
  }, [step, selectedWorker, selectedSkill]);

  const goToConfirm = useCallback(() => {
    setStep("confirm");
  }, []);

  const canProceed = useMemo(() => {
    if (!selectedSkill) return false;
    const requiredParams = selectedSkill.parameters?.filter((p) => p.required) ?? [];
    return requiredParams.every((p) => {
      const value = parameters[p.name];
      return value !== undefined && value.trim().length > 0;
    });
  }, [selectedSkill, parameters]);

  const confirmSpawn = useCallback(async (): Promise<SpawnWorkerResponse | null> => {
    if (!selectedWorker || !selectedSkill) return null;

    setSpawning(true);
    setError(null);

    try {
      const response = await spawnWorker({
        workerId: selectedWorker.id,
        skillId: selectedSkill.id,
        parameters: Object.keys(parameters).length > 0 ? parameters : undefined,
      });
      return response;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to spawn worker";
      setError(message);
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
    setSpawning(false);
  }, []);

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
