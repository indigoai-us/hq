/**
 * hq hiamp commands — HIAMP protocol management
 * Heartbeat polling, message sending, and status for Linear (and future transports)
 */

import { Command } from "commander";
import * as fs from "fs";
import * as path from "path";
import * as yaml from "js-yaml";
import { findHqRoot } from "../utils/manifest.js";

// --- Types ---

interface HiampConfig {
  transport: "linear" | "slack";
  identity?: { owner?: string; "display-name"?: string };
  linear?: {
    "api-key"?: string;
    "default-team"?: string;
    teams?: Array<{
      key: string;
      name?: string;
      "team-id"?: string;
    }>;
    heartbeat?: {
      "interval-minutes"?: number;
      "initial-lookback-minutes"?: number;
    };
    "watched-queries"?: string[];
  };
}

interface HeartbeatState {
  lastPollAt: string | null;
  watchedIssueIds: string[];
  pollCount: number;
}

interface LinearComment {
  id: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  user?: { name: string; email?: string };
  issue?: { id: string; identifier: string; title: string };
}

// --- Config ---

function loadConfig(hqRoot: string): HiampConfig {
  const configPath = path.join(hqRoot, "config", "hiamp.yaml");
  if (!fs.existsSync(configPath)) {
    throw new Error(
      `No hiamp.yaml found at ${configPath}\nRun setup: create config/hiamp.yaml with your transport config.`
    );
  }
  const raw = yaml.load(fs.readFileSync(configPath, "utf-8")) as Record<
    string,
    unknown
  >;

  const config: HiampConfig = {
    transport: (raw.transport as HiampConfig["transport"]) || "linear",
    identity: raw.identity as HiampConfig["identity"],
    linear: raw.linear as HiampConfig["linear"],
  };

  return config;
}

function resolveApiKey(config: HiampConfig): string {
  const keyRef = config.linear?.["api-key"];
  if (!keyRef) {
    throw new Error("No linear.api-key in hiamp.yaml");
  }

  // Resolve $ENV_VAR references
  if (keyRef.startsWith("$")) {
    const envName = keyRef.slice(1);

    // Try loading from HQ .env file
    const hqRoot = findHqRoot();
    const envPath = path.join(hqRoot, ".env");
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, "utf-8");
      for (const line of envContent.split("\n")) {
        const trimmed = line.trim();
        if (trimmed.startsWith("#") || !trimmed.includes("=")) continue;
        const eqIdx = trimmed.indexOf("=");
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim();
        if (key === envName) return val;
      }
    }

    // Fall back to process env
    const envVal = process.env[envName];
    if (!envVal) {
      throw new Error(
        `Environment variable ${envName} not set. Add it to .env or export it.`
      );
    }
    return envVal;
  }

  return keyRef;
}

// --- Linear GraphQL ---

async function linearQuery(
  apiKey: string,
  query: string,
  variables?: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const res = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: apiKey,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    throw new Error(`Linear API error: ${res.status} ${res.statusText}`);
  }

  const json = (await res.json()) as {
    data?: Record<string, unknown>;
    errors?: Array<{ message: string }>;
  };
  if (json.errors?.length) {
    throw new Error(`Linear GraphQL error: ${json.errors[0].message}`);
  }
  return json.data!;
}

// --- Heartbeat State ---

function getStatePath(hqRoot: string): string {
  return path.join(hqRoot, "workspace", "hiamp", "heartbeat-state.json");
}

function loadState(hqRoot: string): HeartbeatState {
  const statePath = getStatePath(hqRoot);
  if (fs.existsSync(statePath)) {
    return JSON.parse(fs.readFileSync(statePath, "utf-8")) as HeartbeatState;
  }
  return { lastPollAt: null, watchedIssueIds: [], pollCount: 0 };
}

function saveState(hqRoot: string, state: HeartbeatState): void {
  const statePath = getStatePath(hqRoot);
  const dir = path.dirname(statePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
}

// --- Poll Logic ---

async function pollOnce(
  apiKey: string,
  config: HiampConfig,
  state: HeartbeatState,
  hqRoot: string
): Promise<{ mentions: LinearComment[]; assigned: number }> {
  const watchedQueries = config.linear?.["watched-queries"] || [];
  const lookbackMinutes =
    config.linear?.heartbeat?.["initial-lookback-minutes"] || 60;

  // Determine cursor: last poll time or lookback window
  const since = state.lastPollAt
    ? new Date(state.lastPollAt)
    : new Date(Date.now() - lookbackMinutes * 60 * 1000);

  const mentions: LinearComment[] = [];
  let assignedCount = 0;

  // Search for comments mentioning watched queries
  for (const query of watchedQueries) {
    try {
      const data = await linearQuery(apiKey, `
        query SearchComments($term: String!, $after: DateTime!) {
          searchIssues(term: $term, filter: { updatedAt: { gt: $after } }, first: 20) {
            nodes {
              id
              identifier
              title
              assignee { name email }
              comments(first: 50) {
                nodes {
                  id
                  body
                  createdAt
                  updatedAt
                  user { name email }
                }
              }
            }
          }
        }
      `, { term: query, after: since.toISOString() });

      const searchResult = data.searchIssues as {
        nodes: Array<{
          id: string;
          identifier: string;
          title: string;
          assignee?: { name: string; email?: string };
          comments: { nodes: Array<{ id: string; body: string; createdAt: string; updatedAt: string; user?: { name: string; email?: string } }> };
        }>;
      };

      for (const issue of searchResult.nodes) {
        // Check if assigned to us
        if (issue.assignee?.name?.toLowerCase().includes(query.toLowerCase())) {
          assignedCount++;
        }

        // Find comments that mention the query and are newer than cursor
        for (const comment of issue.comments.nodes) {
          const commentDate = new Date(comment.createdAt);
          if (commentDate > since && comment.body.toLowerCase().includes(query.toLowerCase())) {
            mentions.push({
              ...comment,
              issue: { id: issue.id, identifier: issue.identifier, title: issue.title },
            });
          }
        }
      }
    } catch (err) {
      // Individual query failure shouldn't kill the whole poll
      console.error(`  Warning: search for "${query}" failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  // Update state
  state.lastPollAt = new Date().toISOString();
  state.pollCount++;
  saveState(hqRoot, state);

  return { mentions, assigned: assignedCount };
}

// --- Inbox ---

function writeToInbox(
  hqRoot: string,
  mentions: LinearComment[]
): void {
  if (mentions.length === 0) return;

  const inboxDir = path.join(hqRoot, "workspace", "hiamp", "inbox");
  if (!fs.existsSync(inboxDir)) {
    fs.mkdirSync(inboxDir, { recursive: true });
  }

  for (const mention of mentions) {
    const filename = `${mention.issue?.identifier || "unknown"}-${mention.id.slice(0, 8)}.json`;
    const entry = {
      id: mention.id,
      source: "linear",
      issue: mention.issue,
      author: mention.user?.name || "unknown",
      body: mention.body,
      createdAt: mention.createdAt,
      receivedAt: new Date().toISOString(),
    };
    fs.writeFileSync(
      path.join(inboxDir, filename),
      JSON.stringify(entry, null, 2)
    );
  }
}

// --- Commands ---

export function registerHiampCommands(program: Command): void {
  program
    .command("check")
    .description("One-shot poll: check Linear for mentions and assignments now")
    .action(async () => {
      try {
        const hqRoot = findHqRoot();
        const config = loadConfig(hqRoot);

        if (config.transport !== "linear") {
          console.log(`Transport is "${config.transport}", not linear. Nothing to check.`);
          return;
        }

        const apiKey = resolveApiKey(config);
        const state = loadState(hqRoot);
        const watchedQueries = config.linear?.["watched-queries"] || [];

        console.log(`Checking Linear for: ${watchedQueries.join(", ")}`);
        console.log(`Since: ${state.lastPollAt || `last ${config.linear?.heartbeat?.["initial-lookback-minutes"] || 60} minutes`}`);

        const { mentions, assigned } = await pollOnce(apiKey, config, state, hqRoot);

        if (mentions.length === 0 && assigned === 0) {
          console.log("\nNo new mentions or assignments.");
        } else {
          if (assigned > 0) {
            console.log(`\n${assigned} issue(s) assigned to you/your agents.`);
          }
          if (mentions.length > 0) {
            console.log(`\n${mentions.length} new mention(s):`);
            for (const m of mentions) {
              const preview = m.body.length > 80 ? m.body.slice(0, 80) + "..." : m.body;
              console.log(`  ${m.issue?.identifier || "?"}: ${preview}`);
              console.log(`    by ${m.user?.name || "unknown"} at ${m.createdAt}`);
            }
            writeToInbox(hqRoot, mentions);
            console.log(`\nWritten to workspace/hiamp/inbox/`);
          }
        }
      } catch (error) {
        console.error("Error:", error instanceof Error ? error.message : error);
        process.exit(1);
      }
    });

  program
    .command("listen")
    .description("Start heartbeat polling (foreground, Ctrl+C to stop)")
    .action(async () => {
      try {
        const hqRoot = findHqRoot();
        const config = loadConfig(hqRoot);

        if (config.transport !== "linear") {
          console.log(`Transport is "${config.transport}", not linear.`);
          return;
        }

        const apiKey = resolveApiKey(config);
        const intervalMinutes = config.linear?.heartbeat?.["interval-minutes"] || 5;
        const watchedQueries = config.linear?.["watched-queries"] || [];

        console.log(`HIAMP heartbeat started (Linear transport)`);
        console.log(`  Interval: ${intervalMinutes} min`);
        console.log(`  Watching: ${watchedQueries.join(", ")}`);
        console.log(`  Ctrl+C to stop\n`);

        // Initial poll
        const state = loadState(hqRoot);
        const { mentions, assigned } = await pollOnce(apiKey, config, state, hqRoot);
        console.log(`[${new Date().toISOString()}] Poll #${state.pollCount}: ${mentions.length} mentions, ${assigned} assigned`);
        writeToInbox(hqRoot, mentions);

        // Polling loop
        const interval = setInterval(async () => {
          try {
            const currentState = loadState(hqRoot);
            const result = await pollOnce(apiKey, config, currentState, hqRoot);
            console.log(`[${new Date().toISOString()}] Poll #${currentState.pollCount}: ${result.mentions.length} mentions, ${result.assigned} assigned`);
            writeToInbox(hqRoot, result.mentions);
          } catch (err) {
            console.error(`[${new Date().toISOString()}] Poll error: ${err instanceof Error ? err.message : err}`);
          }
        }, intervalMinutes * 60 * 1000);

        // Graceful shutdown
        process.on("SIGINT", () => {
          clearInterval(interval);
          console.log("\nHeartbeat stopped.");
          process.exit(0);
        });
      } catch (error) {
        console.error("Error:", error instanceof Error ? error.message : error);
        process.exit(1);
      }
    });

  program
    .command("status")
    .description("Show HIAMP config and heartbeat status")
    .action(async () => {
      try {
        const hqRoot = findHqRoot();
        const config = loadConfig(hqRoot);
        const state = loadState(hqRoot);

        console.log("HIAMP Status");
        console.log(`  Transport:  ${config.transport}`);
        console.log(`  Owner:      ${config.identity?.owner || "not set"}`);

        if (config.transport === "linear") {
          const teams = config.linear?.teams?.map((t) => t.key).join(", ") || "none";
          console.log(`  Default:    ${config.linear?.["default-team"] || "not set"}`);
          console.log(`  Teams:      ${teams}`);
          console.log(`  Interval:   ${config.linear?.heartbeat?.["interval-minutes"] || 5} min`);
          console.log(`  Watching:   ${config.linear?.["watched-queries"]?.join(", ") || "none"}`);
        }

        console.log(`  Last poll:  ${state.lastPollAt || "never"}`);
        console.log(`  Poll count: ${state.pollCount}`);
        console.log(`  Watched:    ${state.watchedIssueIds.length} issues`);

        // Check inbox
        const inboxDir = path.join(hqRoot, "workspace", "hiamp", "inbox");
        if (fs.existsSync(inboxDir)) {
          const files = fs.readdirSync(inboxDir).filter((f) => f.endsWith(".json"));
          console.log(`  Inbox:      ${files.length} message(s)`);
        } else {
          console.log(`  Inbox:      empty`);
        }

        // Verify API key
        try {
          const apiKey = resolveApiKey(config);
          await linearQuery(apiKey, `query { viewer { id name email } }`);
          console.log(`  API key:    valid`);
        } catch {
          console.log(`  API key:    invalid or not set`);
        }
      } catch (error) {
        console.error("Error:", error instanceof Error ? error.message : error);
        process.exit(1);
      }
    });

  program
    .command("send")
    .description("Send a HIAMP message via Linear")
    .requiredOption("--to <address>", "Target address (owner/worker-id)")
    .requiredOption("--body <message>", "Message body")
    .option("--intent <type>", "Intent type", "inform")
    .option("--issue <id>", "Target Linear issue identifier (e.g., IND-123)")
    .action(async (opts) => {
      try {
        const hqRoot = findHqRoot();
        const config = loadConfig(hqRoot);
        const apiKey = resolveApiKey(config);
        const owner = config.identity?.owner || "unknown";

        // Build HIAMP-formatted comment
        const timestamp = new Date().toISOString();
        const header = `**${owner}** → **${opts.to}**`;
        const body = opts.body;
        const envelope = [
          "---",
          `from: ${owner}`,
          `to: ${opts.to}`,
          `intent: ${opts.intent}`,
          `timestamp: ${timestamp}`,
          "---",
        ].join("\n");

        const comment = `${header}\n\n${body}\n\n<details><summary>HIAMP envelope</summary>\n\n\`\`\`\n${envelope}\n\`\`\`\n\n</details>`;

        if (opts.issue) {
          // Post to specific issue
          const data = await linearQuery(apiKey, `
            query GetIssue($id: String!) {
              issue(id: $id) { id identifier title }
            }
          `, { id: opts.issue });

          const issue = (data.issue || data.issueSearch) as { id: string; identifier: string; title: string } | null;

          // Try searching by identifier if direct lookup fails
          let issueId: string;
          if (issue) {
            issueId = issue.id;
          } else {
            // Search by identifier
            const searchData = await linearQuery(apiKey, `
              query SearchIssue($term: String!) {
                searchIssues(term: $term, first: 1) {
                  nodes { id identifier title }
                }
              }
            `, { term: opts.issue });
            const results = searchData.searchIssues as { nodes: Array<{ id: string; identifier: string; title: string }> };
            if (results.nodes.length === 0) {
              throw new Error(`Issue "${opts.issue}" not found`);
            }
            issueId = results.nodes[0].id;
            console.log(`Found: ${results.nodes[0].identifier} — ${results.nodes[0].title}`);
          }

          await linearQuery(apiKey, `
            mutation CreateComment($issueId: String!, $body: String!) {
              commentCreate(input: { issueId: $issueId, body: $body }) {
                success
                comment { id }
              }
            }
          `, { issueId, body: comment });

          console.log(`Sent to ${opts.issue}: ${opts.intent} → ${opts.to}`);
        } else {
          console.log("No --issue specified. Use --issue IND-123 to target a Linear issue.");
          process.exit(1);
        }
      } catch (error) {
        console.error("Error:", error instanceof Error ? error.message : error);
        process.exit(1);
      }
    });
}
