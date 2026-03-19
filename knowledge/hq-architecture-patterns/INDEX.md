# hq-architecture-patterns

| File | Title | Summary | Confidence | Updated |
|------|-------|---------|------------|---------|
| [append-only-execution-state.md](append-only-execution-state.md) | Append-Only JSONL for Execution State | Store execution state as append-only JSONL files rather than mutable JSON. Each line records a st... | 0.5 | 2026-03-20 |
| [hook-profiles.md](hook-profiles.md) | Hook Profiles: Runtime-Configurable Hook Sets | Instead of all hooks firing unconditionally, route every hook through a **gate script** that chec... | 0.5 | 2026-03-20 |
| [session-persistence-threads.md](session-persistence-threads.md) | Session Persistence via Thread Files | Persist session state as JSON files in a `workspace/threads/` directory. Each file captures git s... | 0.5 | 2026-03-20 |
