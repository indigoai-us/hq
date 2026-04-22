# @indigoai-us/hq-pack-gemini

HQ content pack: six Gemini CLI workers plus `gemini-cli` knowledge base.

## Install

```bash
hq install @indigoai-us/hq-pack-gemini
```

> Requires the `gemini` binary on `PATH`. `create-hq` skips this pack automatically when the CLI isn't installed (`core.yaml:recommended_packages[].conditional`).

## Contents

- `workers/gemini-coder/` — Gemini-powered code generation
- `workers/gemini-reviewer/` — code review
- `workers/gemini-frontend/` — frontend development
- `workers/gemini-designer/` — design ideation
- `workers/gemini-stylist/` — style refinement
- `workers/gemini-ux-auditor/` — UX audit
- `knowledge/gemini-cli/` — CLI usage patterns + prompt library

## Requires

- `hq-core >= 12.0.0`
- `gemini` binary on `PATH`
