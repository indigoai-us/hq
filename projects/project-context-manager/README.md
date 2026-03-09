# Project Context Manager

**Goal:** Enable all HQ workers to do their best work by providing accurate, concise, and current context about every project.

**Success:** Any worker can explain a project's purpose, architecture, and domain in 30 seconds; context stays current automatically; new workers declare their context needs at creation.

## Overview

A system for discovering, maintaining, and auditing project context so that workers always have the information they need. Includes a context-manager worker, standardized schemas, and integration with /prd and /newworker commands.

## User Stories

### US-001: Define project context schema
**Description:** Create a standardized schema for project context that captures everything workers need to understand a project.

**Acceptance Criteria:**
- [x] knowledge/project-context/schema.md documents the context structure
- [x] Core files defined: context/overview.md, context/architecture.md, context/domain.md
- [x] JSON schema created at knowledge/project-context/context-schema.json for validation
- [x] Example context created for one existing project

### US-002: Create context-manager worker
**Description:** Create a new worker responsible for discovering, maintaining, and auditing project context.

**Acceptance Criteria:**
- [x] workers/dev-team/context-manager/worker.yaml created with worker definition
- [x] Worker added to workers/registry.yaml
- [x] Skills defined: discover, audit, update

### US-003: Create worker context needs registry
**Description:** Central registry documenting what context each worker type needs.

**Acceptance Criteria:**
- [x] knowledge/context-needs/registry.yaml created
- [x] Documents context needs for existing worker types
- [x] knowledge/context-needs/README.md explains how to declare needs

### US-004: Add context discovery to /prd command
**Description:** After PRD creation, prompt user to populate project context using hybrid discovery.

**Acceptance Criteria:**
- [x] .claude/commands/prd.md updated with new Step 6: Populate Project Context
- [x] Step offers three discovery modes: manual, automatic, conversational
- [x] Creates projects/{name}/context/ directory with populated files

### US-005: Add context needs capture to /newworker command
**Description:** When creating a new worker, capture what context it needs.

**Acceptance Criteria:**
- [x] .claude/commands/newworker.md updated with context needs question
- [x] New worker's needs added to knowledge/context-needs/registry.yaml
- [x] Worker's worker.yaml includes context_needs field

### US-006: Implement repo analysis discovery
**Description:** Context-manager skill to automatically extract context from repository structure.

**Acceptance Criteria:**
- [x] discover skill in context-manager can analyze a repo path
- [x] Extracts from: README.md, package.json, directory structure, code comments
- [x] Generates draft context files, asks user to confirm/edit

### US-007: Implement staleness detection and post-PRD trigger
**Description:** Context-manager audits context freshness and runs automatically after PRD completion.

**Acceptance Criteria:**
- [x] Each context file tracks last_updated and last_verified dates
- [x] audit skill checks files older than 30 days
- [x] /run-project triggers context-manager audit skill after PRD completion

### US-008: Implement conversational discovery
**Description:** Context-manager skill to interview users and extract project context from conversation.

**Acceptance Criteria:**
- [x] discover --mode conversational triggers interview flow
- [x] Interview batches questions by context section
- [x] Extracts structured context from user responses

### US-009: Add learnings accumulation
**Description:** Workers can append learnings to project context as they work.

**Acceptance Criteria:**
- [x] context/learnings.md added to schema as optional file
- [x] Template includes sections: Patterns, Gotchas, Tips, Open Questions
- [x] context-manager has learn skill to append insights
