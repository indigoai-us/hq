/**
 * GitHub App JWT generation and installation token creation
 *
 * Implements the GitHub App authentication flow:
 * 1. Generate JWT signed with App private key (RS256)
 * 2. Use JWT to request installation access tokens
 * 3. Scope tokens to specific repositories
 *
 * Private key and App ID are stored as SST Secrets — never in code.
 */

import { createSign } from "crypto";

/**
 * Base64url encode a buffer (no padding)
 */
function base64url(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input) : input;
  return buf.toString("base64url");
}

/**
 * Generate a JWT for GitHub App authentication (RS256)
 *
 * @param appId - GitHub App ID
 * @param privateKey - PEM-encoded RSA private key
 * @param ttlSeconds - Token lifetime (max 600 seconds per GitHub docs)
 * @returns Signed JWT string
 */
export function generateAppJwt(
  appId: string,
  privateKey: string,
  ttlSeconds: number = 600
): string {
  const now = Math.floor(Date.now() / 1000);

  const header = {
    alg: "RS256",
    typ: "JWT",
  };

  const payload = {
    iat: now - 60, // Issued 60s in the past to account for clock drift
    exp: now + ttlSeconds,
    iss: appId,
  };

  const headerB64 = base64url(JSON.stringify(header));
  const payloadB64 = base64url(JSON.stringify(payload));
  const signingInput = `${headerB64}.${payloadB64}`;

  const signer = createSign("RSA-SHA256");
  signer.update(signingInput);
  const signature = signer.sign(privateKey, "base64url");

  return `${signingInput}.${signature}`;
}

/**
 * Get an installation access token for a GitHub App installation
 *
 * @param jwt - GitHub App JWT
 * @param installationId - GitHub App installation ID
 * @param options - Optional: scope token to specific repos or permissions
 * @returns Installation access token response
 */
export async function getInstallationToken(
  jwt: string,
  installationId: string,
  options?: {
    repositories?: string[];
    permissions?: Record<string, string>;
  }
): Promise<{
  token: string;
  expires_at: string;
  permissions: Record<string, string>;
  repositories?: Array<{ name: string; full_name: string }>;
}> {
  const body: Record<string, unknown> = {};
  if (options?.repositories && options.repositories.length > 0) {
    body.repositories = options.repositories;
  }
  if (options?.permissions) {
    body.permissions = options.permissions;
  }

  const response = await fetch(
    `https://api.github.com/app/installations/${installationId}/access_tokens`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "HQ-Team-Sync",
      },
      body: Object.keys(body).length > 0 ? JSON.stringify(body) : undefined,
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `GitHub API error (${response.status}): ${errorText}`
    );
  }

  return response.json() as any;
}

/**
 * List installations for the authenticated GitHub App
 *
 * @param jwt - GitHub App JWT
 * @returns Array of installations
 */
export async function listInstallations(
  jwt: string
): Promise<
  Array<{
    id: number;
    account: { login: string; type: string };
    app_id: number;
    target_type: string;
    permissions: Record<string, string>;
  }>
> {
  const response = await fetch("https://api.github.com/app/installations", {
    headers: {
      Authorization: `Bearer ${jwt}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "HQ-Team-Sync",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `GitHub API error (${response.status}): ${errorText}`
    );
  }

  return response.json() as any;
}

/**
 * Get details about the authenticated GitHub App
 *
 * @param jwt - GitHub App JWT
 * @returns App details including name, permissions, events
 */
export async function getAppInfo(
  jwt: string
): Promise<{
  id: number;
  name: string;
  owner: { login: string };
  permissions: Record<string, string>;
  installations_count: number;
}> {
  const response = await fetch("https://api.github.com/app", {
    headers: {
      Authorization: `Bearer ${jwt}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "HQ-Team-Sync",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `GitHub API error (${response.status}): ${errorText}`
    );
  }

  return response.json() as any;
}
