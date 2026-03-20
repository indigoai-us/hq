---
title: "hq-starter-kit Policies vs GHQ Inline Learned Rules"
category: hq-architecture-patterns
tags: ["claude-code", "production-patterns", "agent-autonomy", "context-management", "configuration"]
source: "https://github.com/coreyepstein/hq-starter-kit, https://code.claude.com/docs/en/settings, https://github.com/anthropics/claude-code/issues/29795"
confidence: 0.75
created_at: 2026-03-20T07:00:00Z
updated_at: 2026-03-20T07:00:00Z
---

Two complementary approaches to governing agent behavior: hq-starter-kit uses structured policy files; GHQ uses inline learned rules in CLAUDE.md.

## hq-starter-kit Policies

Policies live in `companies/{company}/policies/` as individual markdown files with structured YAML frontmatter:

```yaml
---
id: {company}-example-policy
title: Example Policy Title
scope: company          # company | repo | command | global
trigger: before any task execution
enforcement: soft       # soft (advisory) | hard (blocking)
version: 1
created: 2026-01-01
updated: 2026-01-01
---

## Rule
State the rule in imperative form. One rule per policy is ideal.

## Rationale
Why this policy exists. Agents understand intent, not just the letter.

## Examples
**Correct:** ...
**Incorrect:** ...
```

### Scope Hierarchy (highest to lowest precedence)

| Scope | Applies To |
|-------|-----------|
| `company` | All repos and commands in this company |
| `repo` | Specific repository only |
| `command` | Triggered by a specific slash command |
| `global` | Personal/cross-company baseline |

Higher scopes cannot be overridden by lower scopes — identical to how Claude Code's `settings.json` hierarchy works for permissions.

### Enforcement Levels

- **soft**: Advisory — agent is expected to follow but can reason past it
- **hard**: Blocking — treated as a hard constraint (analogous to a hook `exit 2`)

## GHQ Inline Learned Rules

GHQ stores rules directly in `CLAUDE.md` under a `## Learned Rules` section:

```markdown
## Learned Rules

<!-- Max 10 rules. When full, evict the least-referenced rule. -->

- **ALWAYS**: Push to remote after committing <!-- user-correction | 2026-02-28 -->
- **NEVER**: Use absolute paths to repos <!-- user-correction | 2026-03-17 -->
```

Characteristics:
- Flat list — no scope, trigger, or enforcement level
- Max 10 rules with LRU eviction (space-constrained)
- Inline provenance comment (`user-correction | date`)
- Rules are always-on — no conditional trigger
- No rationale section — intent must fit in one line

## Practical Tradeoffs

| Dimension | hq-starter-kit Policies | GHQ Learned Rules |
|-----------|------------------------|-------------------|
| **Structure** | Separate file per rule | All rules in one CLAUDE.md section |
| **Scope control** | company/repo/command/global | Flat — all apply everywhere |
| **Enforcement gradient** | soft vs hard | Uniform (LLM discretion) |
| **Rationale** | Dedicated `## Rationale` section | Must fit in one line or omit |
| **Capacity** | Unlimited files | 10-rule cap with LRU eviction |
| **Versioning** | Per-policy version + dates | Implicit via git blame |
| **Trigger conditions** | Explicit `trigger:` field | Always active |
| **Overhead** | File-per-rule management | Zero — update CLAUDE.md directly |

## When Each Approach Wins

**Use structured policies when:**
- The rule needs a rationale agents can reason from (not just comply with)
- Different scopes need different behavior (e.g., a rule that applies company-wide but can be narrowed per repo)
- Hard vs soft enforcement matters (block vs advise)
- The policy set is large enough that a 10-rule cap would be limiting

**Use GHQ inline learned rules when:**
- Rules are short and self-evident (no rationale needed)
- Fast iteration — adding a rule should take seconds, not a file creation
- Context budget is tight — a CLAUDE.md section costs less than loading N policy files
- Rules are genuinely universal (no scope variation needed)

## Hybrid Strategy

GHQ's current approach (inline rules) favors speed and low overhead. The practical gap: rules without rationale get followed mechanically rather than understood. A hybrid could reserve policies for rules that have *failed* at least once — i.e., when an agent violated a rule because it didn't understand the intent, that rule graduates from an inline one-liner to a full policy file with a rationale section.
