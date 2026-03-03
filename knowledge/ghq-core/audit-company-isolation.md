# Audit: Company Isolation

> Task: ghq-uik.1.1.3 | Date: 2026-03-03

## Summary

Company isolation boundaries in GHQ are **largely sound** with one notable issue: a hardcoded cross-company reference in the `video-gen` skill. All other isolation mechanisms are functioning correctly.

## Findings

### 1. manifest.yaml Accuracy -- PASS

- **Status**: Complete and valid
- `companies/manifest.yaml` lists one company: `launch-grid`
- The filesystem confirms exactly one symlink: `companies/launch-grid -> ~/Documents/GHQ/companies/launch-grid`
- All manifest fields are populated with proper types (no `null` values)
- Manifest includes: symlink, repos, settings, skills, knowledge, deploy, vercel_projects, epic, qmd_collections

### 2. Settings Directory Isolation -- PASS

- **Status**: Properly isolated
- `.claudeignore` contains: `companies/*/settings/**`
- `.gitignore` excludes all company symlinks: `companies/*` (with `!companies/manifest.yaml` exception)
- `companies/launch-grid/settings/` exists and is empty (no tracked files)
- The symlink structure means actual data lives at `~/Documents/GHQ/companies/launch-grid/settings/`, outside the repo entirely

### 3. Credential Leakage Scan -- PASS

- **Status**: No credentials found
- Scanned for: API keys, secrets, passwords, tokens, auth tokens, access keys, private keys
- Scanned for known key patterns: `sk-`, `ghp_`, `gho_`, `AKIA`, `xox[bps]-`, `Bearer` tokens
- Scanned for sensitive file extensions: `.env`, `.pem`, `.key`, `.p12`, `.jks`, `.credentials`
- **Result**: Zero matches in tracked files. No credentials outside settings directories.

### 4. Company Labels on Tasks -- PASS

- **Status**: All tasks correctly labeled
- All 11 beads tasks have both `company` and `launch-grid` labels
- No tasks are missing company attribution

### 5. Cross-Company References -- ISSUE FOUND

- **Severity**: Minor (stale reference, not active leakage)
- **Location**: `.claude/skills/video-gen/SKILL.md` line 90
- **Issue**: Hardcoded path `companies/ship-it-code/assets/brand/ship-it-code-watermark.png`
- **Problem**: `ship-it-code` is not registered in `companies/manifest.yaml`. This is a leftover reference from a previous company that either was removed or never registered.
- **Risk**: If this path existed, the skill would access another company's brand assets. Currently non-functional since `ship-it-code` does not exist.
- **Fix**: Replace with a parameterized path like `companies/{company}/assets/brand/{watermark}` or remove the hardcoded example.

### 6. Policy Duplication -- OBSERVATION

- The `company-isolation` policy exists in two locations with identical content:
  - `knowledge/policies/company-isolation.md`
  - `.claude/policies/company-isolation.md`
- Not a bug, but creates maintenance risk. Consider designating one as canonical.

## Checklist (Acceptance Criteria)

- [x] manifest.yaml accurately reflects all companies
- [x] Settings directories properly isolated
- [x] No credential leakage across companies
- [x] Company labels correctly applied to tasks/knowledge

## E2E Test Results

- [x] Verify companies/manifest.yaml is complete and valid -- 1 company registered, matches filesystem
- [x] Check that companies/*/settings/ is in .claudeignore -- confirmed: `companies/*/settings/**`
- [x] Scan for any hardcoded credentials outside settings/ -- zero found
- [x] Validate company labels on all beads tasks -- 11/11 tasks labeled

## Recommendations

1. **Fix video-gen cross-company reference** (minor): Remove or parameterize the `ship-it-code` path in `.claude/skills/video-gen/SKILL.md`
2. **Deduplicate isolation policy** (minor): Keep one canonical copy of `company-isolation.md`
3. **Add credential scanning to CI** (enhancement): Automated pre-commit hook to catch leaked secrets
