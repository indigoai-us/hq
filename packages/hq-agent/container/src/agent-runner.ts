// Agent container runner — executed inside Docker containers
// Reads IPC request, runs Claude Agent SDK, writes IPC response

import fs from 'fs';
import path from 'path';
import { query } from '@anthropic-ai/claude-agent-sdk';

// ESM-compatible __dirname equivalent
const __filename = new URL(import.meta.url).pathname;
const __dirname = path.dirname(__filename);

const IPC_DIR = process.env.IPC_DIR ?? '/ipc';
const MESSAGE_ID = process.env.MESSAGE_ID ?? '0';
const GROUP_DIR = process.env.GROUP_DIR ?? '/workspace/group';
const TIMEOUT_MS = parseInt(process.env.CONTAINER_TIMEOUT_MS ?? '1800000', 10);
const MODEL = process.env.MODEL ?? 'claude-sonnet-4-6';

// The MCP server is bundled as CJS by esbuild
const MCP_SERVER_PATH = path.join(__dirname, 'mcp-server.cjs');

interface IpcRequest {
  messageId: number;
  groupId: string;
  chatId: string;
  sessionId: string;
  content: string;
  senderName: string;
  channel: string;
  timestamp: number;
}

interface IpcResponse {
  messageId: number;
  success: boolean;
  reply: string | null;
  error: string | null;
  timestamp: number;
}

async function writeResponse(response: IpcResponse): Promise<void> {
  const resPath = path.join(IPC_DIR, `res-${response.messageId}.json`);
  fs.writeFileSync(resPath, JSON.stringify(response, null, 2), 'utf8');
  console.log(`[agent-runner] Response written to ${resPath}`);
}

async function run(): Promise<void> {
  console.log(`[agent-runner] Starting agent session (messageId=${MESSAGE_ID})`);

  // Read IPC request
  const reqPath = path.join(IPC_DIR, `req-${MESSAGE_ID}.json`);
  if (!fs.existsSync(reqPath)) {
    console.error(`[agent-runner] IPC request not found: ${reqPath}`);
    const resPath = path.join(IPC_DIR, `res-${MESSAGE_ID}.json`);
    fs.writeFileSync(resPath, JSON.stringify({
      messageId: parseInt(MESSAGE_ID, 10),
      success: false,
      reply: null,
      error: `IPC request file not found: ${reqPath}`,
      timestamp: Date.now(),
    }), 'utf8');
    process.exit(1);
  }

  let request: IpcRequest;
  try {
    request = JSON.parse(fs.readFileSync(reqPath, 'utf8')) as IpcRequest;
  } catch (err) {
    console.error(`[agent-runner] Failed to parse IPC request:`, err);
    const resPath = path.join(IPC_DIR, `res-${MESSAGE_ID}.json`);
    fs.writeFileSync(resPath, JSON.stringify({
      messageId: parseInt(MESSAGE_ID, 10),
      success: false,
      reply: null,
      error: `Failed to parse IPC request: ${err instanceof Error ? err.message : String(err)}`,
      timestamp: Date.now(),
    }), 'utf8');
    process.exit(1);
  }

  // Load system prompt from CLAUDE.md (group memory)
  const claudeMdPath = path.join(GROUP_DIR, 'CLAUDE.md');
  let groupSystemPrompt = '';
  if (fs.existsSync(claudeMdPath)) {
    groupSystemPrompt = fs.readFileSync(claudeMdPath, 'utf8');
    console.log(`[agent-runner] Loaded CLAUDE.md from ${claudeMdPath}`);
  } else {
    console.log(`[agent-runner] No CLAUDE.md found at ${claudeMdPath}, using default system prompt`);
  }

  // Build prompt
  const prompt = `Message from ${request.senderName} (via ${request.channel}): ${request.content}`;

  // Set up timeout via AbortController
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => {
    console.error(`[agent-runner] Timeout reached (${TIMEOUT_MS}ms), aborting`);
    controller.abort();
  }, TIMEOUT_MS);

  let reply = '';
  let success = true;
  let errorMsg: string | undefined;

  try {
    const stream = query({
      prompt,
      options: {
        model: MODEL,
        cwd: GROUP_DIR,
        permissionMode: 'bypassPermissions',
        allowDangerouslySkipPermissions: true,
        persistSession: true,
        systemPrompt: groupSystemPrompt
          ? { type: 'preset' as const, preset: 'claude_code' as const, append: groupSystemPrompt }
          : undefined,
        mcpServers: {
          'hq-tools': {
            type: 'stdio',
            command: 'node',
            args: [MCP_SERVER_PATH],
            env: {
              GROUP_DIR,
              IPC_DIR,
              KNOWLEDGE_DIR: '/workspace/knowledge',
            },
          },
        },
        allowedTools: ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep', 'mcp__hq-tools__*'],
      },
    });

    // Iterate events and capture the final result
    for await (const event of stream) {
      if (controller.signal.aborted) break;

      if (event.type === 'result') {
        if (event.is_error) {
          // Error result: subtype is 'error_during_execution' | 'error_max_turns' | etc.
          const errResult = event as typeof event & { errors?: string[]; subtype: string };
          throw new Error(errResult.errors?.[0] ?? `Agent error: ${errResult.subtype}`);
        }
        // Success result: grab the text output
        const successResult = event as typeof event & { result?: string };
        reply = successResult.result ?? '';
        console.log(`[agent-runner] Got result (${reply.length} chars)`);
      } else if (event.type === 'assistant') {
        // Capture last assistant message text as fallback
        const textBlock = event.message?.content?.find(
          (b: { type: string; text?: string }) => b.type === 'text'
        );
        if (textBlock && 'text' in textBlock && typeof textBlock.text === 'string') {
          reply = textBlock.text;
        }
      }
    }

    if (controller.signal.aborted && !reply) {
      throw new Error(`Agent timed out after ${TIMEOUT_MS}ms`);
    }

    if (!reply) {
      reply = '(Agent completed with no text output)';
    }
  } catch (err) {
    success = false;
    errorMsg = err instanceof Error ? err.message : String(err);
    reply = `Error: ${errorMsg}`;
    console.error(`[agent-runner] Agent error:`, err);
  } finally {
    clearTimeout(timeoutHandle);
  }

  // Write IPC response
  await writeResponse({
    messageId: request.messageId,
    success,
    reply,
    error: errorMsg ?? null,
    timestamp: Date.now(),
  });

  console.log(`[agent-runner] Done (success=${success})`);
  process.exit(success ? 0 : 1);
}

run().catch((err) => {
  console.error('[agent-runner] Fatal:', err);
  // Attempt to write error response
  const resPath = path.join(IPC_DIR, `res-${MESSAGE_ID}.json`);
  try {
    fs.writeFileSync(
      resPath,
      JSON.stringify({
        messageId: parseInt(MESSAGE_ID, 10),
        success: false,
        reply: null,
        error: err instanceof Error ? err.message : String(err),
        timestamp: Date.now(),
      }),
      'utf8'
    );
  } catch {
    // best effort
  }
  process.exit(1);
});
