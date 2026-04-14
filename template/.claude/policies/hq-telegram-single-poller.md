---
id: hq-telegram-single-poller
title: Telegram allows only one bot poller per token
scope: global
trigger: when deploying or configuring Telegram bots
enforcement: hard
version: 1
created: 2026-03-25
updated: 2026-03-25
source: back-pressure-failure
---

## Rule

Telegram's Bot API allows only ONE active `getUpdates` (long-polling) connection per bot token. A second poller causes 409 Conflict errors and crashes the newer instance.

Before starting a new Telegram bot with an existing token:
1. Stop ALL other processes using the same token (`pkill -f "telegram"` or disable the MCP plugin)
2. Wait ~30s for Telegram to release the connection
3. Then start the new bot

The Claude Code Telegram MCP plugin (`~/.claude/plugins/cache/claude-plugins-official/telegram/`) spawns a separate bun process per Claude Desktop session — ALL of them poll the same token. Disabling the `.env` file is not enough if sessions are already running; must kill existing plugin processes.

