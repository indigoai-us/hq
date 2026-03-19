---
title: "NanoClaw: Container-Isolated AI Agent Platform"
category: ai-agents
tags: ["ai-agents", "containers", "claude-agent-sdk", "open-source", "messaging", "security"]
source: web research
confidence: 0.85
created_at: 2026-03-19T12:00:00Z
updated_at: 2026-03-19T13:30:00Z
---

Lightweight, container-isolated AI agent platform built on the Claude Agent SDK.

NanoClaw is an open-source alternative to OpenClaw created by Gavriel Cohen (qwibitai) in late January 2026, built with Claude Code itself. It emphasizes security through OS-level container isolation and a small, auditable codebase (~3,900 lines across 15 TypeScript files). As of mid-March 2026 it has surpassed 20,000 GitHub stars and 100,000 downloads. Cohen shut down his AI marketing startup to form NanoCo, a company focused on NanoClaw with a commercial model centered on forward-deployed engineers embedded with client companies.

## Architecture

- **Runtime**: Single Node.js 20+ process orchestrating Claude agents — no microservices
- **Isolation**: Each agent runs in its own Linux container (Apple Container on macOS, Docker on Linux) with filesystem isolation enforced at the OS level. Agents can only see explicitly mounted directories.
- **State**: SQLite for persistence
- **AI layer**: Built directly on Anthropic's Claude Agent SDK — agents are Claude Code instances
- **Codebase**: ~3,900 lines of TypeScript across ~15 files (vs OpenClaw's ~500k lines, 70+ dependencies)

## Key Capabilities

- **Multi-channel messaging**: WhatsApp (built-in), Telegram, Discord, Slack, Gmail, Signal — channels added via skills
- **Per-group isolation**: Each conversation group gets its own CLAUDE.md memory, isolated filesystem, and container sandbox
- **Scheduled tasks**: Recurring jobs and autonomous operations
- **Agent Swarms**: First personal AI assistant to support swarms — teams of specialized Claude agents collaborate on complex tasks, built on Claude Code's agent-teams capability
- **Web access**: Search, browse, and browser automation
- **Extensible via skills**: Uses Claude Code skills system for customization

## "No Features" Philosophy

NanoClaw deliberately ships without traditional features. Instead it uses skills — sets of instructions that teach Claude Code how to modify the NanoClaw codebase to add capabilities. You run a skill, Claude reads the instructions, writes code, and NanoClaw gains a new feature tailored to your setup. This makes every deployment bespoke — users have exactly the feature set they need.

## Security Model — NanoClaw vs OpenClaw

| Aspect | OpenClaw | NanoClaw |
|--------|----------|----------|
| Isolation | Application-level (allowlists, pairing codes) | OS-level containers |
| Process model | Single Node process, shared memory | Separate container per agent |
| Bash safety | Restricted via permission checks | Safe — commands run inside container, not host |
| Codebase | ~500k lines, 70+ deps | ~3.9k lines, minimal deps |
| Auditability | Difficult to audit fully | Realistically auditable |

## Docker Partnership

In March 2026, Docker announced integration of Docker Sandboxes into NanoClaw, providing hypervisor-level isolation via MicroVMs with millisecond startup times. Deployable with a single command. Agents run in micro VMs on macOS and Windows (WSL), with Linux support planned. This targets enterprise adoption by solving the core challenge: giving agents room to act without room to damage surrounding systems.

## Sources

- [GitHub: qwibitai/nanoclaw](https://github.com/qwibitai/nanoclaw)
- [NanoClaw official site](https://nanoclaw.dev/)
- [NanoClaw blog: "NanoClaw has no features"](https://nanoclaw.dev/blog/nanoclaw-has-no-features/)
- [TechCrunch: Docker deal](https://techcrunch.com/2026/03/13/the-wild-six-weeks-for-nanoclaws-creator-that-led-to-a-deal-with-docker/)
- [The Register: OpenClaw in containers](https://www.theregister.com/2026/03/01/nanoclaw_container_openclaw/)
- [VentureBeat: Docker sandbox partnership](https://venturebeat.com/infrastructure/nanoclaw-and-docker-partner-to-make-sandboxes-the-safest-way-for-enterprises)
- [Docker press release](https://www.docker.com/press-release/nanoclaw-partners-with-docker-to-run-ai-agents-safely/)
