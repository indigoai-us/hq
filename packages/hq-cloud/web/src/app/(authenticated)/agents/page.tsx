"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSessions } from "@/hooks/useSessions";
import { createSession } from "@/services/sessions";
import { SectionHeader } from "@/components/SectionHeader";
import { SessionCard } from "@/components/SessionCard";
import { ActionButton } from "@/components/ActionButton";
import { GlobalInputBar } from "@/components/GlobalInputBar";
import { NewSessionSheet } from "@/components/NewSessionSheet";
import { OnboardingCard } from "@/components/OnboardingCard";
import type { Session } from "@/types/session";

const ONBOARDING_DISMISSED_KEY = "hq-cloud-onboarding-dismissed";

export default function AgentsPage() {
  const router = useRouter();
  const { sessions, loading, refreshing, error, refresh, addSession } = useSessions();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [quickCreating, setQuickCreating] = useState(false);
  const [onboardingDismissed, setOnboardingDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(ONBOARDING_DISMISSED_KEY) === "true";
  });

  const handleDismissOnboarding = useCallback(() => {
    setOnboardingDismissed(true);
    localStorage.setItem(ONBOARDING_DISMISSED_KEY, "true");
  }, []);

  // Quick-create from the global input bar (free-form prompt shortcut)
  const handleQuickCreate = useCallback(
    async (prompt: string) => {
      if (quickCreating || !prompt.trim()) return;
      setQuickCreating(true);
      try {
        const label =
          prompt.trim().length <= 50
            ? prompt.trim()
            : prompt.trim().slice(0, 50) + "...";
        const session = await createSession({ prompt: prompt.trim(), label });
        addSession(session);
        router.push(`/agents/${session.sessionId}`);
      } catch {
        // Fall back to opening the sheet if quick-create fails
        setSheetOpen(true);
      } finally {
        setQuickCreating(false);
      }
    },
    [quickCreating, addSession, router],
  );

  const handleSessionCreated = useCallback(
    (session: Session) => {
      addSession(session);
      setSheetOpen(false);
      router.push(`/agents/${session.sessionId}`);
    },
    [addSession, router],
  );

  if (loading && sessions.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="text-text-secondary text-sm">Loading sessions...</span>
      </div>
    );
  }

  if (error && sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <span className="text-text-secondary text-sm">{error}</span>
        <ActionButton label="Retry" variant="primary" size="sm" onClick={refresh} />
      </div>
    );
  }

  const activeSessions = sessions.filter(
    (s) => s.status === "active" || s.status === "starting",
  );
  const pastSessions = sessions.filter(
    (s) => s.status === "stopped" || s.status === "errored" || s.status === "stopping",
  );

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto">
        {/* Header */}
        <div className="px-4 pt-4 pb-2 flex items-center justify-between">
          <SectionHeader title="Sessions" />
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={refresh}
              disabled={refreshing}
              className={`text-xs text-accent-blue hover:underline ${refreshing ? "opacity-50" : ""}`}
            >
              {refreshing ? "Refreshing..." : "Refresh"}
            </button>
            <ActionButton
              label="New Session"
              variant="primary"
              size="sm"
              onClick={() => setSheetOpen(true)}
            />
          </div>
        </div>

        {sessions.length === 0 ? (
          !onboardingDismissed ? (
            <div className="pt-4">
              <OnboardingCard onDismiss={handleDismissOnboarding} />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-48 gap-3">
              <div className="w-16 h-16 rounded-full bg-bg-tertiary flex items-center justify-center">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-text-tertiary">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </div>
              <span className="text-text-secondary text-sm">No sessions yet</span>
              <span className="text-text-tertiary text-xs max-w-64 text-center">
                Start a new Claude Code session to begin working with your HQ
              </span>
              <ActionButton
                label="Start Session"
                variant="prominent"
                onClick={() => setSheetOpen(true)}
              />
            </div>
          )
        ) : (
          <div className="px-4 pb-4">
            {/* Active sessions */}
            {activeSessions.length > 0 && (
              <div className="mb-4">
                <p className="text-xs text-text-tertiary uppercase tracking-wide mb-2">
                  Active ({activeSessions.length})
                </p>
                <div className="space-y-3">
                  {activeSessions.map((session) => (
                    <SessionCard
                      key={session.sessionId}
                      session={session}
                      onClick={() => router.push(`/agents/${session.sessionId}`)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Past sessions */}
            {pastSessions.length > 0 && (
              <div>
                <p className="text-xs text-text-tertiary uppercase tracking-wide mb-2">
                  Recent ({pastSessions.length})
                </p>
                <div className="space-y-3">
                  {pastSessions.map((session) => (
                    <SessionCard
                      key={session.sessionId}
                      session={session}
                      onClick={() => router.push(`/agents/${session.sessionId}`)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <GlobalInputBar
        onSend={(content) => void handleQuickCreate(content)}
        sending={quickCreating}
        placeholder="Start a new session..."
      />

      <NewSessionSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onCreated={handleSessionCreated}
      />
    </div>
  );
}
