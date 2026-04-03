---
id: hq-slack-channel-{company}-workspace
title: "#hq Slack channel is on {company} workspace"
scope: global
trigger: "posting to Slack about HQ work"
enforcement: soft
---

## Rule

The `#hq` Slack channel is a private channel on the **{company}** workspace (channel ID: `{channel-id}`). When posting HQ-related updates (PRs, releases, project completions), use `workspace: "{company}"` and `channel: "hq"`. The default Slack workspace is {Product} — sending to `#hq` without specifying the {company} workspace will fail with "channel not found".

## Rationale

Discovered during session when posting PR summaries. The channel doesn't appear in `list_channels` results even with `include_private: true`, but sending by name with the correct workspace works.
