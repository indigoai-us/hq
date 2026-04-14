---
id: hq-linear-api-no-bearer
title: Linear API keys use plain Authorization header, not Bearer
scope: global
trigger: Any Linear API call using curl or fetch
enforcement: hard
version: 1
created: 2026-02-26
updated: 2026-02-26
source: back-pressure-failure
---

## Rule

ALWAYS use `Authorization: <api_key>` (plain key, no prefix) when authenticating with the Linear GraphQL API. NEVER use `Authorization: Bearer <api_key>` — Linear rejects Bearer-prefixed API keys with a 400 error.

