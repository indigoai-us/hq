/**
 * SubmissionReview — list of pending and historical submissions for admin review.
 *
 * - Lists pending submissions with member name, title, date, status badge
 * - Click to expand diff (fetched on demand via github-diff proxy)
 * - Approve button with confirmation
 * - Reject button opens optional reason field
 * - History section (approved/rejected) collapsed by default
 */

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "../lib/auth";
import {
  listSubmissions,
  approveSubmission,
  rejectSubmission,
  getSubmissionDiff,
  type Submission,
  type CompareResult,
} from "../lib/api";
import { DiffViewer } from "./DiffViewer";

interface SubmissionReviewProps {
  teamId: string;
  members: Array<{ userId: string; username: string }>;
}

export function SubmissionReview({ teamId, members }: SubmissionReviewProps) {
  const { getToken } = useAuth();
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Per-submission expanded diff state
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [diffLoading, setDiffLoading] = useState<Record<string, boolean>>({});
  const [diffs, setDiffs] = useState<Record<string, CompareResult>>({});
  const [diffErrors, setDiffErrors] = useState<Record<string, string>>({});

  // Action state
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
  const [rejectOpen, setRejectOpen] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  // History collapse
  const [historyOpen, setHistoryOpen] = useState(false);

  const memberName = useCallback(
    (userId: string) =>
      members.find((m) => m.userId === userId)?.username ?? userId,
    [members]
  );

  useEffect(() => {
    async function load() {
      const token = await getToken();
      if (!token) return;
      setLoading(true);
      try {
        const list = await listSubmissions(token, teamId);
        setSubmissions(list);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load submissions");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [teamId, getToken]);

  async function toggleDiff(submission: Submission) {
    if (expandedId === submission.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(submission.id);

    if (diffs[submission.id]) return; // already loaded

    setDiffLoading((prev) => ({ ...prev, [submission.id]: true }));
    setDiffErrors((prev) => { const next = { ...prev }; delete next[submission.id]; return next; });

    try {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated");
      const result = await getSubmissionDiff(token, teamId, submission.branchName);
      setDiffs((prev) => ({ ...prev, [submission.id]: result }));
    } catch (err) {
      setDiffErrors((prev) => ({
        ...prev,
        [submission.id]: err instanceof Error ? err.message : "Failed to load diff",
      }));
    } finally {
      setDiffLoading((prev) => ({ ...prev, [submission.id]: false }));
    }
  }

  async function handleApprove(submission: Submission) {
    const confirmed = window.confirm(
      `Approve "${submission.title}"? This will merge the branch "${submission.branchName}" into main.`
    );
    if (!confirmed) return;

    const token = await getToken();
    if (!token) return;
    setActionLoading((prev) => ({ ...prev, [submission.id]: true }));
    setError(null);
    try {
      const { submission: updated } = await approveSubmission(token, teamId, submission.id);
      setSubmissions((prev) =>
        prev.map((s) => (s.id === updated.id ? updated : s))
      );
      // Collapse if expanded
      if (expandedId === submission.id) setExpandedId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to approve submission");
    } finally {
      setActionLoading((prev) => ({ ...prev, [submission.id]: false }));
    }
  }

  function openReject(submissionId: string) {
    setRejectOpen(submissionId);
    setRejectReason("");
  }

  async function confirmReject(submission: Submission) {
    const token = await getToken();
    if (!token) return;
    setActionLoading((prev) => ({ ...prev, [submission.id]: true }));
    setError(null);
    try {
      const { submission: updated } = await rejectSubmission(
        token,
        teamId,
        submission.id,
        rejectReason.trim() || undefined
      );
      setSubmissions((prev) =>
        prev.map((s) => (s.id === updated.id ? updated : s))
      );
      setRejectOpen(null);
      setRejectReason("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reject submission");
    } finally {
      setActionLoading((prev) => ({ ...prev, [submission.id]: false }));
    }
  }

  if (loading) {
    return <p className="text-xs text-neutral-600">Loading submissions...</p>;
  }

  const pending = submissions.filter((s) => s.status === "pending");
  const history = submissions.filter((s) => s.status !== "pending");

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-md bg-red-900/30 border border-red-800/50 px-3 py-2 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Pending submissions */}
      {pending.length === 0 ? (
        <p className="text-xs text-neutral-600">No pending submissions.</p>
      ) : (
        <div className="space-y-2">
          {pending.map((sub) => (
            <SubmissionCard
              key={sub.id}
              submission={sub}
              memberName={memberName(sub.userId)}
              expanded={expandedId === sub.id}
              diff={diffs[sub.id]}
              diffLoading={diffLoading[sub.id] ?? false}
              diffError={diffErrors[sub.id]}
              actionLoading={actionLoading[sub.id] ?? false}
              rejectOpen={rejectOpen === sub.id}
              rejectReason={rejectReason}
              onToggleDiff={() => toggleDiff(sub)}
              onApprove={() => handleApprove(sub)}
              onOpenReject={() => openReject(sub.id)}
              onRejectReasonChange={setRejectReason}
              onConfirmReject={() => confirmReject(sub)}
              onCancelReject={() => setRejectOpen(null)}
            />
          ))}
        </div>
      )}

      {/* History section */}
      {history.length > 0 && (
        <div className="mt-4">
          <button
            onClick={() => setHistoryOpen((v) => !v)}
            className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-neutral-500 hover:text-neutral-300 transition-colors"
          >
            <span className={`transition-transform ${historyOpen ? "rotate-90" : ""}`}>▶</span>
            History ({history.length})
          </button>
          {historyOpen && (
            <div className="mt-2 space-y-2">
              {history.map((sub) => (
                <SubmissionCard
                  key={sub.id}
                  submission={sub}
                  memberName={memberName(sub.userId)}
                  expanded={expandedId === sub.id}
                  diff={diffs[sub.id]}
                  diffLoading={diffLoading[sub.id] ?? false}
                  diffError={diffErrors[sub.id]}
                  actionLoading={false}
                  rejectOpen={false}
                  rejectReason=""
                  onToggleDiff={() => toggleDiff(sub)}
                  onApprove={() => {}}
                  onOpenReject={() => {}}
                  onRejectReasonChange={() => {}}
                  onConfirmReject={() => {}}
                  onCancelReject={() => {}}
                  readOnly
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// --- SubmissionCard ---

interface SubmissionCardProps {
  submission: Submission;
  memberName: string;
  expanded: boolean;
  diff?: CompareResult;
  diffLoading: boolean;
  diffError?: string;
  actionLoading: boolean;
  rejectOpen: boolean;
  rejectReason: string;
  onToggleDiff: () => void;
  onApprove: () => void;
  onOpenReject: () => void;
  onRejectReasonChange: (v: string) => void;
  onConfirmReject: () => void;
  onCancelReject: () => void;
  readOnly?: boolean;
}

function SubmissionCard({
  submission,
  memberName,
  expanded,
  diff,
  diffLoading,
  diffError,
  actionLoading,
  rejectOpen,
  rejectReason,
  onToggleDiff,
  onApprove,
  onOpenReject,
  onRejectReasonChange,
  onConfirmReject,
  onCancelReject,
  readOnly,
}: SubmissionCardProps) {
  return (
    <div className="rounded-md border border-neutral-800 overflow-hidden">
      {/* Card header — click to expand */}
      <button
        onClick={onToggleDiff}
        className="w-full flex items-start justify-between px-3 py-2.5 hover:bg-neutral-900/50 transition-colors text-left"
      >
        <div className="flex-1 min-w-0 mr-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-neutral-200 truncate">
              {submission.title}
            </span>
            <StatusBadge status={submission.status} />
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-xs text-neutral-500">
            <span>{memberName}</span>
            <span>·</span>
            <span className="font-mono">{submission.branchName}</span>
            <span>·</span>
            <span>{new Date(submission.createdAt).toLocaleDateString()}</span>
          </div>
          {submission.description && (
            <p className="mt-1 text-xs text-neutral-400 truncate">
              {submission.description}
            </p>
          )}
          {submission.rejectionReason && (
            <p className="mt-1 text-xs text-red-400">
              Rejection reason: {submission.rejectionReason}
            </p>
          )}
        </div>
        <span className="text-neutral-600 text-xs flex-shrink-0 mt-0.5">
          {expanded ? "▲" : "▼"}
        </span>
      </button>

      {/* Expanded: diff + action buttons */}
      {expanded && (
        <div className="border-t border-neutral-800">
          {/* Diff content */}
          <div className="p-3">
            {diffLoading ? (
              <p className="text-xs text-neutral-500">Loading diff...</p>
            ) : diffError ? (
              <p className="text-xs text-red-400">{diffError}</p>
            ) : diff ? (
              <>
                <div className="flex items-center gap-3 mb-3 text-xs text-neutral-500">
                  <span>
                    Comparing{" "}
                    <code className="font-mono text-neutral-400">{diff.baseBranch}</code>
                    {" "}←{" "}
                    <code className="font-mono text-neutral-400">{diff.headBranch}</code>
                  </span>
                  <span>{diff.files.length} file{diff.files.length !== 1 ? "s" : ""} changed</span>
                  <span className="text-green-500">+{diff.files.reduce((n, f) => n + f.additions, 0)}</span>
                  <span className="text-red-500">-{diff.files.reduce((n, f) => n + f.deletions, 0)}</span>
                </div>
                <DiffViewer files={diff.files} />
              </>
            ) : null}
          </div>

          {/* Action buttons — only for pending */}
          {!readOnly && submission.status === "pending" && (
            <div className="px-3 pb-3 space-y-2">
              {rejectOpen ? (
                <div className="rounded-md border border-neutral-800 bg-neutral-900/50 p-3 space-y-2">
                  <p className="text-xs text-neutral-400">
                    Optional rejection reason:
                  </p>
                  <textarea
                    value={rejectReason}
                    onChange={(e) => onRejectReasonChange(e.target.value)}
                    placeholder="Leave blank to reject without a reason"
                    rows={2}
                    className="w-full rounded bg-neutral-800 px-2 py-1.5 text-xs text-neutral-300 placeholder-neutral-600 resize-none focus:outline-none focus:ring-1 focus:ring-neutral-600"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={onConfirmReject}
                      disabled={actionLoading}
                      className="rounded bg-red-900/60 hover:bg-red-800/60 px-3 py-1.5 text-xs font-medium text-red-300 transition-colors disabled:opacity-50"
                    >
                      {actionLoading ? "Rejecting..." : "Confirm Reject"}
                    </button>
                    <button
                      onClick={onCancelReject}
                      className="rounded bg-neutral-800 hover:bg-neutral-700 px-3 py-1.5 text-xs text-neutral-400 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={onApprove}
                    disabled={actionLoading}
                    className="rounded bg-green-900/50 hover:bg-green-800/50 px-3 py-1.5 text-xs font-medium text-green-300 transition-colors disabled:opacity-50"
                  >
                    {actionLoading ? "Approving..." : "Approve"}
                  </button>
                  <button
                    onClick={onOpenReject}
                    disabled={actionLoading}
                    className="rounded bg-neutral-800 hover:bg-neutral-700 px-3 py-1.5 text-xs font-medium text-neutral-300 transition-colors disabled:opacity-50"
                  >
                    Reject
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    pending: { label: "pending", cls: "bg-amber-900/40 text-amber-400" },
    approved: { label: "approved", cls: "bg-green-900/40 text-green-400" },
    rejected: { label: "rejected", cls: "bg-red-900/40 text-red-400" },
  };
  const entry = map[status] ?? {
    label: status,
    cls: "bg-neutral-800 text-neutral-500",
  };
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs ${entry.cls}`}>
      {entry.label}
    </span>
  );
}
