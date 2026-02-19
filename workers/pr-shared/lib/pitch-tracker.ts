import { readFileSync } from "node:fs";
import { parseJSONL, appendJSONL, writeJSONL } from "./media-db.js";
import type { Pitch, PitchStatus, Company } from "./types.js";

const PITCHES_PATH = "knowledge/public/pr/pitch-library/pitches.jsonl";

export function getPitches(): Pitch[] {
  return parseJSONL<Pitch>(PITCHES_PATH);
}

export function createPitch(pitch: Omit<Pitch, "id">): Pitch {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const existing = getPitches();
  const todayCount = existing.filter((p) => p.id.startsWith(`PITCH-${date}`)).length;
  const id = `PITCH-${date}-${String(todayCount + 1).padStart(3, "0")}`;
  const fullPitch: Pitch = { id, ...pitch };
  appendJSONL(PITCHES_PATH, fullPitch);
  return fullPitch;
}

export function updatePitchStatus(pitchId: string, status: PitchStatus, notes?: string): void {
  const pitches = getPitches();
  const updated = pitches.map((p) => {
    if (p.id === pitchId) {
      return { ...p, status, notes: notes ?? p.notes };
    }
    return p;
  });
  writeJSONL(PITCHES_PATH, updated);
}

export function getPitchStats(period?: { start: string; end: string }): {
  total: number;
  byStatus: Record<PitchStatus, number>;
  responseRate: number;
  placementRate: number;
  byCompany: Record<string, number>;
} {
  let pitches = getPitches();

  if (period) {
    pitches = pitches.filter((p) => {
      if (!p.sent_date) return false;
      return p.sent_date >= period.start && p.sent_date <= period.end;
    });
  }

  const byStatus: Record<string, number> = {};
  const byCompany: Record<string, number> = {};

  for (const p of pitches) {
    byStatus[p.status] = (byStatus[p.status] || 0) + 1;
    byCompany[p.company] = (byCompany[p.company] || 0) + 1;
  }

  const sent = pitches.filter((p) => p.status !== "draft").length;
  const responded = pitches.filter((p) => ["responded", "placed", "declined"].includes(p.status)).length;
  const placed = pitches.filter((p) => p.status === "placed").length;

  return {
    total: pitches.length,
    byStatus: byStatus as Record<PitchStatus, number>,
    responseRate: sent > 0 ? responded / sent : 0,
    placementRate: sent > 0 ? placed / sent : 0,
    byCompany,
  };
}

export function getPitchesNeedingFollowUp(daysThreshold = 5): Pitch[] {
  const pitches = getPitches();
  const now = new Date();
  const threshold = daysThreshold * 24 * 60 * 60 * 1000;

  return pitches.filter((p) => {
    if (p.status !== "sent" && p.status !== "followed_up") return false;
    if (!p.sent_date) return false;
    const sentDate = new Date(p.sent_date);
    return now.getTime() - sentDate.getTime() > threshold;
  });
}
