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
  identity?: {
    owner?: string;
    "display-name"?: string;
    "linear-user-id"?: string;
    "linear-email"?: string;
  };
  linear?: {
    "api-key"?: string;
    org?: string;
    "org-name"?: string;
    "default-team"?: string;
    teams?: Array<{
      key: string;
      name?: string;
      "team-id"?: string;
    }>;
    heartbeat?: {
      "interval-minutes"?: number;
      "initial-lookback-minutes"?: number;
      "watch-assigned"?: boolean;
      "watch-teams"?: boolean;
    };
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

interface PollResult {
  assigned: Array<{ identifier: string; title: string; state: string; team: string; updatedAt: string }>;
  recentComments: LinearComment[];
  notifications: Array<{ type: string; issueIdentifier: string; issueTitle: string; actorName: string; createdAt: string }>;
}

async function pollOnce(
  apiKey: string,
  config: HiampConfig,
  state: HeartbeatState,
  hqRoot: string
): Promise<PollResult> {
  const userId = config.identity?.["linear-user-id"];
  const lookbackMinutes =
    config.linear?.heartbeat?.["initial-lookback-minutes"] || 60;

  const since = state.lastPollAt
    ? new Date(state.lastPollAt)
    : new Date(Date.now() - lookbackMinutes * 60 * 1000);

  const result: PollResult = { assigned: [], recentComments: [], notifications: [] };

  // 1. Issues assigned to me (by user ID — no text search)
  if (userId && config.linear?.heartbeat?.["watch-assigned"] !== false) {
    try {
      const afterISO = since.toISOString();
      const data = await linearQuery(apiKey, `{
        issues(
          filter: {
            assignee: { id: { eq: "${userId}" } }
            updatedAt: { gt: "${afterISO}" }
            state: { type: { nin: ["completed", "canceled"] } }
          }
          first: 25
          orderBy: updatedAt
        ) {
          nodes {
            identifier title updatedAt
            state { name }
            team { key name }
            comments(first: 5, orderBy: createdAt) {
              nodes { id body createdAt updatedAt user { name email } }
            }
          }
        }
      }`);

      const issues = (data.issues as { nodes: Array<{
        identifier: string; title: string; updatedAt: string;
        state: { name: string }; team: { key: string; name: string };
        comments: { nodes: Array<{ id: string; body: string; createdAt: string; updatedAt: string; user?: { name: string; email?: string } }> };
      }> }).nodes;

      for (const issue of issues) {
        result.assigned.push({
          identifier: issue.identifier,
          title: issue.title,
          state: issue.state.name,
          team: issue.team.key,
          updatedAt: issue.updatedAt,
        });

        // Collect new comments on assigned issues (from others)
        for (const comment of issue.comments.nodes) {
          if (new Date(comment.createdAt) > since && comment.user?.email !== config.identity?.["linear-email"]) {
            result.recentComments.push({
              ...comment,
              issue: { id: "", identifier: issue.identifier, title: issue.title },
            });
          }
        }
      }
    } catch (err) {
      console.error(`  Warning: assigned issues query failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  // 2. Notifications (mentions, replies, assignments) — Linear's own notification system
  try {
    const afterISO = since.toISOString();
    const data = await linearQuery(apiKey, `{
      notifications(
        first: 25
        orderBy: createdAt
      ) {
        nodes {
          type
          createdAt
          ... on IssueNotification {
            issue { identifier title }
            actor { name }
            comment { id body createdAt user { name email } }
          }
        }
      }
    }`);

    const notifs = (data.notifications as { nodes: Array<{
      type: string; createdAt: string;
      issue?: { identifier: string; title: string };
      actor?: { name: string };
      comment?: { id: string; body: string; createdAt: string; user?: { name: string; email?: string } };
    }> }).nodes;

    for (const n of notifs) {
      // Client-side date filter
      if (new Date(n.createdAt) < since) continue;
      if (n.issue) {
        result.notifications.push({
          type: n.type,
          issueIdentifier: n.issue.identifier,
          issueTitle: n.issue.title,
          actorName: n.actor?.name || "unknown",
          createdAt: n.createdAt,
        });

        // If it has a comment, add to recent comments
        if (n.comment && new Date(n.comment.createdAt) > since) {
          result.recentComments.push({
            ...n.comment,
            updatedAt: n.comment.createdAt,
            issue: { id: "", identifier: n.issue.identifier, title: n.issue.title },
          });
        }
      }
    }
  } catch (err) {
    console.error(`  Warning: notifications query failed: ${err instanceof Error ? err.message : err}`);
  }

  // Deduplicate comments by ID
  const seen = new Set<string>();
  result.recentComments = result.recentComments.filter(c => {
    if (seen.has(c.id)) return false;
    seen.add(c.id);
    return true;
  });

  // Update state
  state.lastPollAt = new Date().toISOString();
  state.pollCount++;
  saveState(hqRoot, state);

  return result;
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
        const userId = config.identity?.["linear-user-id"];

        console.log(`Checking Linear as: ${config.identity?.["display-name"] || config.identity?.owner || "unknown"}${userId ? ` (${userId.slice(0, 8)}...)` : ""}`);
        console.log(`Since: ${state.lastPollAt || `last ${config.linear?.heartbeat?.["initial-lookback-minutes"] || 60} minutes`}\n`);

        const result = await pollOnce(apiKey, config, state, hqRoot);

        const total = result.assigned.length + result.recentComments.length + result.notifications.length;
        if (total === 0) {
          console.log("No new activity.");
          return;
        }

        if (result.assigned.length > 0) {
          console.log(`Assigned to you (${result.assigned.length}):`);
          for (const a of result.assigned) {
            console.log(`  ${a.identifier} [${a.team}] ${a.title} — ${a.state}`);
          }
        }

        if (result.notifications.length > 0) {
          console.log(`\nNotifications (${result.notifications.length}):`);
          for (const n of result.notifications) {
            console.log(`  ${n.issueIdentifier}: ${n.type} by ${n.actorName}`);
          }
        }

        if (result.recentComments.length > 0) {
          console.log(`\nNew comments (${result.recentComments.length}):`);
          for (const c of result.recentComments) {
            const preview = c.body.length > 80 ? c.body.slice(0, 80) + "..." : c.body;
            console.log(`  ${c.issue?.identifier || "?"}: ${preview}`);
            console.log(`    by ${c.user?.name || "unknown"} at ${c.createdAt}`);
          }
          writeToInbox(hqRoot, result.recentComments);
          console.log(`\nWritten to workspace/hiamp/inbox/`);
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
        const identity = config.identity?.["display-name"] || config.identity?.owner || "unknown";

        console.log(`HIAMP heartbeat started (Linear transport)`);
        console.log(`  Identity: ${identity}`);
        console.log(`  Interval: ${intervalMinutes} min`);
        console.log(`  Teams:    ${config.linear?.teams?.map(t => t.key).join(", ") || "all"}`);
        console.log(`  Ctrl+C to stop\n`);

        // Initial poll
        const state = loadState(hqRoot);
        const result = await pollOnce(apiKey, config, state, hqRoot);
        console.log(`[${new Date().toISOString()}] Poll #${state.pollCount}: ${result.assigned.length} assigned, ${result.recentComments.length} comments, ${result.notifications.length} notifications`);
        writeToInbox(hqRoot, result.recentComments);

        // Polling loop
        const interval = setInterval(async () => {
          try {
            const currentState = loadState(hqRoot);
            const pollResult = await pollOnce(apiKey, config, currentState, hqRoot);
            console.log(`[${new Date().toISOString()}] Poll #${currentState.pollCount}: ${pollResult.assigned.length} assigned, ${pollResult.recentComments.length} comments, ${pollResult.notifications.length} notifications`);
            writeToInbox(hqRoot, pollResult.recentComments);
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
        console.log(`  Name:       ${config.identity?.["display-name"] || "not set"}`);

        if (config.transport === "linear") {
          const teams = config.linear?.teams?.map((t) => `${t.key} (${t.name})`).join(", ") || "none";
          console.log(`  Org:        ${config.linear?.["org-name"] || config.linear?.org || "not set"}`);
          console.log(`  Linear ID:  ${config.identity?.["linear-user-id"] || "not set — run 'hq hiamp setup' to discover"}`);
          console.log(`  Default:    ${config.linear?.["default-team"] || "not set"}`);
          console.log(`  Teams:      ${teams}`);
          console.log(`  Interval:   ${config.linear?.heartbeat?.["interval-minutes"] || 5} min`);
          console.log(`  Assigned:   ${config.linear?.heartbeat?.["watch-assigned"] !== false ? "watching" : "off"}`);
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

  program
    .command("setup")
    .description("Auto-discover your Linear identity and update hiamp.yaml")
    .action(async () => {
      try {
        const hqRoot = findHqRoot();
        const configPath = path.join(hqRoot, "config", "hiamp.yaml");

        // Ensure config dir exists
        const configDir = path.join(hqRoot, "config");
        if (!fs.existsSync(configDir)) {
          fs.mkdirSync(configDir, { recursive: true });
        }

        // Load existing config or create minimal one
        let config: HiampConfig;
        let rawYaml: string;
        if (fs.existsSync(configPath)) {
          rawYaml = fs.readFileSync(configPath, "utf-8");
          config = loadConfig(hqRoot);
        } else {
          console.log("No hiamp.yaml found. Creating one...");
          rawYaml = "";
          config = { transport: "linear" };
        }

        const apiKey = resolveApiKey(config);

        console.log("Discovering your Linear identity...\n");

        // Fetch identity, teams, and org
        const data = await linearQuery(apiKey, `{
          viewer { id name email admin }
          teams { nodes { id key name } }
          organization { id name urlKey }
        }`);

        const viewer = data.viewer as { id: string; name: string; email: string; admin: boolean };
        const teams = (data.teams as { nodes: Array<{ id: string; key: string; name: string }> }).nodes;
        const org = data.organization as { id: string; name: string; urlKey: string };

        console.log(`Identity:     ${viewer.name} <${viewer.email}>${viewer.admin ? " (admin)" : ""}`);
        console.log(`Organization: ${org.name} (${org.urlKey})`);
        console.log(`Teams (${teams.length}):`);
        for (const t of teams) {
          console.log(`  ${t.key} — ${t.name} (${t.id})`);
        }

        // Build updated config
        const teamsYaml = teams.map(t =>
          `    - key: ${t.key.toLowerCase()}\n      name: ${t.name}\n      team-id: "${t.id}"`
        ).join("\n");

        const defaultTeam = teams.find(t => t.key === "DEV")?.key.toLowerCase()
          || teams[0]?.key.toLowerCase() || "default";

        const newConfig = `# HIAMP Configuration — Linear Transport
# Auto-generated by: hq hiamp setup
# Docs: knowledge/agent-protocol/configuration.md

transport: linear

identity:
  owner: ${viewer.name.split(" ")[0].toLowerCase()}
  display-name: "${viewer.name}"
  linear-user-id: "${viewer.id}"
  linear-email: "${viewer.email}"

linear:
  api-key: $LINEAR_API_KEY
  org: "${org.urlKey}"
  org-name: "${org.name}"
  default-team: ${defaultTeam}
  teams:
${teamsYaml}
  heartbeat:
    interval-minutes: 5
    initial-lookback-minutes: 60
    watch-assigned: true
    watch-teams: true

peers: []

settings:
  kill-switch: false
  enabled: true
`;

        fs.writeFileSync(configPath, newConfig);
        console.log(`\nConfig written to: ${configPath}`);
        console.log("Run 'hq hiamp status' to verify, 'hq hiamp check' to test.");
      } catch (error) {
        console.error("Error:", error instanceof Error ? error.message : error);
        process.exit(1);
      }
    });
}
