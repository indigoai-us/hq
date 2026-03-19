---
title: "Environment Sensing for Autonomous Agents"
category: agent-perception
tags: ["perception", "mcp", "environment", "triggers", "monitoring", "scheduled-tasks"]
source: blueprint
confidence: 0.5
created_at: 2026-03-20T00:00:00Z
updated_at: 2026-03-20T00:00:00Z
---

An autonomous agent that only responds to prompts is reactive. To be truly autonomous, GHQ needs to sense its environment and initiate actions proactively.

## Sensing Channels

### Currently Available in GHQ
- **MCP servers**: Gmail, Slack, Sentry, Figma — structured access to external services
- **File system**: Watch for changes in repos, config files, knowledge base
- **Git state**: Branch status, uncommitted changes, PR reviews waiting
- **Web access**: WebFetch/WebSearch for real-time information
- **Scheduled tasks**: Cron-based triggers for periodic checks

### Missing / Underutilized
- **Webhook receivers**: React to GitHub events, CI/CD completions, deployment status
- **Notification aggregation**: Unified inbox across Slack, email, GitHub, Sentry
- **Environment diff detection**: What changed since last session?

## Event-Driven vs Polling

Two models for environment awareness:
- **Polling** (current): Periodically check state via `/loop` or cron. Simple but wasteful and latency-bound.
- **Event-driven** (aspirational): React to webhooks/notifications in real-time. More efficient but requires persistent listener infrastructure.

GHQ's current architecture suits polling well — the `/loop` skill and scheduled tasks can check Slack, email, Sentry, PRs on intervals. True event-driven operation would require a persistent daemon, which is a significant architectural shift.

## The "Morning Briefing" Pattern

A practical starting point: a scheduled task that runs at session start and aggregates:
- Unread Slack mentions
- Open PR reviews
- Sentry alerts in the last 24h
- Git status across tracked repos
- Curiosity queue status

This gives the agent situational awareness without requiring real-time sensing.
