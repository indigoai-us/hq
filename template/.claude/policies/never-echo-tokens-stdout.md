---
id: hq-never-echo-tokens-stdout
title: Never echo API keys or tokens to stdout
scope: global
trigger: when building CLI tools that output config snippets or setup instructions
enforcement: hard
version: 1
created: 2026-03-28
updated: 2026-03-28
source: back-pressure-failure
---

## Rule

NEVER print raw API keys, tokens, or secrets to stdout in CLI setup/config commands. Use `<your-api-key>` or `<paste-your-key>` placeholders instead. CLI setup commands are designed for headless/CI environments where stdout is captured in build logs, terminal recordings, or shell history.

## Rationale

Caught by Codex review (P1) in {company} setup command. The fallback code path printed the actual DOMINION_API_KEY value when no supported AI tool was detected, leaking credentials to anyone with access to CI logs.
