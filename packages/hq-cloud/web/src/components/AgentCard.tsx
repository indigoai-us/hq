"use client";

import { useState, useCallback } from "react";
import type { Agent } from "@/types/agent";
import { answerQuestion, respondToPermission } from "@/services/agents";
import { Card } from "./Card";
import { ProgressBar } from "./ProgressBar";
import { StatusDot } from "./StatusDot";
import { AgentTypeIcon } from "./AgentTypeIcon";
import { OptionButton } from "./OptionButton";
import { ActionButton } from "./ActionButton";

interface AgentCardProps {
  agent: Agent;
  onClick: () => void;
  onAgentUpdate?: (agentId: string, changes: Partial<Agent>) => void;
}

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

function statusToNodeStatus(status: string) {
  switch (status) {
    case "running": return "warning" as const;
    case "completed": return "healthy" as const;
    case "error": return "error" as const;
    case "waiting_input": return "warning" as const;
    default: return "idle" as const;
  }
}

export function AgentCard({ agent, onClick, onAgentUpdate }: AgentCardProps) {
  const [answerSending, setAnswerSending] = useState(false);
  const [permissionSending, setPermissionSending] = useState(false);
  const [answered, setAnswered] = useState(false);
  const [freeformText, setFreeformText] = useState("");

  const handleOptionClick = useCallback(
    async (option: string) => {
      if (answerSending || !agent.currentQuestion) return;
      setAnswerSending(true);
      navigator.vibrate?.(50);

      try {
        await answerQuestion(agent.id, agent.currentQuestion.id, option);
        onAgentUpdate?.(agent.id, { currentQuestion: undefined, status: "running" });
        setAnswered(true);
        setTimeout(() => setAnswered(false), 2000);
      } catch {
        // Failed
      } finally {
        setAnswerSending(false);
      }
    },
    [agent, answerSending, onAgentUpdate],
  );

  const handleFreeformSubmit = useCallback(() => {
    if (!freeformText.trim()) return;
    void handleOptionClick(freeformText.trim());
    setFreeformText("");
  }, [freeformText, handleOptionClick]);

  const handlePermission = useCallback(
    async (allowed: boolean) => {
      if (permissionSending || !agent.currentPermission) return;
      setPermissionSending(true);
      navigator.vibrate?.(50);

      try {
        await respondToPermission(agent.id, agent.currentPermission.id, allowed);
        onAgentUpdate?.(agent.id, { currentPermission: undefined, status: "running" });
        setAnswered(true);
        setTimeout(() => setAnswered(false), 2000);
      } catch {
        // Failed
      } finally {
        setPermissionSending(false);
      }
    },
    [agent, permissionSending, onAgentUpdate],
  );

  // Permission takes priority over question
  const showPermission = agent.currentPermission && !answered;
  const showQuestion = agent.currentQuestion && !showPermission && !answered;

  return (
    <Card onClick={onClick} className="p-4">
      {/* Header row */}
      <div className="flex items-start gap-3">
        <AgentTypeIcon type={agent.type} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-base font-semibold text-text-primary truncate">
              {agent.name}
            </span>
            <StatusDot status={statusToNodeStatus(agent.status)} />
          </div>
          <span className="text-xs text-text-tertiary">
            {formatTimeAgo(agent.lastActivity)}
          </span>
        </div>
      </div>

      {/* Progress */}
      <div className="mt-3">
        <ProgressBar completed={agent.progress.completed} total={agent.progress.total} />
      </div>

      {/* Answered confirmation */}
      {answered && (
        <div className="mt-3 text-sm text-accent-green font-medium">
          Answered
        </div>
      )}

      {/* Permission prompt (priority) */}
      {showPermission && (
        <div className="mt-3 p-3 bg-bg-secondary rounded-md border border-border-subtle" onClick={(e) => e.stopPropagation()}>
          <p className="text-sm text-text-secondary mb-1">Permission requested</p>
          <p className="text-sm text-text-primary mb-3">
            Allow to <strong>{agent.currentPermission!.tool}</strong>?
            <span className="block text-text-tertiary text-xs mt-0.5">
              {agent.currentPermission!.description}
            </span>
          </p>
          <div className="flex gap-2">
            <ActionButton
              label="Allow"
              variant="prominent"
              size="sm"
              disabled={permissionSending}
              onClick={() => void handlePermission(true)}
            />
            <ActionButton
              label="Deny"
              variant="muted"
              size="sm"
              disabled={permissionSending}
              onClick={() => void handlePermission(false)}
            />
          </div>
        </div>
      )}

      {/* Question prompt */}
      {showQuestion && (
        <div className="mt-3 p-3 bg-bg-secondary rounded-md border border-border-subtle" onClick={(e) => e.stopPropagation()}>
          <p className="text-sm text-text-primary mb-2">{agent.currentQuestion!.text}</p>

          {agent.currentQuestion!.options && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {agent.currentQuestion!.options.map((opt) => (
                <OptionButton
                  key={opt}
                  label={opt}
                  disabled={answerSending}
                  onClick={() => void handleOptionClick(opt)}
                />
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <input
              type="text"
              value={freeformText}
              onChange={(e) => setFreeformText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.stopPropagation();
                  handleFreeformSubmit();
                }
              }}
              onClick={(e) => e.stopPropagation()}
              placeholder="Type a response..."
              className="flex-1 bg-bg-tertiary text-text-primary text-sm px-3 py-1.5 rounded-md border border-border-subtle focus:border-accent-blue focus:outline-none"
              disabled={answerSending}
            />
            <ActionButton
              label="Send"
              variant="primary"
              size="sm"
              disabled={answerSending || !freeformText.trim()}
              onClick={handleFreeformSubmit}
            />
          </div>
        </div>
      )}
    </Card>
  );
}
