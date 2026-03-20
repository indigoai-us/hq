---
title: "Autonomous Workflow Patterns for GHQ"
category: agent-workflows
tags: ["workflows", "research-loop", "pr-review", "monitoring", "autonomous-coding"]
source: blueprint
confidence: 0.5
created_at: 2026-03-20T00:00:00Z
updated_at: 2026-03-20T00:00:00Z
---

Autonomous workflows are end-to-end processes the agent can execute with minimal human intervention. They compose lower-level capabilities (tools, skills, knowledge) into coherent multi-step operations.

## Workflow Categories

### Research & Knowledge (Current)
- `/research-loop`: Process curiosity queue items autonomously
- `/blueprint`: Bootstrap new knowledge domains
- `/learn`: Capture session learnings
- These are GHQ's most mature autonomous workflows

### Code Development (Partial)
- **Feature implementation**: Goal → plan → implement → test → PR (Ralph loop pattern)
- **Bug fix**: Sentry alert → reproduce → diagnose → fix → test → PR
- **Code review**: PR URL → read changes → analyze → post review comments
- GHQ can do these but requires significant human guidance today

### Operations & Monitoring (Aspirational)
- **PR babysitting**: Monitor CI, respond to review comments, rebase when needed
- **Incident triage**: Sentry alert → gather context → assess severity → notify
- **Dependency updates**: Check outdated deps → evaluate changelogs → update → test → PR
- **Deploy monitoring**: Watch deployment → check health metrics → rollback if needed

### Communication & Coordination (Aspirational)
- **Standup prep**: Aggregate yesterday's commits, open PRs, blockers → draft standup
- **Weekly digest**: Summarize knowledge learned, PRs merged, issues closed
- **Async handoff**: Document current state for the next session/agent

## Composability

The power is in composition. A "morning briefing" workflow might:
1. Check Slack for unread mentions (MCP)
2. Check GitHub for PR reviews needed (gh CLI)
3. Check Sentry for new alerts (MCP)
4. Search knowledge base for relevant context (qmd)
5. Present a prioritized action list

Each step uses existing tools/skills. The workflow is the orchestration layer.

## What Makes a Good Autonomous Workflow

- **Clear entry/exit criteria**: When does it start? When is it done?
- **Failure modes defined**: What happens when a step fails? Retry, skip, or escalate?
- **Human checkpoints**: Where should the agent pause for approval?
- **Idempotent where possible**: Running it twice shouldn't cause problems
