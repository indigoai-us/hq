# hq repo

Monorepo for the HQ distribution: `hq-cli` package manager, `create-hq` scaffolder, `hq-cloud` sync daemon, and the Astro docs site.

## Key Locations

| Path | What's there |
|------|-------------|
| `packages/hq-cli/src/commands/` | All CLI command implementations |
| `packages/hq-cli/src/utils/` | Registry client, dep resolver, installed-packages, trusted-publishers |
| `packages/hq-cli/src/types/package-types.ts` | `HQPackage`, `InstalledPackage`, `InstalledPackages` interfaces |
| `packages/hq-cli/src/schemas/hq-package.schema.json` | JSON Schema for hq-package.yaml |
| `template/` | HQ starter template — published with `create-hq` |
| `template/core.yaml` | Kernel file classification (locked/reviewable/open + checksums) |
| `template/.claude/hooks/protect-core.sh` | PreToolUse hook that enforces locked files |
| `template/.claude/hooks/hook-gate.sh` | Hook routing by HQ_HOOK_PROFILE |
| `packs/` | Published worker packs (content-team, dev-team, social-team) |
| `apps/docs/src/content/docs/` | Astro documentation site source |

## Package Ecosystem

### hq-package.yaml

Every installable package declares type, version, exposes (workers/commands/skills/knowledge), requires (package deps), and optional lifecycle hooks. JSON Schema at `packages/hq-cli/src/schemas/hq-package.schema.json`.

### installed.json

Package state stored at `packages/installed.json` (relative to HQ root, not this repo). Format: `{ version: "1", packages: Record<name, InstalledPackage> }`. The `files` array on each entry drives removal — every installed file path must be tracked here.

### Registry

Default: `https://admin.getindigo.ai`. Override with `HQ_REGISTRY_URL` env var. Auth stored at `~/.hq/auth.json`. Registry client: `packages/hq-cli/src/utils/registry-client.ts`.

### Offline fallback

If the registry returns non-2xx, `hq install` falls back to `git clone` using the `repo` field in the package manifest.

## Kernel Governance

`core.yaml` at the template root classifies files as `locked` (checksummed, blocked on edit), `reviewable` (warn on edit), or `open`. The `protect-core.sh` hook reads core.yaml and computes live SHA256 checksums to enforce the locked tier.

When updating locked files in the template, regenerate checksums in `core.yaml`:

```bash
sha256sum template/.claude/CLAUDE.md   # compute new checksum
# update core.yaml checksums block
```

## Build & Test

```bash
npm run build        # Build all packages
npm run typecheck    # TypeScript check
npm test             # Run all tests (vitest)
npm run test:watch   # Watch mode
```

Tests live alongside source files as `*.test.ts`. Use `vitest` — do not use Jest.

## Packs

Worker packs in `packs/` mirror the template structure. Each pack has:
- `hq-package.yaml` — registry manifest
- `worker.yaml` — worker definition
- `skills/` — skill markdown files
- `README.md`

To add a new pack: copy an existing pack directory, update `hq-package.yaml` name/description/version, then `hq publish` from the pack directory.

## Template Updates

Changes to `template/` are published with `create-hq`. Test locally before bumping version:

```bash
node packages/create-hq/dist/index.js ~/test-hq
```

After template changes that touch locked files, update checksums in `template/core.yaml`.

## Gotchas

- `protect-core.sh` uses **relative** paths from HQ root, not absolute. Normalise with `realpath --relative-to` when computing paths for comparison.
- `hook-gate.sh` must be in the `protect-core` allowlist before it can gate other hooks — both are in `.claude/hooks/`, which is itself a locked path.
- `installed.json` paths must be relative to the HQ root (not the repo or package root). Wrong paths cause `hq remove` and `hq doctor` integrity checks to fail.
- Registry client retries on 5xx and network errors (max 2 retries) but does NOT retry on 4xx. Auth errors (401) throw `RegistryAuthError` — catch separately to show a helpful message.
