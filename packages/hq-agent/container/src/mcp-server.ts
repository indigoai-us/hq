// MCP server for hq-cloud agent containers
// Exposes HQ tools to the Claude agent via stdio transport
// Bundled as CJS by esbuild to avoid ESM/CJS interop issues (GoClaw gotcha)

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

const GROUP_DIR = process.env.GROUP_DIR ?? '/workspace/group';
const KNOWLEDGE_DIR = process.env.KNOWLEDGE_DIR ?? '/workspace/knowledge';
const IPC_DIR = process.env.IPC_DIR ?? '/ipc';

const server = new McpServer({ name: 'hq-cloud-agent', version: '1.0.0' });

// ---------------------------------------------------------------------------
// schedule_task — writes a task file to IPC dir for the host to process
// ---------------------------------------------------------------------------
server.tool(
  'schedule_task',
  {
    task_type: z.string().describe('Type of task to schedule (e.g. "reminder", "follow_up", "run_worker")'),
    payload: z.string().describe('JSON-serialized payload for the task'),
    delay_ms: z.number().optional().describe('Delay in milliseconds before the task should run (default: 0)'),
  },
  async ({ task_type, payload, delay_ms }) => {
    const taskId = randomUUID();
    const taskFile = path.join(IPC_DIR, `task-${taskId}.json`);
    const task = {
      taskId,
      task_type,
      payload,
      delay_ms: delay_ms ?? 0,
      scheduled_at: new Date().toISOString(),
    };
    fs.mkdirSync(IPC_DIR, { recursive: true });
    fs.writeFileSync(taskFile, JSON.stringify(task, null, 2));
    return {
      content: [
        {
          type: 'text' as const,
          text: `Task scheduled: ${taskId} (type: ${task_type}, delay: ${delay_ms ?? 0}ms)`,
        },
      ],
    };
  }
);

// ---------------------------------------------------------------------------
// write_knowledge — writes a file to the group's persistent knowledge dir
// ---------------------------------------------------------------------------
server.tool(
  'write_knowledge',
  {
    filename: z.string().describe('Filename to write (e.g. "notes.md", "context.md")'),
    content: z.string().describe('Content to write to the file'),
  },
  async ({ filename, content }) => {
    const knowledgeDir = path.join(GROUP_DIR, 'knowledge');
    fs.mkdirSync(knowledgeDir, { recursive: true });
    // Use basename to prevent path traversal (e.g. ../../ipc/foo.json)
    const safeFilename = path.basename(filename);
    const filePath = path.join(knowledgeDir, safeFilename);
    fs.writeFileSync(filePath, content, 'utf8');
    return {
      content: [
        {
          type: 'text' as const,
          text: `Written ${content.length} bytes to ${filePath}`,
        },
      ],
    };
  }
);

// ---------------------------------------------------------------------------
// search_knowledge — searches .md files in KNOWLEDGE_DIR and GROUP_DIR
// ---------------------------------------------------------------------------
server.tool(
  'search_knowledge',
  {
    query: z.string().describe('Text query to search for in knowledge files'),
  },
  async ({ query }) => {
    const results: Array<{ file: string; excerpt: string }> = [];
    const queryLower = query.toLowerCase();

    function searchDir(dir: string, label: string): void {
      if (!fs.existsSync(dir)) return;
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          searchDir(fullPath, label);
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
          try {
            const text = fs.readFileSync(fullPath, 'utf8');
            if (text.toLowerCase().includes(queryLower)) {
              // Extract a short excerpt around first match
              const idx = text.toLowerCase().indexOf(queryLower);
              const start = Math.max(0, idx - 100);
              const end = Math.min(text.length, idx + 200);
              const excerpt = text.slice(start, end).replace(/\n/g, ' ').trim();
              results.push({ file: `[${label}] ${fullPath}`, excerpt });
            }
          } catch {
            // skip unreadable files
          }
        }
      }
    }

    searchDir(KNOWLEDGE_DIR, 'knowledge');
    searchDir(GROUP_DIR, 'group');

    if (results.length === 0) {
      return {
        content: [{ type: 'text' as const, text: `No results found for: "${query}"` }],
      };
    }

    const output = results
      .slice(0, 10)
      .map((r) => `**${r.file}**\n> ${r.excerpt}`)
      .join('\n\n');

    return {
      content: [{ type: 'text' as const, text: `Found ${results.length} result(s):\n\n${output}` }],
    };
  }
);

// ---------------------------------------------------------------------------
// send_message_to_channel — queues an outbound message for the host to route
// ---------------------------------------------------------------------------
server.tool(
  'send_message_to_channel',
  {
    message: z.string().describe('Message text to send'),
    channel: z.string().optional().describe('Target channel (e.g. "telegram", "slack"). Defaults to original channel.'),
  },
  async ({ message, channel }) => {
    const msgId = randomUUID();
    const outFile = path.join(IPC_DIR, `out-${msgId}.json`);
    const outMsg = {
      msgId,
      message,
      channel: channel ?? null,
      timestamp: new Date().toISOString(),
    };
    fs.mkdirSync(IPC_DIR, { recursive: true });
    fs.writeFileSync(outFile, JSON.stringify(outMsg, null, 2));
    return {
      content: [
        {
          type: 'text' as const,
          text: `Message queued for delivery: ${msgId} (channel: ${channel ?? 'default'})`,
        },
      ],
    };
  }
);

// ---------------------------------------------------------------------------
// Connect and start
// ---------------------------------------------------------------------------
(async () => {
  const transport = new StdioServerTransport();
  await server.connect(transport);
})().catch((err) => {
  console.error('[mcp-server] Fatal:', err);
  process.exit(1);
});
