# Ephemeral UI Runtime Protocol

Single-file Node HTTP servers generated on demand from declarative UI specs. Zero npm dependencies. No persistent code.

## Single-File Server Pattern

Every ephemeral UI is one `.js` file containing:

- A Node `http` server
- All HTML, CSS, and JavaScript embedded as template literals
- All data-access logic (filesystem reads/writes) inline
- No `require()` calls beyond Node built-ins: `http`, `fs`, `fs/promises`, `path`, `url`
- No `package.json`, no `node_modules`, no build step

Run with: `node server.js`

## Server Structure

```
GET /           -> serves the full HTML page (text/html)
GET /api/*      -> JSON data endpoints (application/json)
POST /api/*     -> mutation endpoints (application/json)
```

Port defaults to `3100`. Override with `PORT` env var. Bind to `localhost`.

### Route dispatch pattern

```js
const http = require('http');
const fs = require('fs/promises');
const path = require('path');
const { URL } = require('url');

const PORT = parseInt(process.env.PORT || '3100', 10);
const HQ_ROOT = process.env.HQ_ROOT || 'C:\\hq';

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const method = req.method;

  try {
    if (method === 'GET' && url.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(renderHTML());
    } else if (method === 'GET' && url.pathname === '/api/data') {
      const data = await loadData();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    } else if (method === 'POST' && url.pathname === '/api/action') {
      const body = await readBody(req);
      await handleAction(body);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    }
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
});
```

### Reading POST bodies

```js
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
      catch (e) { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}
```

## Data Access Pattern

Servers read and write the HQ filesystem using `fs/promises` and `path.join`.

`HQ_ROOT` env var controls the base path. Defaults to `C:\hq`. All file paths are built with `path.join(HQ_ROOT, ...)` for Windows compatibility.

### Common data sources

| HQ Path | Contains |
|---------|----------|
| `projects/*/prd.json` | Project PRDs with user stories |
| `workspace/orchestrator/state.json` | Project orchestration state |
| `projects/dashboard-config.json` | Dashboard priority ordering |
| `workspace/learnings/*.json` | Learning event logs |
| `workspace/orchestrator/*/` | Per-project orchestration data |
| `workers/*/worker.yaml` | Worker definitions |

### Safe JSON reading

```js
async function readJson(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
```

### Safe JSON writing

```js
async function writeJson(filePath, data) {
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
}
```

### Directory listing

```js
async function listDirs(dirPath) {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    return entries.filter(e => e.isDirectory()).map(e => e.name);
  } catch {
    return [];
  }
}
```

## Client-Side Pattern

- Vanilla JavaScript. No React, no frameworks, no build tools.
- All CSS via custom properties (see theme below).
- `fetch()` for API calls.
- Direct DOM manipulation with `document.createElement`, `document.getElementById`, `innerHTML`.
- Event delegation on container elements where practical.

### Client-side fetch pattern

```js
async function loadData() {
  const res = await fetch('/api/data');
  return res.json();
}

async function postAction(payload) {
  const res = await fetch('/api/action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return res.json();
}
```

### HTML structure

The `renderHTML()` function returns a complete HTML document as a template literal:

```js
function renderHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Page Title</title>
  <style>${CSS}</style>
</head>
<body>
  <div id="app"></div>
  <script>${CLIENT_JS}</script>
</body>
</html>`;
}
```

Define `CSS` and `CLIENT_JS` as separate template literal constants for readability:

```js
const CSS = `
  :root { /* theme tokens here */ }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: var(--bg-primary); color: var(--text-primary); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
  /* ... component styles ... */
`;

const CLIENT_JS = `
  document.addEventListener('DOMContentLoaded', async () => {
    const data = await fetch('/api/data').then(r => r.json());
    render(data);
  });

  function render(data) {
    const app = document.getElementById('app');
    app.innerHTML = buildUI(data);
    attachListeners();
  }
  // ...
`;
```

## HQ Dark Theme

Copy-paste this CSS block into every ephemeral UI:

```css
:root {
  --bg-primary: #0D0D0F;
  --bg-secondary: #1A1A1E;
  --bg-tertiary: #242428;
  --bg-card: #1E1E22;
  --bg-elevated: #2A2A2F;

  --text-primary: #FFFFFF;
  --text-secondary: #A0A0A8;
  --text-tertiary: #6B6B73;
  --text-inverse: #0D0D0F;

  --accent-yellow: #F5C542;
  --accent-green: #4ADE80;
  --accent-red: #EF4444;
  --accent-blue: #3B82F6;

  --border-subtle: #2A2A2E;
  --border-active: #3A3A3E;

  --progress-active: #F5C542;
  --progress-complete: #4ADE80;
  --progress-track: #2A2A2E;

  --overlay-light: rgba(255, 255, 255, 0.05);
}
```

### Base reset (include in every server)

```css
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  background: var(--bg-primary);
  color: var(--text-primary);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  line-height: 1.5;
  min-height: 100vh;
}
a { color: var(--accent-blue); text-decoration: none; }
a:hover { text-decoration: underline; }
```

### Common component styles

```css
/* Card */
.card {
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  padding: 16px;
  transition: border-color 0.15s;
}
.card:hover { border-color: var(--border-active); }

/* Badge */
.badge {
  display: inline-block;
  font-size: 10px;
  font-weight: 500;
  padding: 2px 8px;
  border-radius: 9999px;
}
.badge-green { background: rgba(74,222,128,0.15); color: var(--accent-green); }
.badge-blue { background: rgba(59,130,246,0.15); color: var(--accent-blue); }
.badge-yellow { background: rgba(245,197,66,0.15); color: var(--accent-yellow); }
.badge-red { background: rgba(239,68,68,0.15); color: var(--accent-red); }

/* Button */
.btn {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 6px 12px;
  border-radius: 6px;
  border: 1px solid var(--border-subtle);
  background: var(--bg-elevated);
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}
.btn:hover { background: var(--bg-tertiary); border-color: var(--border-active); }

/* Container */
.container { max-width: 896px; margin: 0 auto; padding: 24px 16px; }

/* Header */
.header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
.header h1 { font-size: 18px; font-weight: 700; }
.header .subtitle { font-size: 12px; color: var(--text-tertiary); margin-top: 2px; }

/* Pill filters */
.pills { display: flex; gap: 8px; margin-bottom: 16px; }
.pill {
  padding: 4px 12px;
  border-radius: 9999px;
  font-size: 12px;
  border: 1px solid var(--border-subtle);
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s;
}
.pill.active { background: var(--accent-yellow); color: var(--text-inverse); border-color: var(--accent-yellow); }

/* Toast notification */
.toast {
  position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
  background: var(--bg-elevated); color: var(--text-primary);
  padding: 8px 16px; border-radius: 8px; font-size: 13px;
  border: 1px solid var(--border-subtle);
  animation: fadeInUp 0.2s ease-out;
}
@keyframes fadeInUp {
  from { opacity: 0; transform: translate(-50%, 8px); }
  to { opacity: 1; transform: translate(-50%, 0); }
}

/* Tabular numbers */
.tabnum { font-variant-numeric: tabular-nums; }
```

## Minimal Working Example

A complete hello-world server (~50 lines) that agents use as a starting skeleton:

```js
const http = require('http');
const fs = require('fs/promises');
const path = require('path');
const { URL } = require('url');

const PORT = parseInt(process.env.PORT || '3100', 10);
const HQ_ROOT = process.env.HQ_ROOT || 'C:\\hq';

async function readJson(fp) {
  try { return JSON.parse(await fs.readFile(fp, 'utf-8')); } catch { return null; }
}

async function getProjects() {
  const dirs = await fs.readdir(path.join(HQ_ROOT, 'projects'), { withFileTypes: true }).catch(() => []);
  const projects = [];
  for (const d of dirs) {
    if (!d.isDirectory()) continue;
    const prd = await readJson(path.join(HQ_ROOT, 'projects', d.name, 'prd.json'));
    if (prd) projects.push({ slug: d.name, name: prd.name || d.name, description: prd.description || '' });
  }
  return projects;
}

const CSS = `
:root {
  --bg-primary:#0D0D0F; --bg-secondary:#1A1A1E; --bg-card:#1E1E22; --bg-elevated:#2A2A2F;
  --text-primary:#FFFFFF; --text-secondary:#A0A0A8; --text-tertiary:#6B6B73;
  --accent-yellow:#F5C542; --border-subtle:#2A2A2E;
}
*{margin:0;padding:0;box-sizing:border-box}
body{background:var(--bg-primary);color:var(--text-primary);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;min-height:100vh}
.container{max-width:896px;margin:0 auto;padding:24px 16px}
h1{font-size:18px;margin-bottom:16px}
.card{background:var(--bg-card);border:1px solid var(--border-subtle);border-radius:8px;padding:16px;margin-bottom:8px}
.card h3{font-size:14px;margin-bottom:4px}
.card p{font-size:12px;color:var(--text-tertiary)}
`;

const CLIENT_JS = `
document.addEventListener('DOMContentLoaded', async () => {
  const data = await fetch('/api/projects').then(r => r.json());
  const app = document.getElementById('app');
  app.innerHTML = '<h1>HQ Projects</h1>' + data.map(p =>
    '<div class="card"><h3>' + esc(p.name) + '</h3><p>' + esc(p.description) + '</p></div>'
  ).join('');
});
function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
`;

function renderHTML() {
  return '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>HQ</title><style>' + CSS + '</style></head><body><div class="container" id="app"></div><script>' + CLIENT_JS + '</script></body></html>';
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (req.method === 'GET' && url.pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(renderHTML());
  } else if (req.method === 'GET' && url.pathname === '/api/projects') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(await getProjects()));
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(PORT, 'localhost', () => {
  console.log(`Ephemeral UI running at http://localhost:${PORT}`);
});

process.on('SIGINT', () => { server.close(); process.exit(0); });
process.on('SIGTERM', () => { server.close(); process.exit(0); });
```

## Lifecycle

### 1. Generate

The `/ui` command reads the protocol (this file) and a UI spec, then generates one `.js` file.

### 2. Write to temp directory

```js
const os = require('os');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hq-ui-'));
const serverPath = path.join(tmpDir, 'server.js');
fs.writeFileSync(serverPath, generatedCode, 'utf-8');
```

### 3. Start

Run via Bash tool with `run_in_background: true`:

```bash
node /tmp/hq-ui-XXXXX/server.js
```

Report the URL to the user: `http://localhost:3100`

### 4. Graceful shutdown

Every server must handle `SIGINT` and `SIGTERM`:

```js
process.on('SIGINT', () => { server.close(); process.exit(0); });
process.on('SIGTERM', () => { server.close(); process.exit(0); });
```

### 5. Cleanup

The temp directory is ephemeral. OS cleans it on reboot. No manual cleanup required, but a `/ui stop` could kill the background process and `rm -rf` the temp dir.

## Windows Compatibility

- Always use `path.join()` for filesystem paths, never string concatenation with `/`.
- `HQ_ROOT` defaults to `C:\\hq` (backslash-escaped in JS strings).
- Bind to `localhost` (not `0.0.0.0`) to avoid Windows firewall prompts.
- `SIGINT` works on Windows when Node is run from a terminal. `SIGTERM` may not fire on `taskkill` but Node will still exit.
- Use `os.tmpdir()` for temp paths (returns the correct Windows temp directory).
- Avoid `#!/usr/bin/env node` shebangs; run explicitly with `node server.js`.
- Use `fs.readdir` with `withFileTypes: true` for efficient directory scanning.
