#!/usr/bin/env npx tsx
/**
 * read-queue.ts
 * Reads and displays items from companies/{slug}/knowledge/.queue.jsonl
 *
 * Usage:
 *   npx tsx companies/ghq/tools/read-queue.ts [-c <company-slug>]
 *   npx tsx companies/ghq/tools/read-queue.ts -c ghq --status all
 *   npx tsx companies/ghq/tools/read-queue.ts --json
 *   npx tsx companies/ghq/tools/read-queue.ts --n 10
 */

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const repoRoot = execSync("git rev-parse --show-toplevel", { encoding: "utf-8" }).trim();

function getCompanySlug(argv: string[]): string {
  const idx = argv.indexOf("-c");
  return idx !== -1 && argv[idx + 1] ? argv[idx + 1] : "ghq";
}

const COMPANY = getCompanySlug(process.argv);
const QUEUE_PATH = path.join(repoRoot, "companies", COMPANY, "knowledge", ".queue.jsonl");

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
