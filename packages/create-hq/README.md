# create-hq

Scaffold a new **HQ** — Personal OS for AI Workers.

One command gives you a ready-to-use workspace with slash commands, autonomous workers, knowledge bases, and project orchestration — all built for [Claude Code](https://docs.anthropic.com/en/docs/claude-code).

## Usage

```bash
npx create-hq
```

Then open it:

```bash
cd hq
claude
/setup
```

### Options

```
create-hq [directory]     Where to create HQ (default: "hq")
  --skip-deps              Skip dependency checks
  --skip-cli               Don't prompt to install @indigoai/hq-cli
  --skip-sync              Don't prompt for cloud sync setup
```

## What You Get

| Directory | Contents |
|-----------|----------|
| `.claude/commands/` | 17+ slash commands — session management, workers, projects, content |
| `workers/` | 26 AI workers (dev team, content team, QA, security, finance) |
| `knowledge/` | Knowledge bases — Ralph methodology, design styles, security, worker framework |
| `starter-projects/` | Ready-made projects to learn from (personal assistant, social media, code worker) |
| `workspace/` | Threads, checkpoints, reports, social drafts |

## Requirements

- **Node.js** >= 18
- **Claude Code** — `npm install -g @anthropic-ai/claude-code`

Optional:
- **qmd** — local semantic search (`brew install tobi/tap/qmd`)
- **gh** — GitHub CLI
- **@indigoai/hq-cli** — module management and cloud sync

## Links

- [GitHub](https://github.com/indigoai-us/hq)
- [HQ download page](https://indigoai-us.github.io/hq/installer/docs/)

## License

MIT
