---
id: company-isolation
title: Company Isolation
scope: global
trigger: always
enforcement: hard
---

## Rule

1. **Infer active company** from context: cwd, skill being run, files being accessed, or project repo. When ambiguous, ask the user before proceeding.

2. **Credentials are company-scoped.** Never read or use credentials from `companies/{A}/settings/` when performing work for company B. Each company's `settings/` is shielded by `.claudeignore` — never attempt to read paths that are blocked.

3. **Knowledge must not cross company boundaries.** Never include company A's brand guidelines, product context, or internal data in outputs intended for company B.

4. **Deploy targets are owned.** Never deploy to a Vercel project, GitHub repo, or other deploy target registered under company A while working in company B's context. Verify ownership in `companies/manifest.yaml` before any deploy.

5. **qmd collections are scoped.** When searching, use `-c {company}` to limit results to the active company's collection. Never surface cross-company knowledge in search results used for a single-company task.

6. **Cross-company tasks require explicit acknowledgment.** When a task genuinely spans multiple companies (rare), state the cross-company scope explicitly and handle each company's resources separately within the same task.

7. **manifest.yaml is the source of truth.** Before accessing any company-scoped resource (settings, knowledge, repos, deploy targets), verify ownership in `companies/manifest.yaml`. If a resource is not listed there for the active company, do not access it.

## Rationale

Mixing credentials, knowledge, or deploy targets across companies is a hard failure mode: it leaks confidential information, risks deploying the wrong product to the wrong customer, and breaks trust. Hard enforcement means violations block the task entirely — the user must explicitly authorize any cross-company action before it proceeds.
