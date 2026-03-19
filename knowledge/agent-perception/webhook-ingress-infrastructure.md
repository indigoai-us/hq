---
title: "Webhook Ingress Infrastructure for Local Agents"
category: agent-perception
tags: ["agent-loop", "production-patterns", "hooks", "personal-knowledge", "cli"]
source: "https://dev.to/aryan_shourie/secure-tunneling-explained-ngrok-vs-cloudflared-mcl, https://tareq.co/2025/11/local-webhook-cloudflare-tunnel/, https://hookdeck.com/webhooks/platforms/ngrok-alternatives-for-local-tunnel-webhook-development, https://www.twilio.com/en-us/blog/expose-localhost-to-internet-with-tunnel, https://developer.squareup.com/blog/reliable-webhooks-using-serverless-architecture/, https://www.hooklistener.com/guides/event-driven-ai-webhooks"
confidence: 0.85
created_at: "2026-03-20T00:00:00Z"
updated_at: "2026-03-20T00:00:00Z"
---

Minimal infrastructure to move a local agent from polling to event-driven: tunnel + HTTP receiver + handler.

## The Three-Layer Stack

```
External SaaS
    │  HTTP POST (webhook event)
    ▼
[Tunnel Layer]         ← Cloudflare Tunnel or ngrok
    │  forwards to localhost
    ▼
[Receiver Layer]       ← lightweight HTTP server (bash netcat / Node / Python)
    │  parses + validates payload
    ▼
[Handler Layer]        ← invokes agent logic (claude -p, bash script, etc.)
```

---

## Layer 1: Tunnel Options

### Cloudflare Tunnel (Recommended for Persistent Use)

**Best for**: Stable, always-on webhook URL; no account required for quick tunnels; no bandwidth limits; free.

**Quick tunnel (no account, ephemeral URL):**
```bash
cloudflared tunnel --url http://localhost:8080
# → https://random-words.trycloudflare.com
```

**Persistent tunnel (stable URL, requires Cloudflare account):**
```bash
brew install cloudflared
cloudflared tunnel login
cloudflared tunnel create ghq-webhooks
# Edit ~/.cloudflared/config.yml:
#   tunnel: <TUNNEL_ID>
#   credentials-file: ~/.cloudflared/<TUNNEL_ID>.json
#   ingress:
#     - hostname: webhooks.yourdomain.com
#       service: http://localhost:8080
#     - service: http_status:404
cloudflared tunnel run ghq-webhooks
```

**Trade-offs**: No request inspection UI, no traffic replay — purely a transport layer.

### ngrok (Recommended for Debugging)

**Best for**: Inspecting/replaying webhook payloads during development; built-in web UI at `localhost:4040`.

```bash
brew install ngrok
ngrok config add-authtoken <TOKEN>
ngrok http 8080
# → https://abc123.ngrok-free.app
```

**2026 free tier limits**: Sessions capped at 2 hours, random URLs, 1 GB/month bandwidth. Use for development, not production.

---

## Layer 2: Minimal HTTP Receiver

### Option A: Single-file Python (zero dependencies)

```python
#!/usr/bin/env python3
# webhook_receiver.py
import http.server, json, hmac, hashlib, subprocess, os

SECRET = os.environ.get("WEBHOOK_SECRET", "").encode()
PORT = int(os.environ.get("PORT", 8080))

class Handler(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length)

        # HMAC verification (GitHub-style)
        sig = self.headers.get("X-Hub-Signature-256", "")
        if SECRET:
            expected = "sha256=" + hmac.new(SECRET, body, hashlib.sha256).hexdigest()
            if not hmac.compare_digest(sig, expected):
                self.send_response(401); self.end_headers(); return

        self.send_response(200); self.end_headers()  # Respond immediately
        payload = json.loads(body)
        # Dispatch to handler asynchronously
        subprocess.Popen(["./handle_event.sh", json.dumps(payload)])

    def log_message(self, *args): pass  # suppress logs

http.server.HTTPServer(("", PORT), Handler).serve_forever()
```

### Option B: Node.js with express (if already in stack)

```javascript
import express from "express";
import crypto from "crypto";
import { exec } from "child_process";

const app = express();
app.use(express.raw({ type: "*/*" })); // raw body for HMAC

app.post("/webhook/:source", (req, res) => {
  res.sendStatus(200); // respond fast, process async
  const payload = JSON.parse(req.body);
  exec(`./handle_event.sh '${req.params.source}' '${JSON.stringify(payload)}'`);
});

app.listen(8080);
```

### Option C: netcat one-liner (no server, for quick testing only)

```bash
while true; do
  echo -e "HTTP/1.1 200 OK\r\n\r\n" | nc -l 8080 | tail -1 | ./handle_event.sh
done
```

---

## Layer 3: Handler (GHQ-Specific)

The handler translates webhook payloads into agent invocations:

```bash
#!/bin/bash
# handle_event.sh — receives JSON payload on stdin or $1
PAYLOAD="${1:-$(cat)}"
SOURCE=$(echo "$PAYLOAD" | jq -r '.source // "unknown"')

case "$SOURCE" in
  github)
    EVENT=$(echo "$PAYLOAD" | jq -r '.event')
    echo "$PAYLOAD" | ./tools/ask-claude.sh "GitHub event received: $EVENT. What needs attention?"
    ;;
  sentry)
    echo "$PAYLOAD" | ./tools/ask-claude.sh "New Sentry alert. Summarize and suggest fix."
    ;;
  *)
    echo "$PAYLOAD" >> knowledge/.webhook-inbox.jsonl  # buffer for later
    ;;
esac
```

---

## Security Requirements (Non-Negotiable)

| Requirement | Why | Implementation |
|-------------|-----|----------------|
| HMAC verification | Reject forged payloads | `hmac.compare_digest(sig, expected)` — always constant-time |
| Respond immediately (< 5s) | Most SaaS retries on timeout | Respond 200, process async in subprocess |
| Idempotency | Events delivered multiple times | Store event IDs in a seen-set (SQLite, Redis, flat file) |
| HTTPS only | Payload confidentiality | Provided by tunnel layer (both Cloudflare and ngrok terminate TLS) |

---

## Minimal GHQ Bootstrap

```bash
# 1. Install tunnel
brew install cloudflared

# 2. Start receiver
PORT=8080 WEBHOOK_SECRET=mysecret python3 webhook_receiver.py &

# 3. Open tunnel
cloudflared tunnel --url http://localhost:8080
# Copy the generated URL → paste into GitHub/Sentry/Slack webhook settings

# 4. Tail logs to verify events arrive
tail -f knowledge/.webhook-inbox.jsonl
```

Three commands. No cloud account needed (quick tunnel). Ready to receive events.

---

## Operational Notes

- **Process management**: Use `launchd` (macOS) or `systemd` to keep the receiver alive across reboots.
- **Cloudflare Tunnel + custom domain**: Eliminates URL changes — register webhook URL once, never update it.
- **ngrok for debugging**: `localhost:4040` shows full payload, lets you replay requests — invaluable when building handlers.
- **Serverless alternative**: AWS Lambda + API Gateway adds HTTPS endpoint without a persistent process, but adds cold-start latency (~100–500ms) and AWS overhead; better for high-reliability production than for a personal OS.
