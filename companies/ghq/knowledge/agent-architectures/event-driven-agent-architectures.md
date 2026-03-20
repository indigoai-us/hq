---
title: "Event-Driven Autonomous Agent Architectures"
category: agent-architectures
tags: ["agent-loop", "production-patterns", "hooks", "autonomy", "mcp"]
source: "https://codemaker2016.medium.com/omnidaemon-the-universal-event-driven-runtime-for-production-ready-ai-agents-02b1a5e63dfb, https://fast.io/resources/ai-agent-event-driven-architecture/, https://www.confluent.io/blog/the-future-of-ai-agents-is-event-driven/, https://www.hooklistener.com/guides/event-driven-ai-webhooks, https://www.moveworks.com/us/en/resources/blog/webhooks-triggers-for-ambient-agents, https://unified.to/blog/polling_vs_webhooks_when_to_use_one_over_the_other, https://yuv.ai/blog/claude-code-hooks-mastery"
confidence: 0.85
created_at: "2026-03-20T00:00:00Z"
updated_at: "2026-03-20T00:00:00Z"
---

Three patterns for how autonomous agents perceive and react to the world: polling, webhooks, and persistent daemons.

## The Core Problem

Agents need perception — a way to know that something happened. The naive approach (polling) is simple but wasteful. The ideal (event-driven) is efficient but harder to deploy. Production systems usually land somewhere in between.

## Architecture Patterns

### 1. Polling (Cron / Scheduled Loop)

The agent wakes up at fixed intervals, queries external systems, processes any changes, and sleeps again.

```
Scheduler → Agent wakes → Query APIs → Diff against last state → Act → Sleep
```

**Pros**: Simple to implement, no persistent process, works in serverless/CI.
**Cons**: Latency equal to poll interval; wastes compute/quota when idle; misses events between polls.

**Best for**: Low-frequency, low-latency-sensitivity tasks (daily digests, scheduled reports). GHQ's `/loop` skill uses this pattern.

---

### 2. Webhook Receiver

A lightweight HTTP server listens for inbound POST requests from external systems. Events arrive instantly; the agent processes them on demand.

```
External system → HTTP POST → Webhook endpoint → Agent processes → Act
```

**Pros**: Zero latency between event and action; compute is only used when needed; scales horizontally behind a load balancer.
**Cons**: Requires a public endpoint (HTTPS), HMAC signature verification, idempotency handling (events can be delivered multiple times), retry/DLQ logic.

**Security requirements**: Always verify HMAC signatures. Process exactly-once (idempotency keys). Handle retries with exponential backoff.

**Best for**: Real-time triggers from external SaaS (GitHub push events, Slack messages, Sentry alerts, Stripe payments).

---

### 3. Persistent Daemon

A long-running process maintains open connections to event streams (WebSockets, SSE, Kafka, Redis Streams) and reacts continuously.

```
Event stream (Kafka/Redis/SSE) → Daemon agent ← subscribes and reacts
```

**Pros**: Millisecond reaction times; full stateful context between events; can maintain in-memory buffers.
**Cons**: Complex lifecycle management (crash recovery, health checks, rolling deploys); resource cost even when idle; harder to scale horizontally.

**Production additions**: Dead Letter Queues (DLQ) for failed events, heartbeat/health endpoints, graceful shutdown, horizontal scaling via consumer groups.

**Best for**: High-frequency real-time events, complex multi-step reactions requiring shared state.

---

### 4. Hybrid Model (Most Common in Production)

Most production systems mix patterns:
- Webhooks for real-time triggers (code pushes, alerts)
- Polling for sources that don't support webhooks (legacy APIs)
- SSE/WebSockets for streaming agent output back to users
- Daemons for stateful, high-throughput pipelines

```
┌─────────────────────────────────────────┐
│  Inbound Layer                          │
│  ├── Webhooks (GitHub, Slack, Sentry)   │
│  ├── Polling (legacy APIs, email)       │
│  └── SSE/WS (user-facing UI streams)   │
│                                         │
│  Routing (EventBridge, Kafka, Redis)    │
│                                         │
│  Agent Layer                            │
│  └── Daemon consumers / Lambda handlers │
└─────────────────────────────────────────┘
```

---

## How Claude Code Approaches This

Claude Code uses hooks as an event-driven mechanism within the coding agent's lifecycle. Hooks fire deterministically at 13+ lifecycle points:
- `PreToolUse` / `PostToolUse` — before/after any tool call
- `PreBashCommand` — intercept shell execution
- `PostFileWrite` — react to file changes
- `SessionStart` / `SessionEnd` — lifecycle boundaries

This is a **process-scoped daemon** pattern: Claude Code itself is the persistent process; hooks are the event bus. External perception (file watchers, git hooks, CI webhooks) can trigger Claude Code sessions.

The hooks architecture gives deterministic, guaranteed execution — the agent can't "forget" hooks the way it might overlook a soft instruction.

---

## Comparison Table

| Pattern | Latency | Complexity | Resource Use | Best For |
|---------|---------|------------|--------------|----------|
| Polling | High (= interval) | Low | Wasteful | Scheduled tasks, low-frequency |
| Webhook | Near-zero | Medium | Efficient | Real-time SaaS integrations |
| Daemon | Milliseconds | High | Moderate | High-freq, stateful streams |
| Hybrid | Varies | High | Efficient | Production multi-source systems |

---

## GHQ Implications

GHQ currently uses polling (the `/loop` skill, scheduled scripts). Moving to event-driven would require:
1. A public HTTPS endpoint for webhooks (or a tunneling service like ngrok/Cloudflare Tunnel for local dev)
2. A persistent daemon process or lightweight serverless function
3. HMAC verification and idempotency handling for each source

The lowest-effort upgrade: add a webhook receiver script that accepts POST events and invokes Claude Code sessions, keeping Claude Code itself stateless between invocations.
