---
id: hq-cmd-publish-kit-rsync-deref
title: Dereference symlinks when syncing knowledge to template dir
scope: command
trigger: /publish-kit knowledge sync step
enforcement: hard
version: 1
created: 2026-03-23
updated: 2026-03-23
source: back-pressure-failure
---

## Rule

ALWAYS use `rsync -avL` (with `-L` flag) when copying `knowledge/public/` to `repos/public/hq/template/`. Without `-L`, rsync copies symlinks as symlinks, which point to paths that only exist on the source machine. The template dir must contain actual file content, not broken symlinks.

Also: after rsync, verify no symlinks remain in the target with `find repos/public/hq/template/knowledge/ -maxdepth 1 -type l`.

