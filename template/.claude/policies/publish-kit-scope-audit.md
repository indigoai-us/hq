---
id: publish-kit-scope-audit
title: Audit publish-kit sync scope when adding new HQ categories
scope: command
trigger: /publish-kit, /newworker, new skill creation, new policy creation
enforcement: soft
---

## Rule

When adding a new category of files to HQ (skills, policies, infrastructure configs), check whether it should be added to the publish-kit sync scope. The sync table in `.claude/commands/publish-kit.md` must be kept in sync with HQ's actual public content.

## How to apply

After creating new `.claude/skills/`, `.claude/policies/`, or infrastructure files, check the publish-kit sync table and add the new category if it has public value.
