import { readFileSync, writeFileSync, appendFileSync } from "node:fs";
import type { Journalist, Outlet } from "./types.js";

const JOURNALISTS_PATH = "knowledge/public/pr/media-lists/journalists.jsonl";
const OUTLETS_PATH = "knowledge/public/pr/media-lists/outlets.jsonl";

export function parseJSONL<T>(filePath: string): T[] {
  try {
    const content = readFileSync(filePath, "utf-8").trim();
    if (!content) return [];
    return content.split("\n").map((line) => JSON.parse(line) as T);
  } catch {
    return [];
  }
}

export function appendJSONL<T>(filePath: string, entry: T): void {
  appendFileSync(filePath, JSON.stringify(entry) + "\n");
}

export function writeJSONL<T>(filePath: string, entries: T[]): void {
  const content = entries.map((e) => JSON.stringify(e)).join("\n") + (entries.length ? "\n" : "");
  writeFileSync(filePath, content);
}

export function getJournalists(): Journalist[] {
  return parseJSONL<Journalist>(JOURNALISTS_PATH);
}

export function addJournalist(journalist: Journalist): void {
  appendJSONL(JOURNALISTS_PATH, journalist);
}

export function queryJournalists(filter: Partial<Journalist>): Journalist[] {
  const all = getJournalists();
  return all.filter((j) => {
    for (const [key, value] of Object.entries(filter)) {
      const jVal = j[key as keyof Journalist];
      if (Array.isArray(value)) {
        if (!Array.isArray(jVal) || !value.some((v) => (jVal as string[]).includes(v))) return false;
      } else if (jVal !== value) {
        return false;
      }
    }
    return true;
  });
}

export function getOutlets(): Outlet[] {
  return parseJSONL<Outlet>(OUTLETS_PATH);
}

export function addOutlet(outlet: Outlet): void {
  appendJSONL(OUTLETS_PATH, outlet);
}

export function queryOutlets(filter: Partial<Outlet>): Outlet[] {
  const all = getOutlets();
  return all.filter((o) => {
    for (const [key, value] of Object.entries(filter)) {
      const oVal = o[key as keyof Outlet];
      if (Array.isArray(value)) {
        if (!Array.isArray(oVal) || !value.some((v) => (oVal as string[]).includes(v))) return false;
      } else if (oVal !== value) {
        return false;
      }
    }
    return true;
  });
}

export function getMediaListStats(): {
  total: number;
  byTier: Record<number, number>;
  byBeat: Record<string, number>;
  stale: number;
} {
  const journalists = getJournalists();
  const now = new Date();
  const staleThreshold = 90 * 24 * 60 * 60 * 1000; // 90 days

  const byTier: Record<number, number> = { 1: 0, 2: 0, 3: 0 };
  const byBeat: Record<string, number> = {};
  let stale = 0;

  for (const j of journalists) {
    byTier[j.tier] = (byTier[j.tier] || 0) + 1;
    byBeat[j.beat] = (byBeat[j.beat] || 0) + 1;
    if (j.last_contact) {
      const lastContact = new Date(j.last_contact);
      if (now.getTime() - lastContact.getTime() > staleThreshold) stale++;
    } else {
      stale++;
    }
  }

  return { total: journalists.length, byTier, byBeat, stale };
}
