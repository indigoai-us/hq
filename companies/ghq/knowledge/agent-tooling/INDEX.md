# agent-tooling

| File | Title | Summary | Confidence | Updated |
|------|-------|---------|------------|---------|
| [preventing-hallucinated-cli-flags.md](preventing-hallucinated-cli-flags.md) | Preventing Hallucinated CLI Flags in Agent Templates | Agents repeatedly hallucinate invalid CLI flags (e.g. `bd children --short`) when templates don't... | 0.8 | 2026-03-24 |
| [agent-cwd-failures-and-mitigations.md](agent-cwd-failures-and-mitigations.md) | Agent CWD Failures: Why Subprocesses Miss the Right Working Directory | Agent subprocesses default to the repo root CWD, not the directory their prompts specify. | 0.8 | 2026-03-24 |
| [cli-working-directory-flags-for-agents.md](cli-working-directory-flags-for-agents.md) | CLI Working Directory Flags for Agent-Friendly Tools | CLI tools used by agents should accept a working-directory flag (`-C <dir>`) to eliminate `cd && ... | 0.8 | 2026-03-24 |
| [tool-design-principles.md](tool-design-principles.md) | Tool Design Principles for Autonomous Agents | Tools are an agent's hands — they determine what the agent can actually do. Poorly designed tools... | 0.9 | 2026-03-20 |
