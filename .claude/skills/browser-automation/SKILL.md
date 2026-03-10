---
name: browser-automation
description: Automate websites and desktop apps using agent-browser CLI. Uses headless Chromium for web and --native mode for desktop applications.
---

# Browser Automation

Interact with websites and desktop applications using `agent-browser` CLI. Choose the right mode based on the target:

- **Websites**: `agent-browser` (default Playwright/Chromium engine)
- **Desktop apps**: `agent-browser --native` (native Rust daemon, no Node.js/Playwright)

No MCP servers required. All interaction happens via Bash tool calling `agent-browser` commands.

## Quick Reference

### Observe

```bash
agent-browser snapshot -ic              # Interactive elements, compact
agent-browser screenshot                # Visual capture
agent-browser screenshot --annotate     # Numbered labels for vision
agent-browser get text @e1              # Text content of element
agent-browser get url                   # Current URL
agent-browser get title                 # Page title
```

### Act

```bash
agent-browser open <url>                # Navigate
agent-browser click @e3                 # Click by ref
agent-browser fill @e5 "value"          # Clear + type
agent-browser type @e5 "value"          # Append text
agent-browser press Enter               # Keyboard
agent-browser select @e7 "Option A"     # Dropdown
agent-browser check @e8                 # Checkbox
agent-browser scroll down 500           # Scroll
agent-browser wait 2000                 # Wait ms
agent-browser wait ".loading"           # Wait for element
```

### Desktop Apps (--native)

```bash
agent-browser --native snapshot -ic     # Desktop app accessibility tree
agent-browser --native click @e2        # Click native UI element
agent-browser --native fill @e4 "text"  # Fill native input
agent-browser --native screenshot       # Capture desktop app
agent-browser --native press Tab        # Keyboard in native app
```

## Core Loop

Follow this observe-think-act cycle for all automation tasks:

### 1. Connect to Target

**Website:**
```bash
agent-browser open <url>
agent-browser wait --load networkidle
```

**Desktop app (native):**
```bash
agent-browser --native snapshot -ic
```

### 2. Observe

Always snapshot before acting. Use interactive + compact flags to reduce noise:

```bash
agent-browser snapshot -ic
```

Read the accessibility tree output. Each element has a ref like `@e1`, `@e2`, etc. Use these refs in subsequent commands.

If the snapshot is too large, scope it:
```bash
agent-browser snapshot -ic -s "main"         # Scope to <main>
agent-browser snapshot -ic -s ".modal"       # Scope to modal
agent-browser snapshot -ic -d 3              # Limit depth
```

### 3. Act

Use refs from the snapshot to interact:

```bash
agent-browser click @e5
agent-browser fill @e3 "search query"
agent-browser press Enter
```

After acting, always re-snapshot to observe the result before the next action.

### 4. Verify

After completing a sequence of actions, verify the outcome:

```bash
agent-browser snapshot -ic                   # Check final state
agent-browser get text ".success-message"    # Read specific content
agent-browser screenshot result.png          # Visual confirmation
```

## Command Chaining

Chain related commands with `&&` for efficiency (browser session persists):

```bash
agent-browser fill @e1 "user@example.com" && agent-browser fill @e2 "password" && agent-browser click @e3
```

```bash
agent-browser open example.com && agent-browser wait --load networkidle && agent-browser snapshot -ic
```

## Session Management

Use named sessions to keep browser state between tool calls:

```bash
agent-browser --session myapp open example.com
agent-browser --session myapp snapshot -ic
agent-browser --session myapp click @e2
```

Use `--session-name` for persistent state (cookies, localStorage survive restarts):

```bash
agent-browser --session-name myapp open example.com
```

## Advanced

### Connecting to Running Browsers

```bash
agent-browser --auto-connect snapshot        # Auto-discover Chrome
agent-browser --cdp 9222 snapshot            # Connect by CDP port
agent-browser connect ws://host:port/path    # WebSocket URL
```

### Diff and Monitoring

```bash
agent-browser diff snapshot                  # Compare to previous snapshot
agent-browser diff screenshot --baseline     # Compare to baseline image
agent-browser console                        # View console logs
agent-browser errors                         # View page errors
agent-browser network requests               # View network requests
```

### Screenshots for Analysis

```bash
agent-browser screenshot                     # Viewport only
agent-browser screenshot --full              # Full page
agent-browser screenshot --annotate          # Numbered element labels
agent-browser screenshot page.png            # Save to file
```

## Rules

- Always snapshot before interacting -- never guess element refs
- Re-snapshot after every significant action to observe the result
- Use `-ic` flags (interactive + compact) to keep snapshots focused
- Use `--native` for desktop apps, default mode for websites
- Chain commands with `&&` when they form a logical sequence
- Use named sessions (`--session`) when working across multiple tool calls
- If a page is loading, wait before snapshotting: `agent-browser wait --load networkidle`
- Scope snapshots with `-s` or `-d` when the page is large
- For forms, fill all fields then submit -- don't submit after each field
- Report errors from `agent-browser errors` or `agent-browser console` when debugging
