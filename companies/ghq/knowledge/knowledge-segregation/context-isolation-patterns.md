---
title: "Context Isolation Patterns for Multi-Company AI Assistants"
category: knowledge-segregation
tags: ["knowledge-management", "security", "context-management", "personal-knowledge", "runtime-isolation", "claude-code", "hooks"]
source: blueprint,https://code.claude.com/docs/en/memory,https://code.claude.com/docs/en/hooks,https://research.checkpoint.com/2026/rce-and-api-token-exfiltration-through-claude-code-project-files-cve-2025-59536/,https://joseparreogarcia.substack.com/p/claude-code-memory-explained,https://claudefa.st/blog/guide/mechanics/auto-memory
confidence: 0.85
created_at: 2026-03-20T00:00:00Z
updated_at: 2026-03-20T06:00:00Z
---

When an AI assistant (like Claude Code) works across multiple companies, context isolation prevents knowledge from one company leaking into sessions for another. This is distinct from traditional multi-tenancy — the "tenant" is the same user, but the *context boundaries* must be enforced per-company.

## Key Isolation Vectors

1. **Conversation context**: The most immediate risk. If company A's codebase details remain in conversation history while working on company B, the assistant may inadvertently reference or suggest patterns from A.

2. **Persistent memory**: Systems like Claude Code's auto-memory (`~/.claude/projects/`) store learned preferences and project facts. Without scoping, memories from company A's project could surface when working on company B.

3. **Knowledge base contamination**: A shared knowledge base (like GHQ's `knowledge/` directory) may contain company-specific insights mixed with general knowledge. Search results could surface proprietary information from the wrong context.

4. **Tool state**: MCP servers, git configs, environment variables, and shell history can carry company-specific state between sessions.

## Claude Code's Actual Scoping Mechanics

### CLAUDE.md Hierarchy

Claude Code loads instructions in this precedence order (specific overrides broad):

| Level | Path | Scope | Leaks? |
|-------|------|-------|--------|
| Global | `~/.claude/CLAUDE.md` | All projects, all sessions | **Yes — always loads** |
| Project | `{project-root}/CLAUDE.md` | All sessions in this repo | No (CWD-gated) |
| Local | `{project-root}/CLAUDE.local.md` | Machine-local, auto-gitignored | No |
| Path-scoped | `.claude/rules/*.md` | Only when matching files are opened | No |

**Key leak**: The global `~/.claude/CLAUDE.md` injects into every session regardless of project. Any sensitive company context placed there bleeds universally.

### Auto-Memory Isolation Guarantee

Auto-memory is scoped per git repository root:

```
~/.claude/projects/<hash-of-project-root>/memory/
```

- All CWDs inside the same git repo share one memory directory
- Different repos get different memory directories
- Outside a git repo: uses the CWD path as the key
- `MEMORY.md` index loads automatically at session start (content after line 200 is truncated)

**Guarantee**: Auto-memory is strictly path-isolated by git root. There is no cross-contamination mechanism in the storage layer.

**Soft boundary**: Memory content is text injected into the prompt. Once in context, the LLM can combine it with in-session knowledge from other sources. There is no enforcement that prevents the model from reasoning across boundaries if both are present in the same session.

### What Actually Leaks

| Leak Vector | Severity | Mechanism |
|-------------|----------|-----------|
| Global CLAUDE.md | High | Always injected regardless of project |
| In-session carry-over | Medium | Starting a new project without starting a new session |
| API Workspace project files | Medium | Shared across API keys in same workspace |
| `.claude/settings.json` in repo | High | Attacker-controlled; executed as hooks |
| Shell environment variables | Medium | Shell state persists between Claude invocations |

## Extending with Hooks for Enforcement

Hooks provide the **strongest available enforcement** below OS-level isolation. They run as shell scripts at tool lifecycle events.

### PreToolUse for Hard Segregation

```json
{
  "hooks": {
    "PreToolUse": [{
      "matcher": "Read|Write|Edit|Bash",
      "hooks": [{"type": "command", "command": "/path/to/segregation-gate.sh"}]
    }]
  }
}
```

A gate script can:
- **Block file reads** outside `companies/{current-company}/` (exit code 2)
- **Redact tool output** from PostToolUse before it reaches Claude
- **Log all cross-boundary attempts** for audit

### Enforcement Levels Achievable with Hooks

| Level | What Hooks Can Enforce | Cannot Enforce |
|-------|----------------------|----------------|
| File system | Whitelist/blacklist paths | In-context reasoning about blocked paths |
| Tool calls | Block specific tool invocations | Model recalling memorized facts |
| Output sanitization | Redact patterns in PostToolUse | Information already in context |
| Audit | Log all tool calls with project tag | Silent model-internal reasoning |

**Critical limitation**: Hooks enforce at the tool boundary only. They cannot prevent the LLM from using information already present in context (from global CLAUDE.md, or from earlier in the same session).

### Hook Configuration Security

- **Repo-level hooks** (`.claude/settings.json` inside the repo): Attacker-controllable. Never put isolation-enforcement hooks here — CVE-2025-59536 and CVE-2026-21852 demonstrated that malicious repos can weaponize these (RCE and API key exfiltration).
- **User-level hooks** (`~/.claude/settings.json`): Safe for enforcement. Not repo-controlled. Place all segregation gates here.

## CLAUDE.md Rules for Soft Segregation

CLAUDE.md rules are behavioral guidance, not hard enforcement. They work by instructing the model:

```markdown
# Company Context Rules
- Only access files under companies/{current-company}/
- Never discuss information from other companies' directories
- If asked about another company's data, refuse and explain why
```

**Effectiveness**: High for well-intentioned use. Zero for adversarial or accidental prompt injection. A malicious CLAUDE.md in a repo can override behavioral constraints.

## Isolation Strategies Ranked by Strength

| Strategy | Isolation Strength | Complexity | Overhead |
|----------|--------------------|------------|----------|
| Separate OS user accounts | Hard | High | Very high |
| Separate git worktrees + user-level hooks | Strong | Medium | Medium |
| Separate sessions + per-project CLAUDE.md | Moderate | Low | Low |
| CLAUDE.md behavioral rules only | Soft | Very low | Minimal |
| Single session, no controls | None | None | None |

The right approach combines directory-level scoping (GHQ's `companies/{slug}/` structure), user-level enforcement hooks, fresh sessions per company, and separate qmd collections — each layer compensating for the others' gaps.

## Security Vulnerabilities to Know

- **CVE-2025-59536**: RCE via malicious CLAUDE.md in untrusted repo — hooks execute arbitrary commands
- **CVE-2026-21852**: API key exfiltration via project files in shared API Workspaces
- **Mitigation**: Anthropic added a trust dialog before executing hooks from untrusted projects (2026)
