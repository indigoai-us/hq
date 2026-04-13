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

## Rationale

Linear API keys are not OAuth tokens. The API returns a clear error: "It looks like you're trying to use an API key as a Bearer token. Remove the Bearer prefix." This applies to all Linear workspaces ({Product}, {Product}, {company}).
