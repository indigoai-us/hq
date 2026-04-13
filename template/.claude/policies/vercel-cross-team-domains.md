---
id: vercel-cross-team-domains
title: Vercel domains cannot be assigned cross-team
scope: global
trigger: vercel domain assignment, domain redirect setup
enforcement: hard
---

## Rule

Vercel does NOT allow adding a domain registered on Team A to a project on Team B (returns 403). When a domain and its destination project are on different Vercel teams, create a lightweight redirect-only project on the domain's team containing a `vercel.json` with a permanent redirect rule.
