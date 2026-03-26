---
id: hq-cmd-publish-kit-rsync-deref
title: Dereference symlinks when syncing knowledge to starter-kit
scope: command
trigger: /publish-kit knowledge sync step
enforcement: hard
version: 1
created: 2026-03-23
updated: 2026-03-23
source: back-pressure-failure
---

## Rule

ALWAYS use `rsync -avL` (with `-L` flag) when copying `knowledge/public/` to the starter-kit. Without `-L`, rsync copies symlinks as symlinks, which point to paths that only exist on the source machine. The starter-kit must contain actual file content, not broken symlinks.

Also: after rsync, verify no symlinks remain in the target with `find $SK/knowledge/ -maxdepth 1 -type l`.

## Rationale

During v8.2.0 publish, default rsync copied knowledge symlinks verbatim. The starter-kit ended up with symlinks like `Ralph -> ../../repos/public/ralph-methodology/docs` which are meaningless on any other machine. Had to re-run with `-L` to dereference and copy actual content.
