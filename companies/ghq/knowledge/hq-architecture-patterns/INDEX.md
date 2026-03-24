# hq-architecture-patterns

| File | Title | Summary | Confidence | Updated |
|------|-------|---------|------------|---------|
| [reviewer-agent-self-id-gap.md](reviewer-agent-self-id-gap.md) | Reviewer Agent Self-Identification Gap: Why reviewer_id Is Always 'manual' | Reviewer agents always write `reviewer_id: "manual"` because their own run ID is never injected i... | 0.8 | 2026-03-25 |
| [session-persistence-threads.md](session-persistence-threads.md) | Session Persistence via Thread Files | Persist session state as JSON files in a `workspace/threads/` directory. Each file captures git s... | 0.8 | 2026-03-20 |
| [modules-system.md](modules-system.md) | hq-starter-kit Modules System: merge/link/copy Distribution Strategies | hq-starter-kit's modules system distributes HQ updates via a `modules/modules.yaml` manifest with... | 0.9 | 2026-03-20 |
| [file-conflict-prevention.md](file-conflict-prevention.md) | hq-starter-kit File Conflict Prevention: Sequential Execution, Not File Locking | hq-starter-kit prevents file conflicts through **sequential story execution**, not file-level loc... | 0.8 | 2026-03-20 |
| [policies-vs-learned-rules.md](policies-vs-learned-rules.md) | hq-starter-kit Policies vs GHQ Inline Learned Rules | Two complementary approaches to governing agent behavior: hq-starter-kit uses structured policy f... | 0.8 | 2026-03-20 |
| [hook-profiles.md](hook-profiles.md) | Hook Profiles: Runtime-Configurable Hook Sets | Instead of all hooks firing unconditionally, route every hook through a **gate script** that chec... | 0.8 | 2026-03-20 |
| [append-only-execution-state.md](append-only-execution-state.md) | Append-Only JSONL for Execution State | Store execution state as append-only JSONL files rather than mutable JSON. Each line records a st... | 0.5 | 2026-03-20 |
| [beads-ghq-knowledge-integration.md](beads-ghq-knowledge-integration.md) | Beads–GHQ Knowledge Integration Patterns | Beads (task domain) and GHQ (knowledge domain) are complementary systems that can be wired togeth... | 0.8 | 2026-03-20 |
| [company-manifest-isolation.md](company-manifest-isolation.md) | Company Manifest and Credential Isolation | A single `companies/manifest.yaml` maps every company to its resources: repos, settings, skills, ... | 0.5 | 2026-03-20 |
| [skill-composition-chains.md](skill-composition-chains.md) | Skill Composition Chains | Skills declare dependencies as ordered chains. A composition skill (e.g., `full-stack`) doesn't i... | 0.5 | 2026-03-20 |
| [token-optimization-env-vars.md](token-optimization-env-vars.md) | Claude Code Token Optimization Environment Variables | Four env vars control Claude Code's token spend and reasoning depth — understanding their interac... | 0.9 | 2026-03-20 |
