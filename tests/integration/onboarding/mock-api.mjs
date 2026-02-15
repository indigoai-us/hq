/**
 * Mock API server for clean-room integration testing.
 *
 * Implements the hq-cloud API endpoints used by @indigoai/hq-cli.
 * Stores files in-memory — no database, no S3 needed.
 * Accepts any Bearer token (no real JWT validation).
 */

import { createServer } from 'node:http';

const PORT = 3333;

// In-memory stores
const files = new Map();   // path → { content (base64), size }
let claudeToken = null;    // { token, setAt }

function parseBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString();
      if (!raw) return resolve(null);
      try { resolve(JSON.parse(raw)); }
      catch { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const method = req.method;
  const pathname = url.pathname;

  // Require Authorization header (any Bearer token accepted)
  const auth = req.headers['authorization'];
  if (!auth || !auth.startsWith('Bearer ')) {
    return json(res, 401, { error: 'Unauthorized' });
  }

  try {
    // ── Settings: Claude token ──────────────────────────────────────────

    if (pathname === '/api/settings/claude-token') {
      if (method === 'GET') {
        return json(res, 200, {
          hasToken: claudeToken !== null,
          setAt: claudeToken?.setAt ?? null,
        });
      }
      if (method === 'POST') {
        const body = await parseBody(req);
        claudeToken = {
          token: body.token,
          setAt: new Date().toISOString(),
        };
        return json(res, 200, {
          ok: true,
          hasToken: true,
          setAt: claudeToken.setAt,
        });
      }
      if (method === 'DELETE') {
        claudeToken = null;
        return json(res, 200, { ok: true });
      }
    }

    // ── Files: upload ───────────────────────────────────────────────────

    if (pathname === '/api/files/upload' && method === 'POST') {
      const body = await parseBody(req);
      files.set(body.path, { content: body.content, size: body.size });
      return json(res, 200, { ok: true, path: body.path, size: body.size });
    }

    // ── Files: download ─────────────────────────────────────────────────

    if (pathname === '/api/files/download' && method === 'GET') {
      const filePath = url.searchParams.get('path');
      if (!filePath || !files.has(filePath)) {
        return json(res, 404, { error: 'File not found' });
      }
      const file = files.get(filePath);
      return json(res, 200, { content: file.content, size: file.size });
    }

    // ── Files: list ─────────────────────────────────────────────────────

    if (pathname === '/api/files/list' && method === 'GET') {
      const allFiles = Array.from(files.keys());
      return json(res, 200, { files: allFiles });
    }

    // ── Files: delete all ───────────────────────────────────────────────

    if (pathname === '/api/files/all' && method === 'DELETE') {
      files.clear();
      return json(res, 200, { ok: true });
    }

    // ── Files: sync (diff) ──────────────────────────────────────────────

    if (pathname === '/api/files/sync' && method === 'POST') {
      const body = await parseBody(req);
      const manifest = body.manifest || [];
      const localPaths = new Set(manifest.map((e) => e.path));
      const remotePaths = new Set(files.keys());

      // Files in local manifest but not on remote → need uploading
      const toUpload = manifest
        .filter((e) => !remotePaths.has(e.path))
        .map((e) => e.path);

      // Files on remote but not in local manifest → need downloading
      const toDownload = Array.from(remotePaths).filter(
        (p) => !localPaths.has(p),
      );

      return json(res, 200, { toUpload, toDownload });
    }

    // ── Files: quota ────────────────────────────────────────────────────

    if (pathname === '/api/files/quota' && method === 'GET') {
      let used = 0;
      for (const file of files.values()) {
        used += file.size || 0;
      }
      const limit = 524288000; // 500 MB
      return json(res, 200, {
        used,
        limit,
        percentage: Math.round((used / limit) * 100),
      });
    }

    // ── Auth: me ────────────────────────────────────────────────────────

    if (pathname === '/auth/me' && method === 'GET') {
      return json(res, 200, {
        userId: 'user_test123',
        email: 'test@integration.hq',
      });
    }

    // ── Fallback ────────────────────────────────────────────────────────

    json(res, 404, { error: `Not found: ${method} ${pathname}` });
  } catch (err) {
    json(res, 500, { error: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`Mock API listening on port ${PORT}`);
});
