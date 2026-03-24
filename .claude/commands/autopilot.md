---
description: Run bd-manager for all companies — fully autonomous task execution
allowed-tools: Read, Bash, Glob, Grep
---

# /autopilot — Run All Companies

Process every company in the manifest by spawning a bd-manager agent for each one. Tasks are executed sequentially, one company at a time.

## Procedure

### 1. Read the manifest

```bash
cat companies/manifest.yaml
```

Parse the YAML to extract all company slugs (the keys under `companies:`).

### 2. Process each company

For each company slug from the manifest, run a bd-manager agent:

```bash
./companies/ghq/tools/ask-claude.sh -c <SLUG> -w "$(pwd)" -t bd-manager "<SLUG>"
```

Process companies **one at a time, sequentially**. Wait for each bd-manager to finish before starting the next.

Capture stdout from each run for the final report. Note whether the manager succeeded, failed, or had partial results.

If a bd-manager fails or errors out, log the failure and continue to the next company. Do not abort the entire run.

### 3. Print summary

After all companies have been processed, print a structured report:

```
## Autopilot Summary

Companies processed: <N>

### Results

#### <Company Name> (<slug>)
- Status: success | partial | failed
- Tasks found: <N>
- Completed: <N>
- Failed: <N>
- Details: <brief summary from bd-manager output>

#### <Next Company> (<slug>)
...

### Errors
- <slug>: <error description> (if any)

### Notes
<any observations, assumptions, or issues encountered>
```

## Rules

- **No file modifications.** This command only coordinates — bd-manager and its sub-agents handle all file changes.
- **Sequential execution.** One company at a time, never parallel.
- **Fail-forward.** If one company's bd-manager fails, log it and continue to the next.
- **No arguments required.** `/autopilot` processes all companies from the manifest automatically.
