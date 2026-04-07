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
learned_from: "CLAUDE.md learned rules migration 2026-02-22"
---

## Rule

NEVER deploy to a production custom domain (e.g. app.{your-domain}.com, {your-domain}.com) without explicit user confirmation. "Deploy to a temporary Vercel site" means a fresh Vercel project with only a .vercel.app URL — no custom domain aliases. Existing Vercel projects with custom domains are live production sites.

## Rationale

Accidental deploys to production custom domains can take down live sites.
