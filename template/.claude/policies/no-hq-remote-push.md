---
id: no-hq-remote-push
title: Never push HQ to remote
scope: global
trigger: git push from HQ root
enforcement: hard
---

## Rule

NEVER push HQ data to any remote repository. HQ is local-only. The `origin` remote (`indigoai-us/hq`) is used only for PULLING upstream updates, not for pushing local state.

Only push repos inside `repos/` (e.g. `new-get{company}`, `{your-repo}`) — never the HQ root.

