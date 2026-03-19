---
title: "Claude Code Permission System"
category: claude-code
tags: ["permissions", "security", "allowlist", "denylist", "sandbox"]
source: "web research"
confidence: 0.95
created_at: 2026-03-19T01:00:00Z
updated_at: 2026-03-19T02:15:00Z
---

Claude Code uses a tiered permission system balancing autonomy and safety.

## Permission Modes

Set via `defaultMode` in settings files:

| Mode                | Description                                                     |
|---------------------|-----------------------------------------------------------------|
| `default`           | Prompts for permission on first use of each tool                |
| `acceptEdits`       | Auto-accepts file edits; shell commands still prompt            |
| `plan`              | Read-only — no file modifications or command execution          |
| `dontAsk`           | Auto-denies unless pre-approved via rules                       |
| `bypassPermissions` | Skips prompts (except `.git`, `.claude`, `.vscode`, `.idea`)    |

`bypassPermissions` requires isolated environments. Admins can disable it via `disableBypassPermissionsMode: "disable"` in managed settings.

## Tool Approval Tiers

| Tool type         | Example          | Approval required | "Don't ask again" scope          |
|-------------------|------------------|-------------------|----------------------------------|
| Read-only         | Read, Grep, Glob | No                | N/A                              |
| Bash commands     | Shell execution  | Yes               | Permanent per project + command  |
| File modification | Edit, Write      | Yes               | Until session end                |

## Permission Rules

Managed via `/permissions` command or settings files. Three rule types:

- **Allow**: Tool proceeds without approval
- **Ask**: Prompts for confirmation
- **Deny**: Blocks the tool entirely

**Evaluation order: deny → ask → allow** (first match wins, deny always takes precedence).

### Rule Syntax

```
Tool                         # Match all uses
Tool(specifier)              # Match specific uses
```

### Bash Rules

Support glob `*` wildcards at any position:

```json
{
  "permissions": {
    "allow": ["Bash(npm run *)", "Bash(git commit *)"],
    "deny": ["Bash(git push *)"]
  }
}
```

Space before `*` enforces word boundary: `Bash(ls *)` matches `ls -la` but not `lsof`.

Shell operators (`&&`) are handled — prefix rules won't allow chained commands.

### Read/Edit Rules

Follow gitignore specification:

| Pattern     | Meaning                      | Example                        |
|-------------|------------------------------|--------------------------------|
| `//path`    | Absolute from filesystem root | `Read(//Users/alice/secrets/**)` |
| `~/path`    | From home directory          | `Read(~/Documents/*.pdf)`       |
| `/path`     | Relative to project root     | `Edit(/src/**/*.ts)`            |
| `path`      | Relative to current directory | `Read(*.env)`                   |

`*` matches single directory, `**` matches recursively.

### Other Tool Rules

- **WebFetch**: `WebFetch(domain:example.com)`
- **MCP**: `mcp__server__tool_name`
- **Agent**: `Agent(Explore)`, `Agent(my-custom-agent)`
- **Skill**: `Skill(commit)`, `Skill(name *)`

## Settings Precedence

1. **Managed settings** (cannot be overridden, including by CLI args)
2. **CLI arguments** (`--allowedTools`, `--disallowedTools`)
3. **Local project** (`.claude/settings.local.json`)
4. **Shared project** (`.claude/settings.json`)
5. **User settings** (`~/.claude/settings.json`)

If denied at any level, no other level can allow it.

## Subagent Inheritance

Subagents inherit the parent session's permission mode. If the main session is in `bypassPermissions`, every subagent spawned from it is also in bypass mode — you cannot restrict a subagent to be more cautious than its parent.

## CLI Permission Flags

```bash
claude --allowedTools "Bash(npm run *)" "Read" "Edit"   # Allow specific tools
claude --disallowedTools "Bash(curl *)" "Bash(wget *)"  # Deny specific tools
claude --dangerously-skip-permissions                    # Bypass all prompts
```

In bypass mode, `allowedTools` does not constrain — every tool is approved. However, deny rules, explicit ask rules, and hooks are still evaluated before the mode check and can block tools.

## Permissions + Sandboxing

Complementary layers:
- **Permissions**: Control which tools Claude can use (all tools)
- **Sandboxing**: OS-level enforcement on Bash filesystem/network access

Read/Edit deny rules only block Claude's built-in tools, not Bash subprocesses. Use sandboxing for OS-level enforcement.

## Sources

- [Configure permissions — Claude Code Docs](https://code.claude.com/docs/en/permissions)
- [Claude Code Security Best Practices — Backslash](https://www.backslash.security/blog/claude-code-security-best-practices)
- [Claude Code --dangerously-skip-permissions: Safe Usage Guide](https://www.ksred.com/claude-code-dangerously-skip-permissions-when-to-use-it-and-when-you-absolutely-shouldnt/)
