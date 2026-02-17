"use client";

import type { ProjectStatus } from "@/types/project";

interface TrainTrackProps {
  completionPercent: number;
  status: ProjectStatus;
  storiesComplete: number;
  storiesTotal: number;
}

const stations = [0, 25, 50, 75, 100];

function statusColor(status: ProjectStatus) {
  if (status === "COMPLETED") return "bg-accent-green";
  if (status === "IN_PROGRESS") return "bg-accent-blue";
  return "bg-accent-yellow";
}

function statusGlow(status: ProjectStatus) {
  if (status === "COMPLETED") return "shadow-[0_0_10px_rgba(74,222,128,0.5)]";
  return "";
}

function fillColor(status: ProjectStatus) {
  if (status === "COMPLETED") return "bg-accent-green/40";
  if (status === "IN_PROGRESS") return "bg-accent-blue/40";
  return "bg-accent-yellow/40";
}

function stationDotColor(status: ProjectStatus, stationPct: number, trainPct: number) {
  if (stationPct <= trainPct) return statusColor(status);
  return "bg-bg-elevated";
}

export function TrainTrack({
  completionPercent,
  status,
  storiesComplete,
  storiesTotal,
}: TrainTrackProps) {
  const pct = Math.max(0, Math.min(100, completionPercent));

  return (
    <div className="w-full py-2">
      {/* Track */}
      <div className="relative h-6 flex items-center">
        {/* Rail background */}
        <div className="absolute inset-x-0 h-1 bg-progress-track rounded-full" />

        {/* Filled rail */}
        <div
          className={`absolute left-0 h-1 rounded-full transition-all duration-700 ease-out ${fillColor(status)}`}
          style={{ width: `${pct}%` }}
        />

        {/* Station dots */}
        {stations.map((s) => {
          const isEndpoint = s === 0 || s === 100;
          const size = isEndpoint ? "w-3 h-3" : "w-2 h-2";
          return (
            <div
              key={s}
              className={`absolute ${size} rounded-full ${stationDotColor(status, s, pct)} transition-colors duration-500 border border-bg-primary`}
              style={{ left: `${s}%`, transform: "translateX(-50%)" }}
            />
          );
        })}

        {/* Train */}
        <div
          className={`absolute w-5 h-5 rounded-md ${statusColor(status)} ${statusGlow(status)} flex items-center justify-center transition-all duration-700 ease-out z-10`}
          style={{ left: `${pct}%`, transform: "translateX(-50%)" }}
        >
          {status === "COMPLETED" ? (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M2 6l3 3 5-5" stroke="#0D0D0F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M3 2l4 3-4 3" stroke="#0D0D0F" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </div>
      </div>

      {/* Labels */}
      <div className="flex justify-between items-center mt-1 text-[10px] text-text-tertiary">
        <span>Start</span>
        <span className="text-text-secondary tabular-nums">
          {storiesComplete}/{storiesTotal}
        </span>
        <span>Done</span>
      </div>
    </div>
  );
}
