---
description: Run bd-manager for all companies — fully autonomous task execution
allowed-tools: Read, Bash, Glob, Grep
---

# /autopilot — Run All Companies

Process every company in the manifest by spawning agents. Reviews previous runs in parallel with new work.

## Procedure

### 1. Read the manifest

```bash
cat companies/manifest.yaml
```

Parse the YAML to extract all company slugs (the keys under `companies:`).

### 2. Resolve repo root

```bash
REPO_ROOT="$(git rev-parse --show-toplevel)"
```

Use `REPO_ROOT` for all `-w` flags below. Never use `$(pwd)`.

### 3. Start retrospective loop (async)

Kick off the retrospective loop first — it reviews previous unreviewed runs while new work proceeds:

```bash
./companies/hq/tools/ask-claude.sh -a -c hq -w <REPO_ROOT> -t bd-retrospective-loop ""
```

Note the agent ID from stderr for later.

### 4. Process each company (async)

For each company slug from the manifest, spawn a bd-manager agent asynchronously:

```bash
./companies/hq/tools/ask-claude.sh -a -c <SLUG> -w <REPO_ROOT> -t bd-manager "<SLUG>"
```

Spawn all companies. Note each agent ID.

If a bd-manager fails to spawn, log the failure and continue to the next company.

### 5. Wait for all agents to complete

Poll each agent (retro loop + all bd-managers) until all are done:

```bash
cat <REPO_ROOT>/.agents/runs/<AGENT_ID>/status
```

Check every 30 seconds. An agent is complete when status is `done` or `error`.

Once all agents have finished, read each one's result:

```bash
cat <REPO_ROOT>/.agents/runs/<AGENT_ID>/result.txt
```

### 6. Print summary

```
## Autopilot Summary

Companies processed: <N>

### Results

#### <Company Name> (<slug>)
- Status: success | partial | failed
- Agent: <agent-id>
- Details: <brief summary from bd-manager output>

#### <Next Company> (<slug>)
...

### Errors
- <slug>: <error description> (if any)

### Retrospective
- Agent: <retro-agent-id>
- Runs reviewed: <N>
- Pass: <N>
- Fail: <N>
- Issues filed: <list>

### Notes
<any observations, assumptions, or issues encountered>
```

## Rules

- **No file modifications.** This command only coordinates — bd-manager and its sub-agents handle all file changes.
- **Async everything.** All agents run via `ask-claude.sh -a`. Poll for completion.
- **Fail-forward.** If one company's bd-manager fails, log it and continue.
- **No arguments required.** `/autopilot` processes all companies from the manifest automatically.
