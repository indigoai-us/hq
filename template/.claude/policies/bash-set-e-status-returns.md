---
id: hq-bash-set-e-status-returns
title: Use || pattern for bash functions that return status codes under set -e
scope: global
trigger: writing bash scripts with set -e/set -euo pipefail that call functions returning non-zero status codes
enforcement: hard
version: 1
created: 2026-03-10
updated: 2026-03-10
source: back-pressure-failure
---

## Rule

When a bash function intentionally returns non-zero exit codes as status signals (e.g., `handle_failure` returning 2=skip, 3=pause), NEVER call it directly under `set -e`. Use `cmd || result=$?` to suppress `set -e` for that call:

```bash
# WRONG — set -e kills script when handle_failure returns 2 or 3
handle_failure "$STORY_ID" "$attempt"
result=$?

# RIGHT — || suppresses set -e, captures the status code
result=0
handle_failure "$STORY_ID" "$attempt" || result=$?
```

