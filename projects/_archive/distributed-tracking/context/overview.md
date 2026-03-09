---
last_updated: 2026-01-27
last_verified: 2026-01-27
verified_by: context-manager
---

# Distributed Tracking Overview

## Purpose

When multiple people work on the same repo from different HQ instances, they can't see each other's planned or in-progress work. This leads to duplicate planning (same feature PRD'd twice), duplicate work (two people implement same task), and stale status (task done but others don't know).

This project adds bidirectional sync between my-hq and target repos via a `.hq/` directory.

## Goals

- Contributors pulling a repo can see all planned work
- Contributors can claim tasks before starting, preventing duplicate work
- Status updates propagate automatically via git push/pull
- Conflicts are detected and can be merged intelligently

## Non-Goals

- Replacing beads (beads remains local task tracking)
- Real-time sync (git push/pull is the sync mechanism)
- Multi-repo orchestration (one repo per PRD)
- Authentication/permissions (relies on git access)

## Current State

**Status:** In Development

The project has defined 9 user stories covering:
- `.hq/` directory structure (US-001)
- Push/pull functions (US-002, US-003)
- Conflict detection and merge (US-004)
- Duplicate work detection (US-005)
- Task claiming (US-006)
- Pure-ralph integration (US-007)
- Slash command (US-008)
- Prompt updates (US-009)

## Quick Links

- PRD: `projects/distributed-tracking/prd.json`
- Target Repo: `C:/my-hq` (self-referential - adds tracking to HQ itself)
