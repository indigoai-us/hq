# agent-tooling

| File | Title | Summary | Confidence | Updated |
|------|-------|---------|------------|---------|
| [anchoring-cwd-in-sub-agent-prompts.md](anchoring-cwd-in-sub-agent-prompts.md) | Anchoring CWD Awareness in Sub-Agent Prompts | Sub-agents spawned via `claude -p` reliably lose CWD context; prompt-level instructions alone are... | 0.8 | 2026-03-25 |
| [cli-schema-generation-for-agents.md](cli-schema-generation-for-agents.md) | CLI Schema Generation Patterns for Agent Tool Calling | Patterns for generating structured tool schemas from Go CLI frameworks so agents get validated pa... | 0.8 | 2026-03-25 |
| [ophis-pflag-json-schema-mapping.md](ophis-pflag-json-schema-mapping.md) | Ophis pflag-to-JSON-Schema Type Mapping | Ophis maps pflag flag types to JSON Schema via an explicit type-switch — it does not introspect t... | 0.8 | 2026-03-25 |
| [preventing-hallucinated-cli-flags.md](preventing-hallucinated-cli-flags.md) | Preventing Hallucinated CLI Flags in Agent Templates | Agents repeatedly hallucinate invalid CLI flags (e.g. `bd children --short`) when templates don't... | 0.8 | 2026-03-24 |
| [agent-cwd-failures-and-mitigations.md](agent-cwd-failures-and-mitigations.md) | Agent CWD Failures: Why Subprocesses Miss the Right Working Directory | Agent subprocesses default to the repo root CWD, not the directory their prompts specify. | 0.8 | 2026-03-24 |
| [cli-working-directory-flags-for-agents.md](cli-working-directory-flags-for-agents.md) | CLI Working Directory Flags for Agent-Friendly Tools | CLI tools used by agents should accept a working-directory flag (`-C <dir>`) to eliminate `cd && ... | 0.8 | 2026-03-24 |
| [tool-design-principles.md](tool-design-principles.md) | Tool Design Principles for Autonomous Agents | Tools are an agent's hands — they determine what the agent can actually do. Poorly designed tools... | 0.9 | 2026-03-20 |
