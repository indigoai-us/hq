# HQ Git Remotes

HQ is a fork chain: source → public fork → private fork.

## Remotes

| Remote | Repo | Push |
|--------|------|------|
| `origin` | `hassaans/hq-starter-kit-internal` (private) | Enabled — primary working repo |
| `public` | `hassaans/hq-starter-kit` (public fork) | Disabled — use explicit URL |
| `upstream` | `coreyepstein/hq-starter-kit` (source) | Disabled — use explicit URL |

Push is disabled on `upstream` and `public` to prevent accidentally pushing personal content. Direct push to `origin` only.

## Personal vs. Shareable

Personal (never push to upstream/public):
- `agents.md`, `companies/personal/`
- `workspace/`, `settings/`
- `companies/*/knowledge/`, `companies/*/settings/`, `companies/*/data/`
- `.claude/settings.local.json`
- `.claude/commands/`, `.claude/skills/`, `.claude/hooks/`

Shareable (safe to contribute upstream):
- `knowledge/` (bundled, non-company)
- `workers/public/`
- `scripts/`, `modules/`
- `.gitignore`, `CLAUDE.md` (structural changes only)

## Workflows

### Pull updates from source
```bash
git fetch upstream
git merge upstream/main
```

### Push to origin (routine)
```bash
git push origin
```

### Contribute back to source
Create a clean branch from upstream, make only shareable changes, push via explicit URL:

```bash
git fetch upstream
git checkout -b feature/my-change upstream/main
# ... make non-personal changes ...
git push https://github.com/coreyepstein/hq-starter-kit.git feature/my-change
gh pr create --repo coreyepstein/hq-starter-kit
```

### Sync public fork
Cherry-pick or merge only non-personal commits:

```bash
git fetch upstream
git checkout -b sync-public upstream/main
# cherry-pick shareable commits from main
git push https://github.com/hassaans/hq-starter-kit.git sync-public:main
```
