---
id: hq-npm-prepack-template
title: Use prepack scripts for npm packages that include files outside package boundary
scope: repo
trigger: Publishing npm packages that reference parent directory files
enforcement: hard
version: 1
created: 2026-03-28
updated: 2026-03-28
source: back-pressure-failure
---

## Rule

ALWAYS use a `prepack` lifecycle script to copy external directories into the package boundary before npm publish. npm 11.x silently drops parent directory traversal paths (e.g. `../../template`) in the `package.json` `files` array without any warning. The `files` entry should reference the local copy (e.g. `"template"`) not the parent path.

Applies to `packages/create-hq/` which bundles `../../template` via prepack.

## Rationale

create-hq v6.0.0 was published with an older npm that resolved `../../template`. After upgrading to npm 11.x, the template was silently excluded from the tarball (21 files / 6KB instead of 310+ files / 7MB). No error or warning was shown. The fix was adding `"prepack": "cp -R ../../template template"` and changing `files` to `["dist", "template"]`.
