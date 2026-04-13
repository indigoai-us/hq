# HQ Monorepo

Personal OS for AI Workers. Open-source (MIT). Published as **HQ by Indigo**.

## Key Facts

- **Brand**: "HQ by Indigo" — use this name everywhere (READMEs, package descriptions, banners)
- **Install**: `npx create-hq` — reads from `indigoai-us/hq` releases
- **Template version**: `template/core.yaml` is the version source of truth

## Template is Canonical

`template/` is the single source of truth for HQ content. `hq-starter-kit` (github.com/{your-username}/hq-starter-kit) is archived as of v10.2.1 — do not sync from it.

Current content counts (as of v10.10.0):
- 30 commands (`.claude/commands/`) + 8 template-only
- 16 core skills (`.claude/skills/`) + 27 on frontend-designer + 11 on ux-auditor + 1 on social-strategist
- 185 policies (`.claude/policies/`)
- 24+ workers (`workers/`)
- 20+ knowledge bases (`knowledge/public/`)

## E2E Testing

`tests/e2e/consolidation.e2e.test.ts` — validates template structural integrity. Uses `--local-template template/` flag. Run before any template release. Must pass alongside existing smoke tests.

```bash
npm run test:e2e
```

## Package Scope

All npm packages use `@indigoai-us` scope (not `@indigoai`):
- `@indigoai-us/create-hq`
- `@indigoai-us/hq-cli`
- `@indigoai-us/hq-cloud`

## Policies

`.claude/policies/` contains:
- `hq-clean-head-before-edits.md` — verify clean working tree before editing template files
- `hq-npm-prepack-template.md` — npm prepack must run before publishing packages
