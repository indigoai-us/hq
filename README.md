# HQ by Indigo — Monorepo

This monorepo (`indigoai-us/hq`) is the home for **HQ tooling**: the installer, the management CLI, the cloud sync engine, and optional content packs. The scaffold itself lives in a separate repo.

> **Where's the scaffold?** As of v12.0.0 (2026-04-21), the HQ scaffold — commands, workers, knowledge, skills, policies, setup — ships from **[`indigoai-us/hq-core`](https://github.com/indigoai-us/hq-core)**. This repo used to contain it under `template/`; that tree has moved. `npx create-hq` now fetches from `hq-core`, and in-place upgrades via `/update-hq` pull from the same `hq-core` release stream (not this monorepo). See the `hq-core-split` migration notes for details.

## Install HQ

```bash
npx create-hq
```

This clones `indigoai-us/hq-core` into a new `hq/` directory with commands, workers, knowledge bases, and project scaffolding — then prompts to install recommended packs (design-styles, design-quality, gemini, gstack). Open it in Claude Code and run the setup wizard:

```bash
cd hq
claude
/setup
```

## HQ Teams

Share a workspace with your team — an admin creates a team backed by a private GitHub repo, invites members, and everyone gets synchronized team content alongside their personal HQ.

```bash
# Admin: create a team
npx create-hq
# Choose "Create an HQ Teams account" → pick org → invite members

# Member: accept an invite
npx create-hq --invite hq_<token>
```

Team content lives at `companies/{slug}/` as an embedded git repo. [Read the Teams docs →](https://hq-teams-docs.vercel.app)

## Cloud Sync

Sync your HQ to the cloud for mobile access:

```bash
npm install -g @indigoai-us/hq-cli
hq sync init        # Authenticate with IndigoAI
hq sync start       # Start background sync
```

## Module & Pack Management

Keep your HQ updated with the latest commands, workers, and knowledge:

```bash
hq modules sync                                # Pull latest scaffold updates from hq-core
hq modules list                                # See installed modules
hq install @indigoai-us/hq-pack-design-styles  # Install a content pack (npm transport)
hq install github:indigoai-us/hq#packages/hq-pack-gstack  # Install via git-subpath transport
hq install ./local-pack                        # Install from a local path
```

Content packs drop files into `packages/{name}/` in your HQ and register contributions (commands, skills, workers, knowledge, hooks, policies) in `modules/modules.yaml`.

## Architecture

```
indigoai-us/hq/                      ← this repo: tooling + packs
├── packages/
│   ├── create-hq/                   # npx create-hq installer (fetches hq-core)
│   ├── hq-cli/                      # hq modules|sync|install management CLI
│   ├── hq-cloud/                    # S3 sync engine
│   ├── hq-pack-design-styles/       # curated style packs
│   ├── hq-pack-design-quality/      # typography/color/spatial/motion references
│   ├── hq-pack-gemini/              # 6 gemini-* workers + gemini-cli knowledge
│   └── hq-pack-gstack/              # gstack-team + 26 g-* skills
├── apps/
│   ├── docs/                        # Docs site (Astro + Starlight)
│   ├── teams-docs/                  # HQ Teams docs (Astro + Starlight)
│   └── web/                         # PWA dashboard
└── infra/                           # AWS infrastructure (SST)

indigoai-us/hq-core/                 ← separate repo: the scaffold itself
├── .claude/                         # commands, skills, policies, hooks, scripts
├── workers/public/                  # shipped workers (design-styles/gemini/gstack live in packs)
├── knowledge/                       # shipped knowledge (design/gemini-cli live in packs)
├── packages/                        # empty by default — populated by `hq install`
├── core.yaml                        # hqVersion + recommended_packages
└── setup.sh                         # install wizard (invoked by create-hq)
```

## Packages

| Package | npm | Purpose |
|---------|-----|---------|
| `create-hq` | [![npm](https://img.shields.io/npm/v/create-hq)](https://www.npmjs.com/package/create-hq) | One-time installer (fetches `hq-core`) |
| `@indigoai-us/hq-cli` | [![npm](https://img.shields.io/npm/v/@indigoai-us/hq-cli)](https://www.npmjs.com/package/@indigoai-us/hq-cli) | Ongoing management — `hq install`, `hq modules`, `hq sync` |
| `@indigoai-us/hq-cloud` | [![npm](https://img.shields.io/npm/v/@indigoai-us/hq-cloud)](https://www.npmjs.com/package/@indigoai-us/hq-cloud) | Cloud sync engine |
| `@indigoai-us/hq-pack-design-styles` | — | Curated design style packs |
| `@indigoai-us/hq-pack-design-quality` | — | Typography/color/spatial/motion references |
| `@indigoai-us/hq-pack-gemini` | — | Gemini workers + CLI knowledge (requires `gemini` on PATH) |
| `@indigoai-us/hq-pack-gstack` | — | gstack-team + g-* skills |

Packs can be installed via npm name, git URL (`github:org/repo#<ref>`, including git-subpath `github:org/repo#packages/hq-pack-foo@<ref>`), or local path.

## License

MIT
