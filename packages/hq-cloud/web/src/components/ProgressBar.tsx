interface ProgressBarProps {
  completed: number;
  total: number;
  showFraction?: boolean;
}

export function ProgressBar({ completed, total, showFraction = true }: ProgressBarProps) {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const isComplete = completed >= total && total > 0;
  const fillColor = isComplete ? "bg-progress-complete" : "bg-progress-active";

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1 bg-progress-track rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${fillColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {showFraction && (
        <span className="text-xs font-medium text-text-secondary tabular-nums">
          {completed}/{total}
        </span>
      )}
    </div>
  );
}
