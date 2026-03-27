# hq-package.yaml v1 Specification

## Overview

`hq-package.yaml` is the manifest format for distributable HQ packages. A package bundles one or more HQ primitives (workers, commands, skills, knowledge) into a versioned, installable unit that can be shared across HQ installations or published to the HQ registry.

Packages are installed via `hq install <package-name>` and extracted into the HQ workspace according to the install target rules defined by package type.

---

## File Location

The `hq-package.yaml` file must be placed at the root of the package tarball or repository.

---

## Fields

### `name` (string, required)

Package slug. Used as the identifier in the HQ registry and as the install target directory name where applicable.

- Must be lowercase, alphanumeric, hyphens allowed
- Must be unique within the registry
- Example: `"dev-team"`

### `type` (string, required)

Declares what kind of package this is. Controls which install target rules apply (see [Install Target Mapping](#install-target-mapping)).

Valid values:
- `worker-pack` — a collection of worker.yaml definitions
- `command-set` — a set of `.claude/commands/` markdown files
- `skill-bundle` — a set of `.claude/skills/` markdown files
- `knowledge-base` — a knowledge directory installed to `knowledge/public/`
- `company-template` — template files installed to `companies/_template/`

### `version` (string, required)

Semver version string for this release.

- Must follow [semver](https://semver.org/) format: `MAJOR.MINOR.PATCH`
- Example: `"1.0.0"`

### `minHQVersion` (string, optional)

Minimum HQ version required to install this package. If the installed HQ version is below this value, `hq install` will abort with an error.

- Must follow semver format
- Example: `"9.0.0"`

### `description` (string, required)

A short, human-readable description of what the package provides.

- Single line preferred; max 200 characters recommended
- Example: `"17 AI dev workers covering full-stack, mobile, infra, QA, security, and architecture"`

### `author` (string, required)

The author name or organization that created and maintains this package.

- Example: `"indigo"`

### `repo` (string, optional)

Git repository URL for the package source. Used as a fallback source when the registry is unavailable for offline installs.

- Must be a valid git URL (HTTPS or SSH)
- Example: `"https://github.com/getindigo/hq-dev-team"`

### `requires` (object, optional)

Declares external dependencies the package needs at runtime.

#### `requires.packages` (array of strings, optional)

List of other HQ package slugs this package depends on. The installer will ensure all listed packages are installed before installing this one.

- Each entry is a package slug (same format as `name`)
- Example: `["base-workers", "shared-skills"]`

#### `requires.services` (array of strings, optional)

List of service slugs this package requires at runtime. These are informational — the installer will warn if a required service is not configured in the target HQ installation.

- Recognized service slugs: `"slack"`, `"linear"`, `"github"`, `"vercel"`, `"aws"`, `"stripe"`, `"openai"`, `"anthropic"`
- Example: `["slack", "linear"]`

### `exposes` (object, required)

Declares what the package installs into the HQ workspace. At least one sub-array must be non-empty.

#### `exposes.workers` (array of strings, optional)

Paths within the tarball to `worker.yaml` files to install.

- Each path is relative to the tarball root
- Example: `["workers/architect/worker.yaml", "workers/backend-dev/worker.yaml"]`

#### `exposes.commands` (array of strings, optional)

Paths within the tarball to command `.md` files to install.

- Each path is relative to the tarball root
- Example: `["commands/deploy.md", "commands/rollback.md"]`

#### `exposes.skills` (array of strings, optional)

Paths within the tarball to skill `.md` files to install.

- Each path is relative to the tarball root
- Example: `["skills/e2e-testing.md", "skills/security-scan.md"]`

#### `exposes.knowledge` (array of strings, optional)

Paths within the tarball to knowledge directories or files to install.

- Each path is relative to the tarball root
- Example: `["knowledge/patterns/", "knowledge/guides/"]`

### `hooks` (object, optional)

Shell scripts to run at install lifecycle events. Each value is a path within the tarball to an executable shell script.

#### `hooks.on-install` (string, optional)

Run after all files are extracted and placed in their install targets.

- Use for: registering workers, running `qmd update`, warming caches
- Example: `"scripts/post-install.sh"`

#### `hooks.on-update` (string, optional)

Run after an existing installation is updated to a new version.

- Use for: migrating config, clearing stale caches
- Example: `"scripts/post-update.sh"`

#### `hooks.on-remove` (string, optional)

Run before files are removed from the HQ workspace.

- Use for: cleanup, deregistration
- Example: `"scripts/pre-remove.sh"`

---

## Install Target Mapping

When `hq install` unpacks a package, each item declared in `exposes` is copied to a specific location in the HQ workspace. The destination is determined by the package `type` and the `exposes` sub-key:

| Package type       | `exposes.workers` →               | `exposes.commands` →                      | `exposes.skills` →       | `exposes.knowledge` →           |
|--------------------|-----------------------------------|-------------------------------------------|--------------------------|---------------------------------|
| `worker-pack`      | `workers/public/{name}/`          | `workers/public/{name}/commands/`         | `workers/public/{name}/skills/` | `workers/public/{name}/knowledge/` |
| `command-set`      | —                                 | `.claude/commands/`                       | —                        | —                               |
| `skill-bundle`     | —                                 | —                                         | `.claude/skills/`        | —                               |
| `knowledge-base`   | —                                 | —                                         | —                        | `knowledge/public/{name}/`      |
| `company-template` | `companies/_template/workers/`    | `companies/_template/.claude/commands/`   | —                        | `companies/_template/knowledge/` |

`{name}` refers to the package `name` field value.

If a package type has `—` for a given `exposes` key, any entries in that key are ignored during install (a validation warning is emitted).

---

## Validation Rules

The installer enforces the following at install time (beyond JSON Schema validation):

1. `name` must be unique — installing a package with a conflicting name requires `--force` or `--rename`
2. `version` must be valid semver
3. `minHQVersion`, if set, must be `≤` the installed HQ version
4. `exposes` must have at least one non-empty array
5. All paths in `exposes.*` and `hooks.*` must exist within the tarball at install time
6. Hook scripts must be executable (chmod +x) or the installer will warn and skip

---

## Example

See `examples/dev-team/hq-package.yaml` for a complete valid example using the `worker-pack` type.

---

## Schema

The canonical JSON Schema for validating `hq-package.yaml` files is at:
`packages/hq-cli/src/schemas/hq-package.schema.json`

Validate a package manifest:
```bash
npx ajv-cli validate -s packages/hq-cli/src/schemas/hq-package.schema.json -d hq-package.yaml
```
