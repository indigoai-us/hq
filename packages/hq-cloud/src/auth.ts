/**
 * Authentication — OAuth flow with IndigoAI
 * Opens browser for sign-in, receives tokens via localhost callback
 */

import * as fs from "fs";
import * as path from "path";
import * as http from "http";
import open from "open";
import type { Credentials } from "./types.js";

const AUTH_URL = "https://hq.indigoai.com/auth";
const CALLBACK_PORT = 19847;
const CREDS_DIR = path.join(
  process.env.HOME || process.env.USERPROFILE || "~",
  ".hq"
);
const CREDS_FILE = path.join(CREDS_DIR, "credentials.json");

export function hasCredentials(): boolean {
  return fs.existsSync(CREDS_FILE);
}

export function readCredentials(): Credentials | null {
  if (!fs.existsSync(CREDS_FILE)) return null;
  try {
    const content = fs.readFileSync(CREDS_FILE, "utf-8");
    return JSON.parse(content) as Credentials;
  } catch {
    return null;
  }
}

export function writeCredentials(creds: Credentials): void {
  if (!fs.existsSync(CREDS_DIR)) {
    fs.mkdirSync(CREDS_DIR, { recursive: true });
  }
  fs.writeFileSync(CREDS_FILE, JSON.stringify(creds, null, 2), { mode: 0o600 });
}

export function clearCredentials(): void {
  if (fs.existsSync(CREDS_FILE)) {
    fs.unlinkSync(CREDS_FILE);
  }
}

/**
 * Start OAuth flow:
 * 1. Open browser to AUTH_URL with callback port
 * 2. Start localhost server to receive tokens
 * 3. Store credentials
 */
export async function authenticate(): Promise<Credentials> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url || "", `http://localhost:${CALLBACK_PORT}`);

      if (url.pathname === "/callback") {
        const token = url.searchParams.get("token");
        const refreshToken = url.searchParams.get("refresh_token");
        const userId = url.searchParams.get("user_id");
        const bucket = url.searchParams.get("bucket");
        const region = url.searchParams.get("region") || "us-east-1";

        if (!token || !refreshToken || !userId || !bucket) {
          res.writeHead(400, { "Content-Type": "text/html" });
          res.end("<h1>Authentication failed</h1><p>Missing required parameters. Please try again.</p>");
          server.close();
          reject(new Error("Authentication failed: missing parameters"));
          return;
        }

        const creds: Credentials = {
          accessKeyId: "", // Will be populated via STS
          secretAccessKey: "",
          refreshToken,
          userId,
          bucket,
          region,
        };

        writeCredentials(creds);

        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(
          "<h1>Authenticated!</h1><p>You can close this window and return to your terminal.</p>"
        );

        server.close();
        resolve(creds);
      }
    });

    server.listen(CALLBACK_PORT, () => {
      const authUrl = `${AUTH_URL}?callback=http://localhost:${CALLBACK_PORT}/callback`;
      console.log(`  Opening browser for authentication...`);
      console.log(`  If browser doesn't open, visit: ${authUrl}`);
      open(authUrl).catch(() => {
        // If open fails, user can manually visit the URL
      });
    });

    // Timeout after 5 minutes
    setTimeout(() => {
      server.close();
      reject(new Error("Authentication timed out after 5 minutes"));
    }, 5 * 60 * 1000);
  });
}

/**
 * Refresh temporary AWS credentials using refresh token
 */
export async function refreshAwsCredentials(
  creds: Credentials
): Promise<Credentials> {
  const response = await fetch("https://hq.indigoai.com/api/auth/refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken: creds.refreshToken }),
  });

  if (!response.ok) {
    throw new Error(`Failed to refresh credentials: ${response.statusText}`);
  }

  const data = (await response.json()) as {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken: string;
    expiration: string;
  };

  const updated: Credentials = {
    ...creds,
    accessKeyId: data.accessKeyId,
    secretAccessKey: data.secretAccessKey,
    sessionToken: data.sessionToken,
    expiration: data.expiration,
  };

  writeCredentials(updated);
  return updated;
}
