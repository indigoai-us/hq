import type { FastifyInstance, FastifyPluginCallback } from 'fastify';
import { createCliToken } from '../auth/cli-token.js';
import { config } from '../config.js';

/**
 * Build the self-contained HTML auth page.
 * Uses Clerk JS SDK from CDN to handle sign-in, then exchanges the
 * Clerk JWT for a long-lived CLI token and redirects to the callback.
 */
function buildAuthPage(callbackUrl: string, apiOrigin: string): string {
  const clerkPubKey = config.clerkPublishableKey;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Sign in to Indigo</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0a0a0f;
      color: #e0e0e0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .container {
      text-align: center;
      max-width: 420px;
      padding: 2rem;
    }
    .logo {
      width: 48px; height: 48px;
      border-radius: 12px;
      background: rgba(174, 96, 248, 0.8);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 18px;
      color: white;
      margin-bottom: 1.5rem;
    }
    h1 { font-size: 1.25rem; font-weight: 600; margin-bottom: 0.5rem; }
    .subtitle { font-size: 0.8rem; color: rgba(255,255,255,0.4); margin-bottom: 2rem; }
    #sign-in { min-height: 300px; }
    .status {
      font-size: 0.85rem;
      color: rgba(255,255,255,0.6);
      padding: 1rem;
    }
    .status.error { color: #f87171; }
    .spinner {
      width: 24px; height: 24px;
      border: 2px solid rgba(255,255,255,0.1);
      border-top-color: rgba(174,96,248,0.8);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin: 1rem auto;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo">HQ</div>
    <h1>Sign in to Indigo</h1>
    <p class="subtitle">Sign in to authorize Indigo Docs desktop app</p>
    <div id="sign-in"></div>
    <div id="status" class="status" style="display:none;">
      <div class="spinner"></div>
      <span id="status-text"></span>
    </div>
  </div>
  <script>
    const CALLBACK_URL = ${JSON.stringify(callbackUrl)};
    const API_ORIGIN = ${JSON.stringify(apiOrigin)};

    function showStatus(msg) {
      document.getElementById('sign-in').style.display = 'none';
      var s = document.getElementById('status');
      s.style.display = 'block';
      s.className = 'status';
      document.getElementById('status-text').textContent = msg;
    }
    function showError(msg) {
      document.getElementById('sign-in').style.display = 'none';
      var s = document.getElementById('status');
      s.style.display = 'block';
      s.className = 'status error';
      s.innerHTML = msg;
    }

    async function exchangeToken(clerk) {
      try {
        showStatus('Getting session token...');
        var token = await clerk.session.getToken();
        if (!token) { showError('Failed to get session token.'); return; }

        showStatus('Creating login token...');
        var resp = await fetch(API_ORIGIN + '/api/auth/cli-token', {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + token,
            'Content-Type': 'application/json'
          },
          body: '{}'
        });
        if (!resp.ok) {
          var errData = await resp.json().catch(function() { return {}; });
          showError('Token exchange failed: ' + (errData.message || resp.status));
          return;
        }
        var data = await resp.json();
        showStatus('Completing login...');

        var expiresAt = new Date(Date.now() + 30*24*60*60*1000).toISOString();
        var params = new URLSearchParams({
          token: data.token,
          user_id: data.userId,
          expires_at: expiresAt
        });
        window.location.href = CALLBACK_URL + '?' + params.toString();
      } catch (err) {
        showError('Login failed: ' + (err.message || err));
      }
    }

    // Load Clerk JS from CDN
    var script = document.createElement('script');
    script.setAttribute('data-clerk-publishable-key', ${JSON.stringify(clerkPubKey)});
    script.async = true;
    script.src = 'https://cdn.jsdelivr.net/npm/@clerk/clerk-js@latest/dist/clerk.browser.js';
    script.addEventListener('load', async function() {
      try {
        await window.Clerk.load();
        if (window.Clerk.user) {
          // Already signed in
          await exchangeToken(window.Clerk);
        } else {
          // Mount sign-in component
          window.Clerk.mountSignIn(document.getElementById('sign-in'), {
            afterSignInUrl: window.location.href,
            afterSignUpUrl: window.location.href
          });
          // Listen for sign-in completion
          window.Clerk.addListener(function(evt) {
            if (evt.user && evt.session) {
              exchangeToken(window.Clerk);
            }
          });
        }
      } catch (err) {
        showError('Failed to load authentication: ' + (err.message || err));
      }
    });
    script.addEventListener('error', function() {
      showError('Failed to load authentication script. Check your internet connection.');
    });
    document.body.appendChild(script);
  </script>
</body>
</html>`;
}

/**
 * Auth routes — user info, CLI login flow.
 */
export const authRoutes: FastifyPluginCallback = (
  fastify: FastifyInstance,
  _opts,
  done
): void => {
  /**
   * Get current authenticated user info
   * GET /auth/me
   */
  fastify.get('/me', (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    return reply.send({
      userId: request.user.userId,
      sessionId: request.user.sessionId,
    });
  });

  /**
   * CLI login — redirect to web app sign-in with callback URL.
   * GET /auth/cli-login?callback_url=http://127.0.0.1:PORT/callback&device_code=XXX
   *
   * This is an unauthenticated endpoint (excluded from auth middleware).
   * The flow is:
   * 1. CLI opens browser here
   * 2. API redirects to web app /cli-callback with callback info
   * 3. Web app authenticates via Clerk
   * 4. Web app calls POST /auth/cli-token to get a long-lived CLI token
   * 5. Web app redirects to CLI callback_url with the token
   */
  fastify.get('/cli-login', (request, reply) => {
    const { callback_url } = request.query as {
      callback_url?: string;
    };

    if (!callback_url) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'callback_url query parameter is required',
      });
    }

    // Validate callback_url is a localhost URL (security: prevent open redirect)
    try {
      const parsed = new URL(callback_url);
      if (parsed.hostname !== '127.0.0.1' && parsed.hostname !== 'localhost') {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'callback_url must be a localhost URL',
        });
      }
    } catch {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'callback_url is not a valid URL',
      });
    }

    // Determine our own origin for the token exchange POST
    const proto = request.headers['x-forwarded-proto'] || 'https';
    const host = request.headers['x-forwarded-host'] || request.headers['host'] || 'api.hq.getindigo.ai';
    const apiOrigin = `${proto}://${host}`;

    // Serve a self-contained auth page with Clerk JS from CDN
    const html = buildAuthPage(callback_url, apiOrigin);
    return reply.type('text/html').send(html);
  });

  /**
   * Exchange a Clerk session token for a long-lived CLI token.
   * POST /auth/cli-token
   *
   * Requires valid Clerk JWT (authenticated).
   * Returns a CLI token valid for 30 days.
   */
  fastify.post('/cli-token', (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const { userId, sessionId } = request.user;
    const token = createCliToken(userId, sessionId);

    return reply.send({
      token,
      userId,
      expiresIn: '30d',
    });
  });

  /**
   * Verify a CLI token is still valid.
   * GET /auth/cli-verify
   *
   * Accepts CLI tokens (hqcli_xxx) via Bearer auth.
   * Returns user info if valid.
   */
  fastify.get('/cli-verify', (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    return reply.send({
      valid: true,
      userId: request.user.userId,
      sessionId: request.user.sessionId,
    });
  });

  done();
};
