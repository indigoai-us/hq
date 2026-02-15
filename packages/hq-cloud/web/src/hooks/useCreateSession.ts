"use client";

import { useState, useCallback, useMemo } from "react";
import type { WorkerDefinition, WorkerSkill } from "@/types/worker";
import type { Session, CreateSessionInput } from "@/types/session";
import { fetchWorkers } from "@/services/workers";
import { createSession } from "@/services/sessions";

export type CreationMode = "choose" | "worker" | "free-form";
export type WorkerStep = "pick-worker" | "pick-skill" | "configure" | "review";

export interface UseCreateSessionReturn {
  // Mode
  mode: CreationMode;
  setMode: (mode: CreationMode) => void;

  // Worker flow
  workers: WorkerDefinition[];
  workersLoading: boolean;
  workersError: string | null;
  workerStep: WorkerStep;
  selectedWorker: WorkerDefinition | null;
  selectedSkill: WorkerSkill | null;
  parameters: Record<string, string>;
  selectWorker: (worker: WorkerDefinition) => void;
  selectSkill: (skill: WorkerSkill) => void;
  setParameter: (name: string, value: string) => void;
  canProceedWorker: boolean;
  goToReview: () => void;

  // Free-form flow
  freeFormPrompt: string;
  setFreeFormPrompt: (prompt: string) => void;

  // Shared
  label: string;
  creating: boolean;
  error: string | null;
  confirm: () => Promise<Session | null>;
  goBack: () => void;
  reset: () => void;
  loadWorkers: () => Promise<void>;
}

/** Generate a label from a prompt (first 50 chars) */
export function generateLabel(prompt: string): string {
  const trimmed = prompt.trim();
  if (!trimmed) return "New Session";
  if (trimmed.length <= 50) return trimmed;
  return trimmed.slice(0, 50) + "...";
}

/** Build an initial prompt from a worker skill definition */
export function buildWorkerPrompt(
  worker: WorkerDefinition,
  skill: WorkerSkill,
  parameters: Record<string, string>,
): string {
  const parts: string[] = [];
  parts.push(`Run the "${skill.name}" skill from the "${worker.name}" worker.`);

  if (skill.description) {
    parts.push(skill.description);
  }

  const filled = Object.entries(parameters).filter(([, v]) => v.trim());
  if (filled.length > 0) {
    parts.push("Parameters:");
    for (const [key, val] of filled) {
      parts.push(`  ${key}: ${val}`);
    }
  }

  return parts.join("\n");
}

/** Build a label from worker + skill selection */
export function buildWorkerLabel(worker: WorkerDefinition, skill: WorkerSkill): string {
  return `${worker.name} - ${skill.name}`;
}

export function useCreateSession(): UseCreateSessionReturn {
  const [mode, setModeInternal] = useState<CreationMode>("choose");
  const [workers, setWorkers] = useState<WorkerDefinition[]>([]);
  const [workersLoading, setWorkersLoading] = useState(false);
  const [workersError, setWorkersError] = useState<string | null>(null);
  const [workerStep, setWorkerStep] = useState<WorkerStep>("pick-worker");
  const [selectedWorker, setSelectedWorker] = useState<WorkerDefinition | null>(null);
  const [selectedSkill, setSelectedSkill] = useState<WorkerSkill | null>(null);
  const [parameters, setParameters] = useState<Record<string, string>>({});
  const [freeFormPrompt, setFreeFormPrompt] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadWorkers = useCallback(async () => {
    setWorkersLoading(true);
    setWorkersError(null);
    try {
      const data = await fetchWorkers();
      setWorkers(data);
    } catch (err) {
      setWorkersError(err instanceof Error ? err.message : "Failed to load workers");
    } finally {
      setWorkersLoading(false);
    }
  }, []);

  const setMode = useCallback(
    (newMode: CreationMode) => {
      setModeInternal(newMode);
      setError(null);
      if (newMode === "worker" && workers.length === 0) {
        void loadWorkers();
      }
    },
    [workers.length, loadWorkers],
  );

  const selectWorker = useCallback((worker: WorkerDefinition) => {
    setSelectedWorker(worker);
    setSelectedSkill(null);
    setParameters({});

    if (worker.skills.length === 1) {
      const skill = worker.skills[0];
      setSelectedSkill(skill);
      const defaults: Record<string, string> = {};
      for (const param of skill.parameters ?? []) {
        if (param.defaultValue) defaults[param.name] = param.defaultValue;
      }
      setParameters(defaults);
      setWorkerStep(skill.parameters?.length ? "configure" : "review");
    } else {
      setWorkerStep("pick-skill");
    }
  }, []);

  const selectSkill = useCallback((skill: WorkerSkill) => {
    setSelectedSkill(skill);
    const defaults: Record<string, string> = {};
    for (const param of skill.parameters ?? []) {
      if (param.defaultValue) defaults[param.name] = param.defaultValue;
    }
    setParameters(defaults);
    setWorkerStep(skill.parameters?.length ? "configure" : "review");
  }, []);

  const setParameter = useCallback((name: string, value: string) => {
    setParameters((prev) => ({ ...prev, [name]: value }));
  }, []);

  const canProceedWorker = useMemo(() => {
    if (workerStep !== "configure" || !selectedSkill) return true;
    const required = selectedSkill.parameters?.filter((p) => p.required) ?? [];
    return required.every((p) => parameters[p.name]?.trim());
  }, [workerStep, selectedSkill, parameters]);

  const goToReview = useCallback(() => {
    setWorkerStep("review");
  }, []);

  const goBack = useCallback(() => {
    setError(null);

    if (mode === "free-form") {
      setModeInternal("choose");
      setFreeFormPrompt("");
      return;
    }

    if (mode === "worker") {
      switch (workerStep) {
        case "pick-worker":
          setModeInternal("choose");
          setSelectedWorker(null);
          break;
        case "pick-skill":
          setSelectedWorker(null);
          setWorkerStep("pick-worker");
          break;
        case "configure":
          if (selectedWorker?.skills.length === 1) {
            setSelectedWorker(null);
            setSelectedSkill(null);
            setWorkerStep("pick-worker");
          } else {
            setSelectedSkill(null);
            setWorkerStep("pick-skill");
          }
          break;
        case "review":
          if (selectedSkill?.parameters?.length) {
            setWorkerStep("configure");
          } else if (selectedWorker?.skills.length === 1) {
            setSelectedWorker(null);
            setSelectedSkill(null);
            setWorkerStep("pick-worker");
          } else {
            setSelectedSkill(null);
            setWorkerStep("pick-skill");
          }
          break;
      }
      return;
    }

    // mode === "choose" — nothing to go back to
  }, [mode, workerStep, selectedWorker, selectedSkill]);

  const label = useMemo(() => {
    if (mode === "worker" && selectedWorker && selectedSkill) {
      return buildWorkerLabel(selectedWorker, selectedSkill);
    }
    if (mode === "free-form" && freeFormPrompt.trim()) {
      return generateLabel(freeFormPrompt);
    }
    return "New Session";
  }, [mode, selectedWorker, selectedSkill, freeFormPrompt]);

  const confirm = useCallback(async (): Promise<Session | null> => {
    setCreating(true);
    setError(null);

    try {
      let input: CreateSessionInput;

      if (mode === "worker" && selectedWorker && selectedSkill) {
        const prompt = buildWorkerPrompt(selectedWorker, selectedSkill, parameters);
        const sessionLabel = buildWorkerLabel(selectedWorker, selectedSkill);
        input = {
          prompt,
          label: sessionLabel,
          workerId: selectedWorker.id,
          skillId: selectedSkill.id,
          workerContext: `${selectedWorker.id}/${selectedSkill.id}`,
        };
      } else if (mode === "free-form" && freeFormPrompt.trim()) {
        input = {
          prompt: freeFormPrompt.trim(),
          label: generateLabel(freeFormPrompt),
        };
      } else {
        setError("Please provide a prompt or select a worker");
        return null;
      }

      const session = await createSession(input);
      return session;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create session";
      // Parse rate-limit errors
      if (message.includes("429") || message.toLowerCase().includes("rate limit") || message.toLowerCase().includes("max")) {
        setError("You have reached the maximum of 5 active sessions. Please stop an existing session first.");
      } else if (message.includes("CLAUDE_TOKEN_REQUIRED") || message.includes("Claude Token Required")) {
        setError("You need to store a Claude token before creating sessions. Go to Settings > Claude Token to set one up.");
      } else {
        setError(message);
      }
      return null;
    } finally {
      setCreating(false);
    }
  }, [mode, selectedWorker, selectedSkill, parameters, freeFormPrompt]);

  const reset = useCallback(() => {
    setModeInternal("choose");
    setWorkerStep("pick-worker");
    setSelectedWorker(null);
    setSelectedSkill(null);
    setParameters({});
    setFreeFormPrompt("");
    setCreating(false);
    setError(null);
  }, []);

  return {
    mode,
    setMode,
    workers,
    workersLoading,
    workersError,
    workerStep,
    selectedWorker,
    selectedSkill,
    parameters,
    selectWorker,
    selectSkill,
    setParameter,
    canProceedWorker,
    goToReview,
    freeFormPrompt,
    setFreeFormPrompt,
    label,
    creating,
    error,
    confirm,
    goBack,
    reset,
    loadWorkers,
  };
}
