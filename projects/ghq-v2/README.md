# ghq-v2

**Goal:** Create ghq_v2 from scratch: beads-centric task tracking, native SKILL.md skills, company symlinks to ~/Documents/GHQ/, loops/ runtime state
**Success:** All 20 skills translated and present as SKILL.md, beads initialized, hooks working, knowledge migrated, no v1 artifacts remaining
**Repo:** ~/repos/ghq_v2
**Worktree:** No (work on main)

## Overview

Clean-break redesign of GHQ with beads-centric task tracking, native SKILL.md skills, company symlinks, and loops/ runtime state.

## Skills

architect, full-stack

## Quality Gates

- Structure validation: file counts, no v1 artifacts, hooks executable, bd ready works

## User Stories

### US-001: Scaffold directory structure and initialize git repo
**Description:** As a GHQ operator, I want the ghq_v2 directory tree created with git init so that all subsequent phases have a home.
**Priority:** 1
**Depends on:** None

**Acceptance Criteria:**
- [ ] ~/repos/ghq_v2/ exists with git initialized
- [ ] .claude/skills/ contains 20 subdirectories
- [ ] .claude/hooks/ directory exists
- [ ] knowledge/ contains subdirectories: ralph, skills, policies, ghq-core, video-gen
- [ ] loops/ directory exists
- [ ] companies/ directory exists
- [ ] ~/Documents/GHQ/companies/ base directory exists

### US-002: Write root configuration files
**Description:** As a GHQ operator, I want CLAUDE.md, settings.json, .gitignore, .claudeignore, README.md, AGENTS.md, and manifest.yaml created so the repo is properly configured.
**Priority:** 1
**Depends on:** US-001

**Acceptance Criteria:**
- [ ] .claude/CLAUDE.md references bd, SKILL.md, loops/, company symlinks
- [ ] .claude/settings.json has all 3 hook entries
- [ ] .gitignore includes companies/
- [ ] .claudeignore has minimal credential patterns
- [ ] README.md has setup + philosophy
- [ ] AGENTS.md has beads integration
- [ ] companies/manifest.yaml has schema header

### US-003: Initialize beads database
**Description:** As a GHQ operator, I want beads initialized at the ghq_v2 root so all task tracking goes through a single bd instance.
**Priority:** 1
**Depends on:** US-001

**Acceptance Criteria:**
- [ ] bd init completes successfully
- [ ] .beads/ directory exists
- [ ] bd ready runs without error
- [ ] .beads/ tracked in git

### US-004: Create hook scripts
**Description:** As a GHQ operator, I want the 3 hook scripts created and executable so GHQ protections are active.
**Priority:** 2
**Depends on:** US-001

**Acceptance Criteria:**
- [ ] block-ghq-glob.sh blocks root Glob, suggests v2 paths
- [ ] auto-checkpoint-trigger.sh nudges JSONL append to loops/history.jsonl
- [ ] auto-handoff-trigger.sh fires on PreCompact
- [ ] All scripts pass bash -n
- [ ] All scripts are executable

### US-005: Migrate and rewrite knowledge files
**Description:** As a GHQ operator, I want knowledge/ populated with methodology docs and rewritten schemas for v2.
**Priority:** 2
**Depends on:** US-001

**Acceptance Criteria:**
- [ ] knowledge/ralph/ has 13 files from v1
- [ ] knowledge/video-gen/ has 3 files from v1
- [ ] knowledge/ghq-core/ schemas rewritten for v2
- [ ] knowledge/policies/company-isolation.md added
- [ ] knowledge/skills/README.md rewritten for SKILL.md
- [ ] knowledge/INDEX.md updated

### US-006: Translate 9 execution and composition skills to SKILL.md
**Description:** As a GHQ operator, I want the 9 existing skills translated from skill.yaml to native SKILL.md format.
**Priority:** 2
**Depends on:** US-001

**Acceptance Criteria:**
- [ ] 9 SKILL.md files with frontmatter
- [ ] Instructions preserved from skill.yaml
- [ ] Composition skills have Execution Order section
- [ ] No skill.yaml or registry.yaml files

### US-007: Translate 10 commands to SKILL.md with beads integration
**Description:** As a GHQ operator, I want the 10 existing commands translated to SKILL.md with beads and loops/ integration.
**Priority:** 2
**Depends on:** US-001, US-003

**Acceptance Criteria:**
- [ ] prd uses bd create instead of prd.json
- [ ] run-project uses bd ready/claim/close
- [ ] execute-task reads from bd show
- [ ] All 10 SKILL.md files reference v2 patterns (beads, loops/, SKILL.md)
- [ ] No v1 references (prd.json, skill.yaml, workspace/)

### US-008: Create newproject skill
**Description:** As a GHQ operator, I want a /newproject skill for scaffolding projects inside companies.
**Priority:** 3
**Depends on:** US-001

**Acceptance Criteria:**
- [ ] SKILL.md exists with frontmatter
- [ ] Creates project dirs and child beads epic
- [ ] Validates company exists
- [ ] Validates project uniqueness

### US-009: Create loops/ runtime state structure
**Description:** As a GHQ operator, I want loops/ initialized with empty JSONL files and documentation.
**Priority:** 3
**Depends on:** US-001

**Acceptance Criteria:**
- [ ] state.jsonl exists (empty)
- [ ] history.jsonl exists (empty)
- [ ] README.md documents both schemas

### US-010: Final validation and initial commit
**Description:** As a GHQ operator, I want the complete scaffold validated and committed.
**Priority:** 3
**Depends on:** US-002, US-003, US-004, US-005, US-006, US-007, US-008, US-009

**Acceptance Criteria:**
- [ ] 20 SKILL.md files exist
- [ ] No v1 artifacts
- [ ] bd ready works
- [ ] Initial git commit created

## Non-Goals

- Migrating existing company data from v1
- Setting up qmd collections
- Running the orchestrator loop on this PRD
- Creating actual company instances

## Technical Considerations

- ghq_v2 is a new git repo at ~/repos/ghq_v2, not a branch of ghq
- Company folders are symlinks to ~/Documents/GHQ/companies/<slug>/
- Beads requires dolt to be available for bd init
- All skill translations read from v1 source files at ~/repos/ghq/

## Open Questions

None — all decisions resolved through 9 batches of discovery questions.
