---
id: publish-kit-no-subagents-for-scrub
title: Use direct sed pipelines for publish-kit scrubbing, not sub-agents
scope: command
trigger: /publish-kit
enforcement: hard
created: 2026-04-02
---

## Rule

During `/publish-kit`, NEVER delegate file scrubbing (PII replacement, denylist application) to sub-agents. Sub-agents hit Write/Bash/Edit permission denials because they cannot receive interactive user approval. Use direct `sed` pipelines from the main session instead — batch all files through a single `for` loop with the full denylist sed chain.

