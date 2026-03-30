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

## Cost Benchmarks

Baseline token usage per operation, measured with `claude-haiku-4-5-20251001`.
Fill in actual values after running `spike.sh`.

| Operation              | Input Tokens | Output Tokens | Total Tokens | Est. USD  |
|------------------------|-------------|---------------|-------------|-----------|
| `/setup` (discovery)   | _pending_   | _pending_     | _pending_   | _pending_ |
| Simple prompt          | _pending_   | _pending_     | _pending_   | _pending_ |
| Command w/ tool use    | _pending_   | _pending_     | _pending_   | _pending_ |

### Budget Rationale

The default `E2E_TOKEN_BUDGET` is set to **100,000 tokens**. This is a conservative
starting point based on the assumption that a typical e2e suite of 5-10 tests, each
using Haiku with `maxTurns=3`, will consume roughly 5,000-15,000 tokens per test
(~50k-150k total). The 100k default provides headroom for a small suite while
preventing runaway costs from misconfigured tests. Adjust via the `E2E_TOKEN_BUDGET`
environment variable once actual spike data is available.

### Pricing Reference (Haiku 4.5)

- Input:  $1.00 / 1M tokens
- Output: $5.00 / 1M tokens
- At 100k total tokens (80/20 input/output split): ~$0.18 per suite run

---

## Notes

_Fill in after running the spike._
