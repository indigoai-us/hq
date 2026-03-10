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
- All `companies/*/projects/*/knowledge/INDEX.md` (for each project with a knowledge dir)

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

### 7. Symlink Health

**Policy**: All symlinks in `companies/` must resolve to existing targets.

```bash
# Find dangling symlinks in companies/ (follow -L to detect broken)
for link in companies/*/; do
  [[ -L "${link%/}" ]] || continue
  [[ -e "${link%/}" ]] || echo "DANGLING_SYMLINK: ${link%/} → $(readlink "${link%/}")"
done
```

**Violations**:
- Dangling symlink → target does not exist, needs fixing

### 8. Duplicate Files

**Policy**: No identical content across knowledge directories.

```bash
# MD5 hash all .md files in knowledge dirs, flag duplicates (macOS-compatible)
find knowledge/ -L companies/*/knowledge/ companies/*/projects/*/knowledge/ -name "*.md" -not -name "INDEX.md" -exec md5 -r {} \; 2>/dev/null | sort | awk '{h=$1; if(seen[h]) print "DUPLICATE: " seen[h] " = " $2; else seen[h]=$2}'
```

If duplicates found, show the duplicate pairs (hash + paths).

**Violations**:
- Files with identical content → should be consolidated or symlinked

### 9. Large Files

**Policy**: No files over 500KB in tracked git content.

```bash
# Find large files, excluding .git, .dolt, .beads, node_modules
find . -not -path './.git/*' -not -path './.dolt/*' -not -path '*/.beads/*' -not -path './node_modules/*' -type f -size +500k 2>/dev/null
```

**Violations**:
- File over 500KB → should be moved to LFS, compressed, or gitignored

### 10. TODO/FIXME Scan

**Policy**: Surface inline TODOs across the repo (informational, not a failure).

```bash
# Scan for TODO/FIXME markers in tracked file types (exclude self and plans)
grep -rn "TODO\|FIXME\|HACK\|XXX" --include="*.md" --include="*.yaml" --include="*.yml" . 2>/dev/null | grep -v node_modules | grep -v '.git/' | grep -v '.claude/commands/' | grep -v '.claude/plans/' | head -20
```

Report count. This check is **informational** — it never fails the audit.

### 11. Skill SKILL.md Validity

**Policy**: Each SKILL.md must have valid YAML frontmatter with `name` and `description` fields, plus a non-empty markdown body (per `knowledge/ghq-core/skill-schema.md`).

```bash
for dir in .claude/skills/*/; do
  skill=$(basename "$dir")
  [[ "$skill" == "_template" ]] && continue
  file="${dir}SKILL.md"
  [[ -f "$file" ]] || continue

  # Check directory name is lowercase with hyphens
  echo "$skill" | grep -qE '^[a-z0-9-]+$' || echo "INVALID_NAME: $skill (must be lowercase with hyphens)"

  # Check frontmatter has name and description
  grep -q "^name:" "$file" || echo "MISSING_FIELD: $skill/SKILL.md lacks 'name' in frontmatter"
  grep -q "^description:" "$file" || echo "MISSING_FIELD: $skill/SKILL.md lacks 'description' in frontmatter"

  # Check body is non-empty (content after closing ---)
  body=$(awk '/^---$/{n++; next} n>=2' "$file" | tr -d '[:space:]')
  [[ -z "$body" ]] && echo "EMPTY_BODY: $skill/SKILL.md has no instructions"
done
```

**Violations**:
- Missing `name` or `description` in frontmatter → must be added
- Empty body → skill has no instructions
- Invalid directory name → must be lowercase with hyphens only

### 12. qmd Index Freshness

**Policy**: qmd search index should not be stale relative to indexed content.

```bash
# Check qmd index freshness against content files
qmd_db="$HOME/.cache/qmd/index.sqlite"
if [[ -f "$qmd_db" ]]; then
  # Check if any .md files are newer than the index
  stale_count=$(find . -name "*.md" -not -path './.git/*' -newer "$qmd_db" 2>/dev/null | wc -l | tr -d ' ')
  [[ "$stale_count" -gt 0 ]] && echo "STALE: qmd index is behind $stale_count file(s). Run: qmd update"
else
  echo "MISSING: no qmd database found at $qmd_db"
fi
```

**Violations**:
- Index older than content → run `qmd update`
- No database file → qmd not initialized

### 13. CLAUDE.md Learned Rules Count

**Policy**: Learned rules sections have a 10-rule max. Warn when approaching capacity (8+).

```bash
# Project-level rules
project_count=$(grep -c "^- \*\*ALWAYS\*\*" .claude/CLAUDE.md 2>/dev/null || echo 0)
echo "PROJECT_RULES: $project_count/10"
[[ "$project_count" -ge 8 ]] && echo "WARNING: project CLAUDE.md approaching rule cap ($project_count/10)"

# Global rules
global_count=$(grep -c "^- \*\*ALWAYS\*\*" ~/.claude/CLAUDE.md 2>/dev/null || echo 0)
echo "GLOBAL_RULES: $global_count/10"
[[ "$global_count" -ge 8 ]] && echo "WARNING: global CLAUDE.md approaching rule cap ($global_count/10)"
```

**Violations**:
- 8+ rules → approaching cap, consider evicting stale rules
- 10 rules → at cap, must evict before adding new rules

### 14. Ignored but Tracked

**Policy**: No files matching `.gitignore` patterns should be tracked by git.

```bash
git ls-files -i --exclude-standard 2>/dev/null
```

**Violations**:
- File is both tracked and ignored → should be untracked (`git rm --cached`) or removed from `.gitignore`

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
✓ Symlinks: all resolve
✓ Duplicates: none
✓ Large files: none (>500KB)
✓ TODOs: 3 found (informational)
✓ Skill validity: 8 valid
✗ qmd index: stale (2 files newer)
✓ Learned rules: 1/10 (project), 2/10 (global)
✓ Ignored-but-tracked: none

Summary: 3 issues found
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
✓ Symlinks: all resolve
✓ Duplicates: none
✓ Large files: none (>500KB)
✓ TODOs: 0 found (informational)
✓ Skill validity: 8 valid
✓ qmd index: fresh
✓ Learned rules: 1/10 (project), 2/10 (global)
✓ Ignored-but-tracked: none

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

For company knowledge dirs (`companies/*/knowledge/INDEX.md`) and project knowledge dirs (`companies/*/projects/*/knowledge/INDEX.md`): rebuild each one that exists.

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
