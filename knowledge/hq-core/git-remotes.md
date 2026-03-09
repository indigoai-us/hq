# HQ Git Remotes

HQ is a fork chain: source → public fork → private fork.

## Remotes

| Remote | Repo | Purpose |
|--------|------|---------|
| `origin` | `hassaans/hq-starter-kit-internal` (private) | Primary working repo |
| `public` | `hassaans/hq-starter-kit` (public fork) | Public fork, receives updates |
| `upstream` | `coreyepstein/hq-starter-kit` (source) | Original source, pull updates from here |

## Workflows

### Pull updates from source
```bash
git fetch upstream
git merge upstream/main
```

### Push to your repos
```bash
git push origin    # private
git push public    # public fork
```

### Contribute back to source
Push a branch to `upstream` and open a PR — don't push directly to `upstream/main`.

```bash
git checkout -b feature/my-change
# ... make changes ...
git push upstream feature/my-change
gh pr create --repo coreyepstein/hq-starter-kit
```
