# HQ by Indigo

Personal OS for AI Workers. **HQ** is free and open-source — install, personalize, and run AI agents from your terminal with [Claude Code](https://docs.anthropic.com/en/docs/claude-code). **HQ Cloud** (paid) adds cross-device sync, a mobile dashboard, and managed infrastructure.

> Formerly [`hq-starter-kit`](https://github.com/coreyepstein/hq-starter-kit) — now distributed directly from this monorepo under `template/`.

## Install

```bash
npx create-hq
```

This creates an HQ directory with commands, workers, knowledge bases, and project scaffolding. Then open it in Claude Code and run the setup wizard:

```bash
cd hq
claude
/setup
```

## What's Inside

| Directory | Contents |
|-----------|----------|
| `.claude/commands/` | 44 slash commands for session management, workers, projects, content, design |
| `workers/` | 28+ AI workers (dev team, content team, QA, security, finance) |
| `knowledge/` | Knowledge bases (Ralph methodology, design styles, security, worker framework) |
| `.claude/skills/` | 44+ skills (design, animate, polish, review, audit, and more) |
| `workspace/` | Threads, checkpoints, reports, social drafts |

## Cloud Sync

Sync your HQ to the cloud for mobile access:

```bash
npm install -g @indigoai-us/hq-cli
hq sync init        # Authenticate with IndigoAI
hq sync start       # Start background sync
```

Access your HQ from any device at [hq.indigoai.com](https://hq.indigoai.com).

## Module Management

Keep your HQ updated with the latest commands, workers, and knowledge:

```bash
hq modules sync     # Pull latest updates
hq modules list     # See installed modules
hq modules add <repo-url>  # Add external modules
```

## Architecture

```
indigoai-us/hq/
├── packages/
│   ├── create-hq/     # npx create-hq installer
│   ├── hq-cli/        # hq modules|sync management CLI
│   └── hq-cloud/      # S3 sync engine
├── apps/
│   ├── docs/          # Docs site (Astro + Starlight)
│   └── web/           # PWA dashboard (hq.indigoai.com)
├── infra/             # AWS infrastructure (SST)
└── template/          # HQ template distributed to users
```

## Packages

| Package | npm | Purpose |
|---------|-----|---------|
| `create-hq` | [![npm](https://img.shields.io/npm/v/create-hq)](https://www.npmjs.com/package/create-hq) | One-time installer |
| `@indigoai-us/hq-cli` | [![npm](https://img.shields.io/npm/v/@indigoai-us/hq-cli)](https://www.npmjs.com/package/@indigoai-us/hq-cli) | Ongoing management |
| `@indigoai-us/hq-cloud` | [![npm](https://img.shields.io/npm/v/@indigoai-us/hq-cloud)](https://www.npmjs.com/package/@indigoai-us/hq-cloud) | Cloud sync engine |

## License

MIT
