---
title: "NanoClaw: Container-Isolated AI Agent Platform"
category: ai-agents
tags: ["ai-agents", "containers", "claude-agent-sdk", "open-source", "messaging", "security"]
source: web research
confidence: 0.85
created_at: 2026-03-19T12:00:00Z
updated_at: 2026-03-19T12:00:00Z
---

Lightweight, container-isolated AI agent platform built on the Claude Agent SDK.

NanoClaw is an open-source alternative to OpenClaw that emphasizes security through OS-level container isolation and a small, auditable codebase (~3,900 lines across 15 TypeScript files). Created by the Cohens at qwibitai, it launched in early 2026 and quickly gained traction.

## Architecture

- **Runtime**: Single Node.js 20+ process orchestrating Claude agents
- **Isolation**: Each agent runs in its own Linux container (Apple Container on macOS, Docker on Linux) with filesystem isolation enforced at the OS level
- **State**: SQLite for persistence
- **AI layer**: Built directly on Anthropic's Claude Agent SDK — agents are Claude Code instances
- **Codebase**: ~3,900 lines of TypeScript across ~15 files (vs OpenClaw's ~500k lines, 70+ dependencies)

## Key Features

- **Multi-channel messaging**: WhatsApp, Telegram, Discord, Slack, Gmail, Signal — channels added via skills (`/add-whatsapp`, `/add-telegram`, etc.)
- **Per-group isolation**: Each conversation group gets its own CLAUDE.md memory, isolated filesystem, and container sandbox
- **Scheduled tasks**: Built-in support for recurring jobs and autonomous operations
- **Agent swarms**: Collaborative multi-agent task solving
- **Web access**: Agents can search and fetch web content
- **Extensible**: Uses Claude Code skills system for customization

## Security Model — NanoClaw vs OpenClaw

| Aspect | OpenClaw | NanoClaw |
|--------|----------|----------|
| Isolation | Application-level (allowlists, pairing codes) | OS-level containers |
| Process model | Single Node process, shared memory | Separate container per agent |
| Codebase | ~500k lines, 70+ deps | ~3.9k lines, minimal deps |
| Auditability | Difficult to audit fully | Realistically auditable |

## Docker Partnership

In March 2026, Docker announced integration of Docker Sandboxes into NanoClaw, providing hypervisor-level isolation with millisecond startup times. Agents run in micro VMs on macOS and Windows (WSL), with Linux support planned.

## Design Philosophy

NanoClaw is described as "AI-native" software — designed to be managed and extended primarily through AI interaction rather than manual configuration. The project is free and open source (MIT license).

## Sources

- [GitHub: qwibitai/nanoclaw](https://github.com/qwibitai/nanoclaw)
- [TechCrunch: Docker deal](https://techcrunch.com/2026/03/13/the-wild-six-weeks-for-nanoclaws-creator-that-led-to-a-deal-with-docker/)
- [The Register: OpenClaw in containers](https://www.theregister.com/2026/03/01/nanoclaw_container_openclaw/)
- [The New Stack: Minimalist AI agents](https://thenewstack.io/nanoclaw-minimalist-ai-agents/)
- [VentureBeat: Security improvements](https://venturebeat.com/orchestration/nanoclaw-solves-one-of-openclaws-biggest-security-issues-and-its-already)
