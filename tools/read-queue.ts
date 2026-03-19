#!/usr/bin/env npx tsx
/**
 * read-queue.ts
 * Reads and displays items from knowledge/.queue.jsonl
 *
 * Usage:
 *   npx tsx tools/read-queue.ts              # pending items, table format
 *   npx tsx tools/read-queue.ts --status all  # all statuses
 *   npx tsx tools/read-queue.ts --json        # JSON output
 *   npx tsx tools/read-queue.ts --n 10       # limit to 10 items
 */

import fs from "node:fs";
import path from "node:path";

const QUEUE_PATH = path.resolve(
  import.meta.dirname ?? path.dirname(new URL(import.meta.url).pathname),
  "..",
  "knowledge",
  ".queue.jsonl",
);

interface QueueItem {
  id: string;
  question: string;
  context: string;
  source: string;
  priority: number;
  status: string;
  created_at: string;
  updated_at: string;
}

// ── Arg parsing ──────────────────────────────────────────────────────
function parseArgs(argv: string[]): { status: string; json: boolean; n: number } {
  let status = "pending";
  let json = false;
  let n = 0;
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--json") {
      json = true;
    } else if (arg === "--status" && i + 1 < argv.length) {
      status = argv[++i];
    }
    if ((arg === "--n" || arg === "-n") && i + 1 < argv.length) {
      n = parseInt(argv[++i]);
    }
  }
  return { status, json, n };
}

function truncate(str: string, len: number): string {
  return str.length > len ? str.slice(0, len - 1) + "\u2026" : str;
}

// ── Main ─────────────────────────────────────────────────────────────
const { status: filterStatus, json: jsonOutput, n: limit } = parseArgs(process.argv);

// Handle missing / empty file
if (!fs.existsSync(QUEUE_PATH)) {
  console.log("Queue empty");
  process.exit(0);
}

const raw = fs.readFileSync(QUEUE_PATH, "utf-8").trim();
if (!raw) {
  console.log("Queue empty");
  process.exit(0);
}

const items: QueueItem[] = raw
  .split("\n")
  .filter(Boolean)
  .map((line) => JSON.parse(line) as QueueItem);

let filtered =
  filterStatus === "all"
    ? items
    : items.filter((i) => i.status === filterStatus);

if (filtered.length === 0) {
  console.log("Queue empty");
  process.exit(0);
}

// Sort by priority DESC
filtered.sort((a, b) => b.priority - a.priority);

if (limit > 0) {
  filtered = filtered.slice(0, limit);
}

if (jsonOutput) {
  console.log(JSON.stringify(filtered, null, 2));
} else {
  // Table output
  const header = "ID                | Pri | Source               | Question";
  const sep = "-".repeat(header.length);
  console.log(header);
  console.log(sep);
  for (const item of filtered) {
    const id = item.id.padEnd(17);
    const pri = String(item.priority).padStart(3);
    const src = item.source.padEnd(20);
    const q = truncate(item.question, 60);
    console.log(`${id} | ${pri} | ${src} | ${q}`);
  }
}
