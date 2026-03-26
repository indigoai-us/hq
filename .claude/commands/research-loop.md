---
description: Loop through the curiosity queue, researching one item at a time via ask-claude subprocesses
allowed-tools: Bash, Read
---

# /research-loop — Automated Research Queue Drainer

Continuously process pending curiosity queue items by spawning a `/research` subprocess for each one. Each item runs in a fresh Claude context to avoid context bloat.

**Usage**: `/research-loop [max-items] [-c <company-slug>]`

- `$ARGUMENTS` optionally specifies the maximum number of items to process (default: all pending items).

## Company Context

All knowledge is scoped to a company. Determine the target company:

1. If `$ARGUMENTS` contains `-c <slug>`, use that slug.
2. Otherwise default to `hq`.

Set `COMPANY` to the resolved slug.

## Procedure

### 1. Read the Queue

Use the read-queue script to get pending items sorted by priority:

```bash
npx tsx companies/hq/tools/read-queue.ts -c {COMPANY} --status pending -n 1
```

This fetches the single highest-priority pending item. The loop processes one item per iteration, re-reading the queue each time (step d/e).

If `$ARGUMENTS` is a number, that's the max total items to process across all iterations. Otherwise process all pending items.

If the output is `"Queue empty"` or the JSON array is empty, report **"Queue empty — nothing to research"** and stop.

### 2. Loop Through Items

For each pending item, in priority order:

#### a. Fetch Remaining Count and Report Progress

Re-read the full queue to get the current total of pending items:

```bash
npx tsx companies/hq/tools/read-queue.ts -c {COMPANY} --json 2>/dev/null | python3 -c "import sys,json; items=json.load(sys.stdin); pending=[i for i in items if i.get('status')=='pending']; print(len(pending))"
```

Count the pending items in the result — this is `{remaining}`. Then print:

`[{processed_so_far + 1} / {remaining} remaining] Researching: {question} (id: {id}, priority: {priority})`

#### b. Spawn Research Subprocess

Run:

```bash
./companies/hq/tools/ask-claude.sh "/research {id} -c {COMPANY}"
```

This spawns a fresh Claude session that runs the `/research` command for that specific queue item.

#### c. Embed and Push

After the subprocess completes, run:

```bash
qmd embed
```

Then commit and push the new/updated knowledge files:

```bash
git add companies/{COMPANY}/knowledge/
git commit -m "research: {short question summary}"
git push
```

#### d. Check Result

Re-read the queue via `npx tsx companies/hq/tools/read-queue.ts -c {COMPANY} --status pending -n 1` to verify the item was processed (it should no longer appear in the pending list).

- If the item is still pending, log a warning: `Warning: item {id} still pending after research — skipping`
- If the item was completed or failed, log: `Done: {id} — {status}`

#### e. Continue or Stop

Continue to the next item. If all items are processed, proceed to step 3.

### 3. Final Report

After the loop completes, run `npx tsx companies/hq/tools/read-queue.ts -c {COMPANY} --json` one last time and count remaining pending items.

Print:
```
Research loop complete:
  Company: {COMPANY}
  Attempted: {total_attempted}
  Remaining pending: {remaining_count}
```

## Rules

- **One item per subprocess** — each `/research` call handles exactly one queue item in a fresh context.
- **Sequential execution** — process items one at a time, not in parallel, to avoid write conflicts on the queue file.
- **No direct research** — this command only orchestrates; all actual research happens in the subprocess.
- **Respect queue state** — always re-read the queue file before each iteration to pick up any status changes.
