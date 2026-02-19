import { parseJSONL, appendJSONL } from "./media-db.js";
import type { CoverageEntry, Sentiment, Company } from "./types.js";

const PLACEMENTS_PATH = "knowledge/public/pr/coverage/placements.jsonl";

export function getPlacements(): CoverageEntry[] {
  return parseJSONL<CoverageEntry>(PLACEMENTS_PATH);
}

export function logPlacement(entry: Omit<CoverageEntry, "id">): CoverageEntry {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const existing = getPlacements();
  const todayCount = existing.filter((e) => e.id.startsWith(`COV-${date}`)).length;
  const id = `COV-${date}-${String(todayCount + 1).padStart(3, "0")}`;
  const fullEntry: CoverageEntry = { id, ...entry };
  appendJSONL(PLACEMENTS_PATH, fullEntry);
  return fullEntry;
}

export function getCoverageStats(period?: { start: string; end: string }): {
  total: number;
  byTier: Record<number, number>;
  bySentiment: Record<Sentiment, number>;
  byType: Record<string, number>;
  totalReach: number;
} {
  let placements = getPlacements();

  if (period) {
    placements = placements.filter((p) => p.date >= period.start && p.date <= period.end);
  }

  const byTier: Record<number, number> = { 1: 0, 2: 0, 3: 0 };
  const bySentiment: Record<string, number> = { positive: 0, neutral: 0, negative: 0 };
  const byType: Record<string, number> = {};
  let totalReach = 0;

  for (const p of placements) {
    byTier[p.outlet_tier] = (byTier[p.outlet_tier] || 0) + 1;
    bySentiment[p.sentiment] = (bySentiment[p.sentiment] || 0) + 1;
    byType[p.type] = (byType[p.type] || 0) + 1;
    totalReach += p.reach_estimate;
  }

  return {
    total: placements.length,
    byTier,
    bySentiment: bySentiment as Record<Sentiment, number>,
    byType,
    totalReach,
  };
}

export function getCoverageByCompany(period?: { start: string; end: string }): Record<Company, number> {
  let placements = getPlacements();

  if (period) {
    placements = placements.filter((p) => p.date >= period.start && p.date <= period.end);
  }

  const result: Record<string, number> = {};
  for (const p of placements) {
    result[p.company] = (result[p.company] || 0) + 1;
  }
  return result as Record<Company, number>;
}

export function getPlacementRate(period?: { start: string; end: string }): number {
  const { getPitchStats } = require("./pitch-tracker.js");
  const stats = getPitchStats(period);
  return stats.placementRate;
}
