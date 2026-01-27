---
description: Launch Pure Ralph Loop - external terminal orchestrator for autonomous PRD execution
allowed-tools: Read, Write, Bash, AskUserQuestion, Glob
argument-hint: <project-name> [-m] [--target-repo <path>]
---

# /pure-ralph - Pure Ralph Loop Launcher

Launch an external terminal running the canonical Ralph loop for autonomous PRD execution.

**Arguments:** $ARGUMENTS

## What This Does

Spawns a **visible terminal window** running the Pure Ralph orchestrator - a for-loop that:
- Executes one task per fresh Claude session
- Updates PRD on completion
- Creates atomic commits per task
- Self-evolves prompts through learnings

The terminal runs independently, freeing you to continue other work while PRD executes.

## Usage

```bash
# Execute a project PRD (auto mode - loops automatically)
/pure-ralph my-project

# Execute in manual mode (interactive TUI, close windows manually)
/pure-ralph my-project -m

# Execute with explicit target repo
/pure-ralph my-project --target-repo C:/workspace/my-app
```

## Modes

| Mode | Flag | Behavior |
|------|------|----------|
| **Auto** (default) | none | Uses `-p` flag, auto-exits after each task, fully autonomous |
| **Manual** | `-m` | Interactive TUI, see chain of thought, manually close windows |

## Process

### 1. Parse Arguments

Extract project name, manual mode flag, and optional target repo from `$ARGUMENTS`.

```javascript
const args = "$ARGUMENTS".trim().split(/\s+/)
const manualMode = args.includes('-m')
const filteredArgs = args.filter(a => a !== '-m')
const projectName = filteredArgs[0]
const targetRepoIndex = filteredArgs.indexOf('--target-repo')
const targetRepo = targetRepoIndex >= 0 ? filteredArgs[targetRepoIndex + 1] : null
```

If no project name provided, **scan for PRDs with incomplete tasks**:

1. Use Glob to find all `projects/*/prd.json` files
2. Read each PRD and check for tasks where `passes` is false/null
3. Build a list of projects with remaining work:
   ```
   project-name: X/Y tasks complete
   ```
4. Use AskUserQuestion to let user pick which project to run:
   ```
   Which project would you like to execute?

   1. ralph-test (0/3 tasks complete)
   2. purist-ralph-loop (7/8 tasks complete)
   3. other-project (2/5 tasks complete)
   ```
5. If no projects have incomplete tasks, show:
   ```
   All projects complete! No PRDs have remaining tasks.

   To create a new project: /prd
   ```

### 2. Validate Project

Check that `projects/{project-name}/prd.json` exists.

```bash
# Check PRD exists
ls projects/{project-name}/prd.json
```

If not found:
```
Project not found: {project-name}

Looking for: projects/{project-name}/prd.json

Available projects:
  - (list from projects/*/prd.json)
```

### 3. Read PRD and Resolve Target Repo

Read the PRD to get `metadata.target_repo` if not provided via argument:

```javascript
const prd = JSON.parse(read(`projects/${projectName}/prd.json`))
const targetRepo = argTargetRepo || prd.target_repo || prd.metadata?.target_repo
```

If no target repo found anywhere:
```
Target repository not specified.

Please provide --target-repo or add target_repo to PRD metadata.

Example: /pure-ralph {project-name} --target-repo C:/workspace/my-app
```

Validate target repo exists:
```bash
# Check target repo exists
ls {target-repo}
```

### 4. Check Terminal Settings

Read `settings/pure-ralph.json`:

```javascript
const settings = JSON.parse(read('settings/pure-ralph.json'))
const terminalType = settings.terminal.type
const supportedTerminals = settings.supported_terminals
```

### 5. Prompt for Terminal if Not Set

If `terminal.type` is `null`, detect platform and prompt user to select:

**Detect Platform:**
```bash
# On Windows
$env:OS  # Returns "Windows_NT"

# On Mac/Linux
uname -s  # Returns "Darwin" or "Linux"
```

**Filter terminals by platform:**
```javascript
const platform = detectPlatform() // "windows", "macos", or "linux"
const available = Object.entries(supportedTerminals)
  .filter(([key, val]) => val.platform.includes(platform))
```

**Ask user with AskUserQuestion:**

For Windows:
```
Terminal Selection:
Which terminal should Pure Ralph use?

1. PowerShell (default on Windows)
2. Windows Terminal (modern with tabs)
```

For macOS:
```
Terminal Selection:
Which terminal should Pure Ralph use?

1. Bash (default shell)
2. iTerm (advanced features)
```

For Linux:
```
Terminal Selection:
Default terminal (Bash) will be used.
```

**Save selection:**

Update `settings/pure-ralph.json`:
```json
{
  "terminal": {
    "type": "{selected}",
    "configured_at": "{ISO8601}"
  },
  ...
}
```

### 6. Build Launch Command

Based on terminal type, platform, and manual mode flag:

**If manual mode (`-m` flag):** Add `-Manual` (PowerShell) or `--manual` (bash) to the command.

**PowerShell (Windows):**
```powershell
# Auto mode (default)
Start-Process powershell -ArgumentList "-NoExit", "-File", "C:/my-hq/.claude/scripts/pure-ralph-loop.ps1", "-PrdPath", "{prd_path}", "-TargetRepo", "{target_repo}"

# Manual mode (-m flag)
Start-Process powershell -ArgumentList "-NoExit", "-File", "C:/my-hq/.claude/scripts/pure-ralph-loop.ps1", "-PrdPath", "{prd_path}", "-TargetRepo", "{target_repo}", "-Manual"
```

**Windows Terminal (Windows):**
```powershell
# Auto mode (default)
Start-Process wt -ArgumentList "powershell", "-NoExit", "-File", "C:/my-hq/.claude/scripts/pure-ralph-loop.ps1", "-PrdPath", "{prd_path}", "-TargetRepo", "{target_repo}"

# Manual mode (-m flag)
Start-Process wt -ArgumentList "powershell", "-NoExit", "-File", "C:/my-hq/.claude/scripts/pure-ralph-loop.ps1", "-PrdPath", "{prd_path}", "-TargetRepo", "{target_repo}", "-Manual"
```

**Bash (macOS/Linux):**
```bash
# macOS - open new Terminal.app window (add --manual if -m flag)
osascript -e 'tell app "Terminal" to do script "{hq_path}/.claude/scripts/pure-ralph-loop.sh --prd-path {prd_path} --target-repo {target_repo} [--manual]"'

# Linux - use x-terminal-emulator or gnome-terminal
gnome-terminal -- bash -c "{hq_path}/.claude/scripts/pure-ralph-loop.sh --prd-path {prd_path} --target-repo {target_repo} [--manual]; exec bash"
```

**iTerm (macOS):**
```bash
osascript -e 'tell app "iTerm" to create window with default profile command "{hq_path}/.claude/scripts/pure-ralph-loop.sh --prd-path {prd_path} --target-repo {target_repo} [--manual]"'
```

### 7. Execute Launch

Run the appropriate launch command via Bash tool.

### 8. Provide Monitoring Feedback

After successful launch:

```
Pure Ralph Loop Launched

Project: {project-name}
PRD: projects/{project-name}/prd.json
Target: {target_repo}
Terminal: {terminal_name}

Monitoring:
  Log file: workspace/orchestrator/{project-name}/pure-ralph.log
  Watch: tail -f workspace/orchestrator/{project-name}/pure-ralph.log

The loop is running in the external terminal.
- Each task spawns a fresh Claude session
- PRD updates automatically as tasks complete
- Commits created per task

To check progress:
  - Watch the terminal window
  - Check PRD: cat projects/{project-name}/prd.json | jq '.features[] | {id, passes}'
  - Check log: cat workspace/orchestrator/{project-name}/pure-ralph.log
```

## Terminal Configuration Reference

Stored in `settings/pure-ralph.json`:

| Type | Platform | Command | Description |
|------|----------|---------|-------------|
| powershell | Windows | powershell.exe | Default Windows shell |
| windows-terminal | Windows | wt.exe | Modern terminal with tabs |
| bash | macOS/Linux | bash | Default Unix shell |
| iterm | macOS | open -a iTerm | Advanced macOS terminal |

## Rules

- **Always spawn external terminal** - The loop runs independently
- **One project at a time** - Don't launch multiple loops for same project
- **Respect terminal preference** - Use saved setting, only prompt if null
- **Validate before launch** - Confirm PRD and target repo exist
- **Provide monitoring paths** - User should know how to observe progress

## Integration

### With /prd
```bash
/prd my-project              # Create PRD
/pure-ralph my-project       # Execute PRD
```

### With /run-project
```
/pure-ralph runs EXTERNALLY in a terminal (autonomous)
/run-project runs INTERNALLY via sub-agents (managed)
```

### With /checkpoint
```bash
# Pure Ralph handles its own checkpointing via PRD notes
# No need for manual /checkpoint during execution
```
