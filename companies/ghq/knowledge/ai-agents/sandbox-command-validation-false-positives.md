---
title: "Claude Code Sandbox Command Validation: Quote and Brace False Positives"
category: ai-agents
tags: ["sandboxing", "claude-code", "agent-tooling", "failure-modes", "cli"]
source: "https://github.com/anthropics/claude-code/issues/30345, https://github.com/anthropics/claude-code/issues/32212, https://github.com/anthropics/claude-code/issues/11006"
confidence: 0.8
created_at: 2026-03-24T19:00:00Z
updated_at: 2026-03-24T19:00:00Z
---

Claude Code's sandbox applies heuristic command validation that frequently false-positives on legitimate bash patterns involving quotes and braces.

## The Validation Rules

Claude Code's bash sandbox uses multi-layered validation before executing commands:

1. **Regex-based pattern matching** against allow/deny lists
2. **Quote tracking** — scans for quotes that could "desync" the parser's understanding of command boundaries
3. **Obfuscation detection** — flags patterns like consecutive quotes at word start (e.g., `""curl""`) that could hide dangerous commands
4. **LLM-assisted prefix extraction** via a fast model to identify the underlying command

### Specific Triggers

| Warning message | Trigger pattern | Example |
|---|---|---|
| "Contains brace with quote character (expansion obfuscation)" | Braces `{}` adjacent to quote chars `"'` in the same token | Heredocs containing JSON: `{"key": "value"}` |
| "Consecutive quote characters at word start (potential obfuscation)" | `''` or `""` at the start of a word/token | Heredoc delimiters: `<< 'EOF'` |
| "Quote characters inside a # comment which can desync quote tracking" | `"` or `'` inside bash comments | `# Check "make docker build-all"` |

## Why Heredocs with JSON Are Particularly Affected

JSON's syntax combines the exact characters the validator flags:
- Braces `{}` surrounding quoted strings `"key"` → triggers brace+quote detection
- Heredoc delimiter `<< 'EOF'` → triggers consecutive-quote detection
- The entire heredoc body is scanned as part of the command string

This makes `cat << 'EOF' > file.json` with JSON content a near-guaranteed false positive.

## Workarounds for Agents

### 1. Use the Write/Edit Tool (Recommended)

The built-in `Write` and `Edit` tools bypass bash sandbox validation entirely since they don't go through the shell. This is the primary recommended approach.

### 2. Python3 Pipe

```bash
python3 -c "
import json, sys
data = {'key': 'value'}
json.dump(data, sys.stdout, indent=2)
" > output.json
```

Avoids heredoc syntax entirely. The Python string doesn't trigger brace+quote heuristics the same way.

### 3. Base64 Encoding

```bash
echo 'eyJrZXkiOiAidmFsdWUifQ==' | base64 -d > output.json
```

Eliminates all problematic characters from the command itself.

### 4. Write to Temp File in Two Steps

```bash
echo '{}' > /tmp/config.json
python3 -c "import json; d=json.load(open('/tmp/config.json')); d['key']='value'; json.dump(d,open('/tmp/config.json','w'),indent=2)"
```

### 5. Single-Line Echo (Simple JSON Only)

```bash
echo '{"key":"value"}' > output.json
```

Works for simple payloads but the brace+quote combo may still trigger on some versions.

## Permission Matching Bug with Heredocs

Even when a base command is allowlisted (e.g., `Bash(python3:*)`), heredoc variants of the same command fail to match:
- `python3 -c "code"` → matches `Bash(python3:*)`
- `python3 << 'EOF' ... EOF` → does NOT match `Bash(python3:*)`

This is a known bug (issue #11006, closed as NOT_PLANNED). The permission system treats the entire heredoc as a single command string rather than matching against the base command prefix.

## Agent Template Recommendations

For GHQ agent templates that need to write JSON:
1. **Default to the Write tool** or `write-file.sh` wrapper
2. **If bash is required**, use the `python3 -c` pattern
3. **Never use heredocs for JSON** in agent templates — the sandbox interaction is unpredictable across versions
4. **Document the workaround** in agent CLAUDE.md files so the agent doesn't rediscover it each run

## Version History

- **v2.1.63**: Quote-in-comment warnings introduced
- **v2.1.71**: Regression — consecutive-quote detection added, increased false positives on heredocs
- Ongoing: No fix planned for heredoc permission matching (issue #11006)
