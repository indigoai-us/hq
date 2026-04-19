---
id: hq-publish-target-is-hq-template
title: HQ publish target is repos/public/hq/template — not hq-starter-kit
scope: command
trigger: /publish-kit, /stage-kit, any HQ→public sync work
enforcement: hard
version: 1
created: 2026-04-17
updated: 2026-04-17
source: user-correction
---

## Rule

The HQ → public publishing pipeline targets **`repos/public/hq/template/`** (GitHub `indigoai-us/hq`, monorepo). This is the live, mature target with full PII + denylist scrub via `/publish-kit`.

**`repos/public/hq-starter-kit/`** (GitHub `{your-name}/hq-starter-kit`) is a **legacy flat repo**, frozen ~2026-04-02. Do not sync HQ content to it. Do not describe it as the publish target in new docs.

When scaffolding publish/staging work:

- Use `/publish-kit [version]` for full releases (sweeps HQ → `hq/template/`, commits, opens PR)
- Use `/publish-kit --item <path>` for single-item patch PRs
- Use `/stage-kit --item <path>` to pre-copy with scrub but no git ops (sits in the working tree until the next publish-kit run sweeps it up)
- Never write to `repos/public/hq-starter-kit/` from HQ automation

Path remapping for the template: `knowledge/public/X/` (HQ) → `knowledge/X/` (template — strips `public/`). All other top-level paths mirror 1:1 via the remap table in `/publish-kit` and `/stage-kit`.

