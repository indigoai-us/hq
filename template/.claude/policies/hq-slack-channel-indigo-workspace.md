---
id: hq-slack-channel-{company}-workspace
title: "#hq Slack channel is on Indigo workspace"
scope: global
trigger: "posting to Slack about HQ work"
enforcement: soft
updated: 2026-04-03
---

## Rule

The `#hq` Slack channel lives on the **Indigo** workspace. When posting HQ updates, always specify `workspace: "{company}"`. Full details (channel ID, post types, discovery quirks) are in the Indigo company policy: `companies/{company}/policies/hq-slack-channel.md`.

## Rationale

Global pointer ensures any session posting about HQ finds the workspace routing rule, while the canonical details live in the Indigo company policy where they belong.
