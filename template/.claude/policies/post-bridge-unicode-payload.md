---
id: post-bridge-unicode-payload
title: Use temp file for Post-Bridge JSON payloads with unicode
scope: command
trigger: posting via /post with em dashes or other unicode in caption
enforcement: hard
---

## Rule

NEVER shell-expand JSON payloads containing unicode characters (em dashes —, curly quotes, etc.) for Post-Bridge API calls. The shell's `$(...)` expansion causes `character not in range` errors with non-ASCII characters.

Instead, write the JSON payload to a temp file using python's `json.dump`, then pass it to curl:

```bash
python3 << 'PYEOF'
import json
body = {"caption": "Text with \u2014 em dashes", "social_accounts": [44183]}
with open("/tmp/pb-post-body.json", "w") as f:
    json.dump(body, f)
PYEOF

curl -s -X POST "https://api.post-bridge.com/v1/posts" \
  -H "Authorization: Bearer $POST_BRIDGE_API_KEY" \
  -H "Content-Type: application/json" \
  -d @/tmp/pb-post-body.json
```

## Rationale

Session 2026-03-09: em dash (—) in HQ v7.0.0 post caption caused `character not in range` error when using shell heredoc/expansion for the JSON body. Python temp file approach worked on first try.
