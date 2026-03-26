---
id: vercel-route53-domain-setup
title: Vercel custom domain setup with Route 53 DNS
scope: global
trigger: adding custom domain to Vercel project where DNS is Route 53
enforcement: soft
---

## Rule

When adding a custom domain to a Vercel project where DNS is managed by AWS Route 53:

1. The `vercel domains add` CLI command will return **403 Not authorized** for domains not registered in Vercel's domain list — even if the project is in the correct team scope
2. Use the **Vercel REST API** instead: `POST /v10/projects/{projectId}/domains?teamId={teamId}` with `{"name":"subdomain.apex.com"}`
3. The API returns a `verification` array with a TXT record requirement at `_vercel.{apex}`
4. The `_vercel.{apex}` TXT record may already exist with values for other subdomains — **UPSERT** with all existing values plus the new one (Route 53 `UPSERT` action)
5. Also create a CNAME: `subdomain.apex.com → cname.vercel-dns.com`
6. After DNS propagates, trigger verification: `POST /v10/projects/{projectId}/domains/{domain}/verify?teamId={teamId}` — Vercel does NOT auto-verify
7. Vercel auth token location on macOS: `~/Library/Application Support/com.vercel.cli/auth.json`

## Rationale

Discovered during HQ World domain setup (Mar 2026). The CLI path is a dead end for Route 53 domains — REST API is required.
