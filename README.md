# HQ

Personal OS for AI Workers. Install, personalize, and run AI agents from your terminal with [Claude Code](https://docs.anthropic.com/en/docs/claude-code).

## Install

### Quick Start (recommended)

```bash
npx create-hq
```

This creates an HQ directory with commands, workers, knowledge bases, and project scaffolding. Then open it in Claude Code and run the setup wizard:

```bash
cd hq
claude
/setup
```

### Binary Installers

For users who prefer a graphical installer (no command line required):

- **Windows** — [Download .exe installer](https://github.com/indigoai-us/hq/releases/latest/download/HQ-Setup.exe)
- **macOS** — [Download .pkg installer](https://github.com/indigoai-us/hq/releases/latest/download/HQ-Installer.pkg)

Visit the [HQ download page](https://indigoai-us.github.io/hq/installer/docs/) for OS auto-detection and system requirements.

### Manual

Clone the template directory directly:

```bash
git clone https://github.com/indigoai-us/hq.git
cp -r hq/template ~/hq
cd ~/hq && claude
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
npm install -g @indigoai/hq-cli
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
indigoai/hq/
├── packages/
│   ├── create-hq/     # npx create-hq installer
│   ├── hq-cli/        # hq modules|sync management CLI
│   └── hq-cloud/      # S3 sync engine
├── apps/
│   └── web/           # PWA dashboard (hq.indigoai.com)
├── infra/             # AWS infrastructure (SST)
└── template/          # HQ template distributed to users
```

## Packages

| Package | npm | Purpose |
|---------|-----|---------|
| `create-hq` | [![npm](https://img.shields.io/npm/v/create-hq)](https://www.npmjs.com/package/create-hq) | One-time installer |
| `@indigoai/hq-cli` | [![npm](https://img.shields.io/npm/v/@indigoai/hq-cli)](https://www.npmjs.com/package/@indigoai/hq-cli) | Ongoing management |
| `@indigoai/hq-cloud` | [![npm](https://img.shields.io/npm/v/@indigoai/hq-cloud)](https://www.npmjs.com/package/@indigoai/hq-cloud) | Cloud sync engine |

## Publishing

Packages are published to npm automatically when a version tag is pushed:

```bash
git tag v5.1.0
git push origin v5.1.0
```

The workflow validates that the tag version matches all `package.json` versions, then publishes `@indigoai/hq-cloud`, `@indigoai/hq-cli`, and `create-hq` in order.

**Required secret:** `NPM_TOKEN` — an npm access token with publish permissions. Configure it in the repository's Settings > Secrets > Actions.

## License

MIT
