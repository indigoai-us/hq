# GHQ

GHQ is a personal operating system for orchestrating work across companies, workers, and AI — a companion to HQ designed for a group/team context.

## What is GHQ?

GHQ mirrors the structure and conventions of [HQ](https://github.com/hassaans/hq) but is scoped for shared or multi-contributor use. Where HQ is a single-user personal OS, GHQ is built for group coordination: shared workers, shared knowledge, and cross-company orchestration in a team setting.

## How GHQ differs from HQ

| Aspect | HQ | GHQ |
|--------|-----|-----|
| Scope | Single user (personal) | Group / team |
| Workers | Personal + public | Shared team workers |
| Company isolation | Per user | Per team/org |
| Credentials | `companies/*/settings/` (private) | `companies/*/settings/` (team-managed) |
| Repos | `~/repos` symlink | `~/repos` symlink |

## Directory Structure

```
.claude/          Claude agent commands, skills, hooks, and policies
companies/        Per-company knowledge, settings, and data
knowledge/        Shared knowledge bases
projects/         Active and archived projects
repos/            Symlink to ~/repos (all code repositories)
workspace/        Working files: threads, reports, orchestrator state
```

## Security

Credentials are stored in `companies/*/settings/` and are excluded from Claude's context via `.claudeignore`. This means Claude can work across companies without reading secrets directly — credentials are accessed only by the tools and workers that explicitly need them.

## Getting Started

See `.claude/commands/` for available slash commands and `workers/registry.yaml` (once scaffolded) for the worker index.
