# Spike: claude -p Slash Command Discovery

## Purpose

Validate whether `claude -p "/setup"` discovers and expands slash commands
from `.claude/commands/` when run in a copied temp directory.

## How to Run

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
bash tests/e2e/spike.sh
```

Results are written to `tests/e2e/spike-results.json`.

---

## Pass/Fail Criteria

### (a) Command Discovery

Did Claude recognize `/setup` as a slash command and expand `setup.md`?

- **Result**: _pending_
- **Evidence**:

### (b) Hook Execution

Did hooks fire? (Check stderr for hook output lines.)

- **Result**: _pending_
- **Evidence**:

### (c) Cost Measurement

Input/output tokens from the JSON output.

- **Input tokens**: _pending_
- **Output tokens**: _pending_
- **Model**: claude-haiku-4-5-20251001

### (d) Fallback Strategy

If slash command discovery fails, document how to pass `.md` content as the prompt instead.

- **Discovery failed?**: _pending_
- **Fallback approach**: If `/setup` is not recognized, read the file and inline its content:
  ```bash
  claude -p "$(cat .claude/commands/setup.md)" --model claude-haiku-4-5-20251001 ...
  ```

---

## Notes

_Fill in after running the spike._
