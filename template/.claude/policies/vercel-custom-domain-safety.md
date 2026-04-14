---
id: hq-vercel-custom-domain-safety
title: Never Deploy to Production Custom Domains Without Confirmation
scope: global
trigger: before any Vercel deploy to a custom domain
enforcement: hard
version: 1
created: 2026-02-22
updated: 2026-02-22
source: migration
---

## Rule

NEVER deploy to a production custom domain (e.g. token.get{company}.ai, {your-domain}.com) without explicit user confirmation. "Deploy to a temporary Vercel site" means a fresh Vercel project with only a .vercel.app URL — no custom domain aliases. Existing Vercel projects with custom domains are live production sites.

