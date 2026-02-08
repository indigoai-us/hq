# Projects Index

## Active Projects

| Project | Branch | Status | Description |
|---------|--------|--------|-------------|
| e2e-cloud-testing | `feature/e2e-cloud-testing` | in-progress | E2E testing infrastructure using Browserbase + Playwright for cloud-based browser testing against Vercel preview deployments |

## Project Details

### e2e-cloud-testing

End-to-end testing system for HQ Cloud applications. Provides reusable test templates, CI integration, and worker skills for writing and running E2E tests in cloud browser infrastructure.

**Key deliverables:**
- Knowledge base: `knowledge/testing/` (architecture, integrations, templates)
- Worker skills: `workers/dev-team/frontend-dev/skills/e2e-testing.md`, `workers/dev-team/backend-dev/skills/e2e-testing.md`
- Test planning: `workers/dev-team/qa-tester/skills/test-plan.md`
- CI workflow: `.github/workflows/e2e.yml`
- PRD schema: `knowledge/hq-core/prd-schema.md` (`e2eTests` field)
- Ralph loop: `knowledge/workers/ralph-loop-pattern.md` (E2E CI verification)
