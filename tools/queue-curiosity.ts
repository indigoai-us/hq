#!/usr/bin/env npx tsx
/**
 * queue-curiosity.ts
 * Appends a curiosity item to knowledge/.queue.jsonl
 *
 * Usage:
 *   npx tsx tools/queue-curiosity.ts \
 *     --question "How does X work?" \
 *     --context "Encountered during Y task" \
 *     --source knowledge_gap \
 *     --priority 5
 */

import fs from "node:fs";
import path from "node:path";

const VALID_SOURCES = [
  "user_interaction",
  "outcome_gap",
  "knowledge_gap",
  "conversation_insight",
  "research_followup",
  "trend_detection",
] as const;
type Source = (typeof VALID_SOURCES)[number];

const QUEUE_PATH = path.resolve(
  import.meta.dirname ?? path.dirname(new URL(import.meta.url).pathname),
  "..",
  "knowledge",
  ".queue.jsonl",
);

// ── Arg parsing ──────────────────────────────────────────────────────
function parseArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--") && i + 1 < argv.length) {
      const key = arg.slice(2);
      args[key] = argv[++i];
    }
  }
  return args;
}

function fail(msg: string): never {
  process.stderr.write(`Error: ${msg}\n`);
  process.exit(1);
}

// ── Main ─────────────────────────────────────────────────────────────
const args = parseArgs(process.argv);

const question = args.question;
if (!question) fail("--question is required");

const context = args.context ?? "";

const source = (args.source ?? "knowledge_gap") as Source;
if (!VALID_SOURCES.includes(source)) {
  fail(
    `Invalid source "${source}". Must be one of: ${VALID_SOURCES.join(", ")}`,
  );
}

const priorityRaw = args.priority ?? "5";
const priority = Number(priorityRaw);
if (!Number.isInteger(priority) || priority < 1 || priority > 10) {
  fail(`Invalid priority "${priorityRaw}". Must be an integer 1-10.`);
}

const now = new Date().toISOString();
const item = {
  id: `c-${Date.now()}`,
  question,
  context,
  source,
  priority,
  status: "pending",
  created_at: now,
  updated_at: now,
};

// Ensure parent dir exists
fs.mkdirSync(path.dirname(QUEUE_PATH), { recursive: true });

// Atomic append on POSIX
fs.appendFileSync(QUEUE_PATH, JSON.stringify(item) + "\n");

process.stdout.write(item.id + "\n");
