# HQ

Personal OS for AI Workers. Install, personalize, and run AI agents from your terminal with [Claude Code](https://docs.anthropic.com/en/docs/claude-code).

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
| `.claude/commands/` | 17 slash commands for session management, workers, projects, content, design |
| `workers/` | 26 AI workers (dev team, content team, QA, security, finance) |
| `knowledge/` | Knowledge bases (Ralph methodology, design styles, security, worker framework) |
| `starter-projects/` | 3 starter projects (personal assistant, social media, code worker) |
| `workspace/` | Threads, checkpoints, reports, social drafts |

## Cloud Sync

Sync your HQ to the cloud for mobile access:

```bash
npm install -g @{company}ai/hq-cli
hq sync init        # Authenticate with {Product}AI
hq sync start       # Start background sync
```

Access your HQ from any device at [hq.{company}ai.com](https://hq.{company}ai.com).

## Module Management

Keep your HQ updated with the latest commands, workers, and knowledge:

```bash
hq modules sync     # Pull latest updates
hq modules list     # See installed modules
hq modules add <repo-url>  # Add external modules
```

## Architecture

```
{company}ai/hq/
├── packages/
│   ├── create-hq/     # npx create-hq installer
│   ├── hq-cli/        # hq modules|sync management CLI
│   └── hq-cloud/      # S3 sync engine
├── apps/
│   └── web/           # PWA dashboard (hq.{company}ai.com)
├── infra/             # AWS infrastructure (SST)
└── template/          # HQ template distributed to users
```

## Packages

| Package | npm | Purpose |
|---------|-----|---------|
| `create-hq` | [![npm](https://img.shields.io/npm/v/create-hq)](https://www.npmjs.com/package/create-hq) | One-time installer |
| `@{company}ai/hq-cli` | [![npm](https://img.shields.io/npm/v/@{company}ai/hq-cli)](https://www.npmjs.com/package/@{company}ai/hq-cli) | Ongoing management |
| `@{company}ai/hq-cloud` | [![npm](https://img.shields.io/npm/v/@{company}ai/hq-cloud)](https://www.npmjs.com/package/@{company}ai/hq-cloud) | Cloud sync engine |

## License

MIT
