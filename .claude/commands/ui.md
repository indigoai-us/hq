---
description: Generate and serve ephemeral UIs from declarative specs
allowed-tools: Bash, Read, Glob, Write
argument-hint: [spec-name]
visibility: public
---

# /ui - Ephemeral UI Launcher

Generate and serve single-file Node HTTP servers from declarative UI specs. No persistent code, no repos, no dependencies.

**Arguments:** $ARGUMENTS

## Process

### 1. Parse Arguments

Extract the spec name from `$ARGUMENTS`.

If no arguments (empty or whitespace), **list available specs** and exit:

1. Scan `knowledge/hq-core/ui-specs/` for `*.md` files using Glob.
2. For each file found, read the first line (should be a `# Title`) to get the spec name.
3. Display:

```
Available UI Specs:

  projects-dashboard    Projects Dashboard UI Spec
  worker-metrics        Worker Metrics Dashboard

Usage: /ui {spec-name}

Example: /ui projects-dashboard
```

If no specs found:
```
No UI specs found in knowledge/hq-core/ui-specs/.
Create a spec following the runtime protocol: knowledge/hq-core/ephemeral-ui-protocol.md
```

Then stop.

### 2. Load Protocol and Spec

If a spec name was provided:

1. **Read the runtime protocol:**
   ```
   knowledge/hq-core/ephemeral-ui-protocol.md
   ```
   This contains the server pattern, data access helpers, theme tokens, and minimal example.

2. **Read the UI spec:**
   ```
   knowledge/hq-core/ui-specs/{spec-name}.md
   ```
   If the file does not exist, report:
   ```
   Spec not found: knowledge/hq-core/ui-specs/{spec-name}.md

   Available specs:
   ```
   Then list available specs (same as no-args behavior) and stop.

### 3. Generate the Server

Using the protocol patterns and the spec's declarative description, generate a **single `.js` file** that:

1. Uses ONLY Node built-ins: `http`, `fs`, `fs/promises`, `path`, `url`, `os`
2. Follows the server structure from the protocol (route dispatch, readBody, readJson, writeJson helpers)
3. Implements all routes declared in the spec's "Server Routes" section
4. Embeds the full HTML page as a template literal via `renderHTML()`
5. Embeds CSS (theme tokens from protocol + spec-specific styles) as a `CSS` constant
6. Embeds client-side JavaScript as a `CLIENT_JS` constant
7. Implements all interactions described in the spec
8. Uses `HQ_ROOT` env var (default `C:\\hq`) with `path.join()` for all filesystem paths
9. Handles `PORT` env var (default `3100`)
10. Binds to `localhost`
11. Handles `SIGINT` and `SIGTERM` for graceful shutdown

**Key generation rules:**
- The spec describes WHAT to build; the protocol describes HOW to build it
- Use the protocol's minimal example as a structural skeleton
- Include all CSS from the protocol's theme block plus any spec-specific CSS
- Escape backticks in template literals (use `\`` or string concatenation)
- All filesystem paths via `path.join(HQ_ROOT, ...)` for Windows compatibility
- HTML-escape user data to prevent XSS (include an `esc()` function client-side)

### 4. Write to Temp Directory

Write the generated server to a temporary location:

```javascript
// Use os.tmpdir() for cross-platform temp path
// Write to: {tmpdir}/hq-ui-{spec-name}/server.js
```

Use the Bash tool to create the directory and the Write tool to write the file:

```bash
mkdir -p "$(node -e "const os=require('os');const p=require('path');console.log(p.join(os.tmpdir(),'hq-ui-{spec-name}'))")"
```

Then write `server.js` into that directory.

### 5. Start the Server

Try to start the server on the default port. If it fails (port in use), try the next port.

```bash
# Try default port first
node "{tmpdir}/hq-ui-{spec-name}/server.js"
```

Run via Bash tool with `run_in_background: true`.

**Port conflict handling:** If the server fails to start (port in use), re-generate with `PORT={next-port}` env var and try again. Try ports 3100, 3101, 3102 in sequence. After 3 failures, report the error and stop.

### 6. Report to User

After the server starts successfully, display:

```
Ephemeral UI: {Spec Title}
Server:       http://localhost:{port}
Spec:         knowledge/hq-core/ui-specs/{spec-name}.md
Temp:         {tmpdir}/hq-ui-{spec-name}/server.js

Open http://localhost:{port} in your browser.

To stop: kill the background process or close this session.
The temp directory is cleaned up on OS reboot.
```

## Error Handling

- **Spec not found:** List available specs with helpful message
- **Port in use:** Auto-increment port (3100 -> 3101 -> 3102)
- **Generation failure:** Report error with spec path so user can check the spec
- **Node not found:** Report "Node.js is required. Install from https://nodejs.org"

## Rules

- Generated servers are ephemeral -- they exist only in temp directories
- Never write generated code to the HQ repo or any tracked directory
- The spec is the source of truth; generated code is disposable
- Always read both the protocol AND the spec before generating
- Use the protocol's theme tokens verbatim (do not modify colors)
- Template literal escaping is critical -- test backtick handling

## Examples

```
/ui                          # List available specs
/ui projects-dashboard       # Generate and serve the projects dashboard
/ui worker-metrics           # Generate and serve the worker metrics dashboard
```
