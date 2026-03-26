---
id: no-slack-channel-posts-without-permission
title: Never post to Slack channels without explicit user permission
scope: global
trigger: any Slack send_message to a channel
enforcement: hard
---

## Rule

NEVER post messages to Slack channels without explicit user permission. Always ask first before sending to any channel. DMs to specific people the user requested are fine — channel broadcasts are not.

## Rationale

User correction: posted to #team-product in {Product} Slack without asking. Channel posts are visible to many people and should always be explicitly approved.
