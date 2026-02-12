---
description: Launch decision-ui for human-in-the-loop batch decisions
allowed-tools: Write, Bash, Read, Glob
argument-hint: <queue-name>
visibility: public
---

# /decide - Human-in-the-Loop Decision Queue

Write a DecisionQueue to decision-ui, open the browser, and wait for responses.

**Queue name:** $ARGUMENTS

## Schema

```typescript
interface DecisionOption {
  id: string;
  label: string;
  description?: string;
  color?: string;
}

interface DecisionItem {
  id: string;
  title: string;
  subtitle?: string;
  description?: string;
  metadata?: Record<string, string | number>;
  options: DecisionOption[];
  allowCustom?: boolean;   // show text input
  allowMultiple?: boolean; // checkboxes + confirm
  group?: string;          // group in summary view
}

interface DecisionQueue {
  id: string;
  name: string;
  description?: string;
  items: DecisionItem[];
  createdAt: string;       // ISO 8601
}
```

## Process

1. **Build the queue** from the calling context
   - Generate a `DecisionQueue` object with the items to classify
   - Each item needs: `id`, `title`, `options` (array of `{id, label}`)
   - Set `queue.id` to a unique slug, `queue.createdAt` to now

2. **Write queue.json**
   ```bash
   mkdir -p ~/Documents/HQ/repos/private/decision-ui/data
   ```
   Write the queue JSON to `~/Documents/HQ/repos/private/decision-ui/data/queue.json`

3. **Launch decision-ui**
   Try ports 3033, 3000, 3002 in order:
   ```bash
   curl -s http://localhost:3033/api/status 2>/dev/null || curl -s http://localhost:3000/api/status 2>/dev/null || curl -s http://localhost:3002/api/status 2>/dev/null
   ```
   If none respond, start the server:
   ```bash
   cd ~/Documents/HQ/repos/private/decision-ui && npm run dev -- -p 3033 &
   ```
   Wait for "Ready" in output, note the port.

   **Tauri app (preferred):** If Tauri is built (`src-tauri/target/release/` exists):
   ```bash
   open ~/Documents/HQ/repos/private/decision-ui/src-tauri/target/release/bundle/macos/Decisions.app
   ```
   Tauri app spawns its own server on port 3033 — no need to start separately.

4. **Notify user**
   Tell the user:
   > Decisions ready at http://localhost:{port}
   > {N} items to review. Complete them and I'll continue.

5. **Poll for completion**
   Poll `GET /api/status` every 5 seconds:
   ```bash
   curl -s http://localhost:{port}/api/status
   ```
   Wait until `completedAt` is non-null. Timeout after 30 minutes — warn at 24 minutes.

6. **Read responses**
   Read `~/Documents/HQ/repos/private/decision-ui/data/responses.json`
   Parse the `DecisionResponseFile`:
   ```typescript
   interface DecisionResponse {
     itemId: string;
     selectedOptions: string[];  // option IDs
     customValue?: string;
     note?: string;
     respondedAt: string;
   }
   interface DecisionResponseFile {
     queueId: string;
     responses: DecisionResponse[];
     completedAt?: string;
   }
   ```

7. **Clean up**
   Delete `data/queue.json` (leave responses for audit trail)

8. **Return responses** to the calling context for further processing

## Rules

- NEVER auto-answer decisions — always wait for the human
- If timeout reached, notify user and ask whether to extend or cancel
- If queue.json already exists, ask user before overwriting
- Keep the dev server running after completion (user may want to review)

## Example Usage

When another command or worker needs batch human input:
```
/decide transaction-review
```
Then build the queue from context and follow the process above.
