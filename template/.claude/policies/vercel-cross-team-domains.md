---
id: vercel-cross-team-domains
title: Vercel domains cannot be assigned cross-team
scope: global
trigger: vercel domain assignment, domain redirect setup
enforcement: hard
---

## Rule

Vercel does NOT allow adding a domain registered on Team A to a project on Team B (returns 403). When a domain and its destination project are on different Vercel teams, create a lightweight redirect-only project on the domain's team containing a `vercel.json` with a permanent redirect rule.

## Rationale

Discovered 2026-03-25 when setting up {company}brands.com ({company}-brands team) → {company}brandsgroup.com ({company} team). `vercel domains add {company}brands.com --scope {company}-f0dc7e1b` returned "Not authorized to use {company}brands.com (403)". Solution was a minimal `{company}brands-redirect` project on the {company}-brands team.
