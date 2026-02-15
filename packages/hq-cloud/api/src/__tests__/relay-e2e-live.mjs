/**
 * Live relay E2E test — runs against the real API server.
 *
 * Protocol (discovered by testing real Claude Code with --sdk-url):
 *   1. Container connects via WebSocket
 *   2. Server sends user message (initial prompt) immediately
 *   3. Container responds with system/init, then assistant, then result
 *
 * Usage: node relay-e2e-live.mjs
 * Requires: API server running on localhost:3001 with SKIP_AUTH=true
 */
import http from 'http';
import WebSocket from 'ws';

const API_BASE = 'http://127.0.0.1:3001';
const WS_BASE = 'ws://127.0.0.1:3001';

function post(path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-token', 'Content-Length': data.length },
    }, (res) => {
      let chunks = '';
      res.on('data', (c) => chunks += c);
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(chunks) }));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function waitForMessage(ws, predicate, label, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for: ${label}`)), timeoutMs);
    const handler = (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (predicate(msg)) {
          clearTimeout(timer);
          ws.off('message', handler);
          resolve(msg);
        }
      } catch { /* parse error, keep waiting */ }
    };
    ws.on('message', handler);
  });
}

function connectWs(url, options = {}) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, options);
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}

// ── Tests ──

const results = [];
function pass(name) { results.push({ name, ok: true }); console.log(`  PASS: ${name}`); }
function fail(name, err) { results.push({ name, ok: false, err: err.message }); console.log(`  FAIL: ${name} — ${err.message}`); }

async function run() {
  console.log('\n=== Relay E2E Live Test ===\n');

  // 1. Create session
  console.log('Creating session...');
  const { status, body: session } = await post('/api/sessions', { prompt: 'Relay E2E live test' });
  if (status !== 201) {
    console.error('Failed to create session:', status, session);
    process.exit(1);
  }
  const { sessionId, accessToken } = session;
  console.log(`Session: ${sessionId}`);
  console.log(`Token:   ${accessToken}\n`);

  // 2. Connect browser
  console.log('Connecting browser WebSocket...');
  const browser = await connectWs(`${WS_BASE}/ws?token=test-token`);
  await waitForMessage(browser, m => m.type === 'connected', 'browser connected');
  pass('Browser receives "connected" message');

  // 3. Subscribe to session
  browser.send(JSON.stringify({ type: 'session_subscribe', payload: { sessionId } }));
  const statusMsg = await waitForMessage(browser, m => m.type === 'session_status', 'session_status after subscribe');

  // Test: Is it wrapped in ServerEvent envelope?
  try {
    if (!statusMsg.timestamp) throw new Error('Missing timestamp');
    if (!statusMsg.payload) throw new Error('Missing payload wrapper');
    if (typeof statusMsg.payload !== 'object') throw new Error('payload is not an object');
    const p = statusMsg.payload;
    if (p.sessionId !== sessionId) throw new Error(`payload.sessionId mismatch: ${p.sessionId}`);
    if (p.status !== 'starting') throw new Error(`Expected status 'starting', got '${p.status}'`);
    pass('session_status has ServerEvent envelope { type, payload, timestamp }');
  } catch (e) {
    fail('session_status has ServerEvent envelope', e);
    console.log('  Raw message:', JSON.stringify(statusMsg, null, 2));
  }

  // 4. Connect container — server should immediately send user message (prompt)
  //    Start listening for 'initializing' BEFORE connecting so we don't miss it
  console.log('\nConnecting container WebSocket...');
  const initializingPromise = waitForMessage(browser, m => {
    if (m.type !== 'session_status') return false;
    const p = m.payload || {};
    return p.startupPhase === 'initializing';
  }, 'initializing phase', 5000);

  const containerWs = await connectWs(`${WS_BASE}/ws/relay/${sessionId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  pass('Container connects to relay');

  // 5. Container should receive the initial prompt immediately (server sends it on connect)
  try {
    const promptMsg = await waitForMessage(containerWs, m => m.type === 'user', 'initial prompt from server', 5000);
    const content = promptMsg.message?.content || promptMsg.content;
    if (content !== 'Relay E2E live test') throw new Error(`Prompt mismatch: ${content}`);
    pass('Container receives initial prompt immediately on connect');
    console.log(`  Prompt content: ${JSON.stringify(content)}`);
  } catch (e) {
    fail('Container receives initial prompt immediately on connect', e);
  }

  // 6. Wait for browser to receive 'initializing' phase (listener started before connect)
  try {
    const initMsg = await initializingPromise;

    if (!initMsg.timestamp) throw new Error('Missing timestamp on initializing');
    if (!initMsg.payload) throw new Error('Missing payload on initializing');
    pass('Browser receives "initializing" startup phase (wrapped)');
  } catch (e) {
    fail('Browser receives "initializing" startup phase', e);
  }

  // 7. Container sends system/init (as real Claude Code does after receiving user message)
  console.log('\nContainer sending system/init...');
  const readyPromise = waitForMessage(browser, m => {
    if (m.type !== 'session_status') return false;
    const p = m.payload || {};
    return p.status === 'active' && p.startupPhase === 'ready';
  }, 'ready phase', 5000);

  containerWs.send(JSON.stringify({
    type: 'system',
    subtype: 'init',
    cwd: '/hq',
    session_id: sessionId,
    model: 'claude-sonnet-4-20250514',
    tools: ['Read', 'Edit', 'Bash'],
    mcp_servers: [],
    permissionMode: 'default',
  }) + '\n');

  // 8. Wait for browser to receive 'ready' phase
  try {
    const readyMsg = await readyPromise;

    if (!readyMsg.timestamp) throw new Error('Missing timestamp');
    if (!readyMsg.payload) throw new Error('Missing payload');
    if (!readyMsg.payload.capabilities) throw new Error('Missing capabilities in ready payload');
    pass('Browser receives "ready" phase with capabilities (wrapped)');
  } catch (e) {
    fail('Browser receives "ready" phase', e);
  }

  // 9. Container sends assistant response
  console.log('\nContainer sending assistant message...');
  containerWs.send(JSON.stringify({
    type: 'assistant',
    message: { role: 'assistant', content: [{ type: 'text', text: 'The answer is 4.' }] },
    content: 'The answer is 4.',
    session_id: sessionId,
  }) + '\n');

  // 10. Browser should receive it wrapped
  try {
    const assistMsg = await waitForMessage(browser, m => m.type === 'session_message', 'assistant message', 5000);
    if (!assistMsg.timestamp) throw new Error('Missing timestamp');
    if (!assistMsg.payload) throw new Error('Missing payload');
    const p = assistMsg.payload;
    if (p.sessionId !== sessionId) throw new Error(`sessionId mismatch: ${p.sessionId}`);
    if (p.messageType !== 'assistant') throw new Error(`Expected messageType 'assistant', got '${p.messageType}'`);
    if (p.content !== 'The answer is 4.') throw new Error(`Content mismatch: ${p.content}`);
    pass('Browser receives assistant message (wrapped in ServerEvent envelope)');
  } catch (e) {
    fail('Browser receives assistant message', e);
    console.log('  Check if message arrived without envelope');
  }

  // 11. Browser sends user message → container receives it
  console.log('\nBrowser sending user message...');
  browser.send(JSON.stringify({
    type: 'session_user_message',
    sessionId,
    content: 'Hello from browser!',
  }));

  try {
    const userMsg = await waitForMessage(containerWs, m => {
      if (m.type !== 'user') return false;
      const msg = m.message || {};
      return msg.content === 'Hello from browser!';
    }, 'browser-to-container user message', 5000);
    pass('Container receives browser user message');
  } catch (e) {
    fail('Container receives browser user message', e);
  }

  // Cleanup
  containerWs.close();
  browser.close();

  // Summary
  const passed = results.filter(r => r.ok).length;
  const failed = results.filter(r => !r.ok).length;
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);

  if (failed > 0) {
    console.log('Failures:');
    for (const r of results.filter(r => !r.ok)) {
      console.log(`  - ${r.name}: ${r.err}`);
    }
  }

  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
