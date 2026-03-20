# hq-architecture-patterns

| File | Title | Summary | Confidence | Updated |
|------|-------|---------|------------|---------|
| [session-persistence-threads.md](session-persistence-threads.md) | Session Persistence via Thread Files | Persist session state as JSON files in a `workspace/threads/` directory. Each file captures git s... | 0.8 | 2026-03-20 |
| [file-conflict-prevention.md](file-conflict-prevention.md) | hq-starter-kit File Conflict Prevention: Sequential Execution, Not File Locking | hq-starter-kit prevents file conflicts through **sequential story execution**, not file-level loc... | 0.8 | 2026-03-20 |
| [hook-profiles.md](hook-profiles.md) | Hook Profiles: Runtime-Configurable Hook Sets | Instead of all hooks firing unconditionally, route every hook through a **gate script** that chec... | 0.8 | 2026-03-20 |
| [append-only-execution-state.md](append-only-execution-state.md) | Append-Only JSONL for Execution State | Store execution state as append-only JSONL files rather than mutable JSON. Each line records a st... | 0.5 | 2026-03-20 |
| [company-manifest-isolation.md](company-manifest-isolation.md) | Company Manifest and Credential Isolation | A single `companies/manifest.yaml` maps every company to its resources: repos, settings, skills, ... | 0.5 | 2026-03-20 |
| [skill-composition-chains.md](skill-composition-chains.md) | Skill Composition Chains | Skills declare dependencies as ordered chains. A composition skill (e.g., `full-stack`) doesn't i... | 0.5 | 2026-03-20 |
