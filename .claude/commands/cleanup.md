---
description: Validate structural integrity and optionally rebuild all INDEX.md files
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
argument-hint: [--reindex]
visibility: public
---

# /cleanup - GHQ Maintenance

Audit GHQ for structural issues and optionally rebuild all INDEX.md files.

**User's input:** $ARGUMENTS

## Modes

- **No args / --audit**: Report issues only (default, safe)
- **--reindex**: Rebuild ALL INDEX.md files from disk + run `qmd update`

---

## Audit Checks

Run all checks sequentially (do NOT parallelise — one bash failure kills sibling calls).

### 1. Skills Registration

**Policy**: Every skill directory in `.claude/skills/` must contain a `SKILL.md` file.

```bash
cd /path/to/ghq

# Find skill dirs missing SKILL.md (zsh-safe)
for dir in .claude/skills/*/; do
  skill=$(basename "$dir")
  [[ "$skill" == "_template" ]] && continue
  [[ -f "${dir}SKILL.md" ]] || echo "MISSING SKILL.md: $skill"
done
```

**Violations**:
- Skill directory without `SKILL.md` → flag MISSING

### 2. INDEX.md Currency

**Policy**: INDEX.md files must exist at all required locations (per `knowledge/ghq-core/index-md-spec.md`).

Required locations:
- `knowledge/INDEX.md`
- `knowledge/ghq-core/INDEX.md`
- `knowledge/skills/INDEX.md`
- `knowledge/ralph/INDEX.md`
- `.claude/skills/INDEX.md`
- All `companies/*/knowledge/INDEX.md` (for each company with a knowledge dir)

For each expected location:
1. Check if file exists → flag MISSING if not
2. Check if entry count in table matches actual directory contents → flag STALE if mismatch

```bash
# Example: count entries in knowledge/INDEX.md vs actual dirs
table_count=$(grep -c "^\|" knowledge/INDEX.md 2>/dev/null || echo 0)
actual_count=$(ls -d knowledge/*/ 2>/dev/null | grep -v "INDEX" | wc -l | tr -d ' ')
[[ "$table_count" != "$actual_count" ]] && echo "STALE: knowledge/INDEX.md ($table_count entries vs $actual_count actual)"
```

### 3. Broken References

**Policy**: No dangling references to non-existent files or skills.

```bash
# Check manifest.yaml paths exist (settings, knowledge)
grep -E "^\s+(settings|knowledge):" companies/manifest.yaml | while read -r line; do
  path=$(echo "$line" | sed 's/.*: *//')
  [[ "$path" == "null" ]] && continue
  [[ -d "$path" ]] || echo "BROKEN_REF: manifest.yaml → $path does not exist"
done
```

### 4. Manifest Consistency

**Policy**: Every company in `companies/manifest.yaml` must have non-null values for all required fields.

```bash
# Check for null values
grep -n "null" companies/manifest.yaml && echo "MANIFEST: null values found"

# Check companies/ dirs have a manifest entry
for dir in companies/*/; do
  company=$(basename "$dir")
  [[ "$company" == "_template" ]] && continue
  [[ "$company" == "manifest.yaml" ]] && continue
  grep -q "^${company}:" companies/manifest.yaml || echo "UNMANIFESTED: companies/$company has no manifest entry"
done
```

**Violations**:
- `knowledge: null` or `settings: null` → needs population
- Company directory without manifest entry → needs registration

### 5. Git Status

**Policy**: Clean working tree — no uncommitted changes.

```bash
git status --short
```

**Issues**:
- Untracked new files → should be committed or added to .gitignore
- Modified tracked files → should be committed

### 6. Stale Threads

**Policy**: Purge auto-checkpoints older than 14 days. Flag manual threads older than 30 days.

```bash
# Auto-checkpoints older than 14 days
find workspace/threads -name "T-*-auto-*.json" -mtime +14 2>/dev/null

# Stale manual threads (30 days)
find workspace/threads -name "*.json" -not -name "*-auto-*" -mtime +30 2>/dev/null
```

---

## Output Format

### Audit Report (no args)

```
GHQ Cleanup Audit
=================

✓ Skills registry: 8 skills indexed
✗ INDEX.md: 1 issue
  - knowledge/ghq-core/INDEX.md: 5 entries vs 6 actual (stale)
✓ Broken references: none
✓ Manifest: consistent
✓ Git: clean
✓ Threads: no stale files

Summary: 2 issues found
Run /cleanup --reindex to rebuild all INDEX.md files
```

If no issues found:
```
GHQ Cleanup Audit
=================

✓ Skills registry: 8 skills indexed
✓ INDEX.md: all current
✓ Broken references: none
✓ Manifest: consistent
✓ Git: clean
✓ Threads: no stale files

Summary: GHQ is healthy
```

---

## --reindex: Rebuild All INDEX.md Files

When `--reindex` is provided (or combined with audit findings):

### Step 1: Run audit first (always)

Surface issues before rebuilding so user can see what was stale.

### Step 2: Rebuild each INDEX.md location

For each required location (see Audit Check #2 list):

1. List all files and subdirectories in the directory
2. Skip: `INDEX.md` itself, `.DS_Store`, `node_modules/`, dotfiles (names starting with `.`)
3. Extract description per spec:
   - `.md` → first `#` heading (strip `# `)
   - `.yaml` → value of `description:` field
   - `.json` → value of `name` or `description` field
   - Directory → `{file count} files — {purpose}`
4. Sort: directories first, then files; alphabetical within each group
5. Write INDEX.md using the standard template:

```markdown
# {Directory Name} — Index

> Auto-generated. Updated: {YYYY-MM-DD}

| Name | Description |
|------|-------------|
| `subdir/` | Description |
| `file.md` | Description |
```

For company knowledge dirs (`companies/*/knowledge/INDEX.md`): rebuild each one that exists.

### Step 3: Run qmd update

```bash
qmd update 2>/dev/null || true
```

### Step 4: Report

```
INDEX.md Rebuild
================

Rebuilt 5 INDEX.md files:
  ✓ knowledge/INDEX.md (3 entries)
  ✓ knowledge/ghq-core/INDEX.md (6 entries)
  ✓ knowledge/skills/INDEX.md (2 entries)
  ✓ knowledge/ralph/INDEX.md (10 entries)
  ✓ .claude/skills/INDEX.md (8 entries)

qmd: reindexed
```

---

## Rules

- **--audit is safe**: Never modifies files, only reports
- **Always run audit before --reindex**: Surface what was stale before rebuilding
- **Full rewrite on --reindex**: INDEX.md is always overwritten in full — never patched incrementally
- **qmd update mandatory after --reindex**: Always run `qmd update 2>/dev/null || true` after rebuilding
- **zsh-safe scripts**: Use `[[ ]]` (not `[ ]`), suppress glob errors with `2>/dev/null`. Never glob patterns that may match zero files without error suppression
- **Sequential checks**: Run audit checks one at a time — do NOT fire multiple bash calls in parallel (one failure kills all siblings)
- **No destructive actions without confirmation**: Stale thread deletion requires user confirmation; --reindex is safe (write-only on INDEX.md files)
