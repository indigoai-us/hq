---
description: Capture learnings when things don't work right
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, AskUserQuestion
argument-hint: [what went wrong]
visibility: public
---

# /remember - Capture Learnings

When something doesn't work right, capture the learning as a rule in the relevant file.

**User's input:** $ARGUMENTS

## Core Principle

Don't store learnings in a separate database. Inject rules directly into:
- **worker.yaml** `instructions:` block — worker-specific
- **`.claude/commands/*.md`** `## Rules` section — command-specific
- **`.claude/CLAUDE.md`** — global rules
- **skill files** — skill-specific

## Step 1: Gather Context

If $ARGUMENTS empty, ask: "What happened that you want to capture?"

Then ask: "What's the fix or rule to prevent this?"

## Step 2: Detect Injection Target

Analyze the learning and conversation context to determine target:

1. **Check for active worker/command/skill** in recent conversation
2. **Parse the learning** for keywords (worker names, command names, file types)
3. **Default:** If unclear, target `.claude/CLAUDE.md`

Present suggestion:
```
Target: {file path}
Section: {instructions: | ## Rules | relevant heading}

Proposed rule:
- {NEVER/ALWAYS/condition}: {rule}

Is this the right place? [Y/n/specify different target]
```

## Step 3: Check for Duplicates

Search for similar existing rules:
```bash
qmd vsearch "{rule description}" --json -n 5
```

If similar found:
```
Similar rule found in {file}:
  "{existing rule}"

Options:
1. Skip (already captured)
2. Merge (combine rules)
3. Add anyway (different enough)
```

## Step 4: Inject Rule

### For worker.yaml (YAML `instructions:` block)

Read the file, find `instructions: |` block, append rule at end:
```yaml
instructions: |
  ...existing instructions...

  ## Learnings
  - {new rule}
```

If no `## Learnings` section exists, create it.

### For command.md (Markdown)

Find or create `## Rules` section, append:
```markdown
## Rules

...existing rules...
- {new rule}
```

### For CLAUDE.md

Find the most relevant section (based on rule content), append rule.
If no clear section, add to end under `## Learnings`.

### For skill files

Append rule inline at end of file under `## Rules` or `## Learnings`.

## Step 5: Reindex

```bash
qmd update 2>/dev/null || true
```

## Step 6: Report

```
Rule added to: {file path}
Section: {section name}

Rule: {the rule}

Search with: /search "{keywords}"
```

## Rule Format

Match existing style in target file. Common patterns:
- `- NEVER: {anti-pattern}`
- `- ALWAYS: {pattern}`
- `- {condition} → {action}`
- `- **{keyword}**: {rule}`

## Examples

### Worker-specific
User: "The CFO worker kept trying to write to Stripe instead of just reading"
Target: `workers/private/{worker-id}/worker.yaml`
Rule: `- NEVER: Write or modify data in Stripe. All operations are read-only.`

### Command-specific
User: "/prd kept asking too many questions at once"
Target: `.claude/commands/prd.md`
Rule: `- Limit discovery batches to 3-4 questions maximum`

### Global
User: "Claude kept creating new files instead of editing existing ones"
Target: `.claude/CLAUDE.md`
Rule: `- ALWAYS: Edit existing files. Never create new files unless explicitly required.`

## Ralph Integration

Workers can invoke `/remember` after back-pressure failures:
- Test failure → capture what broke
- Lint error → capture style rule
- Build failure → capture constraint

Automatically capture learnings when:
1. A task fails verification
2. User corrects behavior
3. Workaround discovered
