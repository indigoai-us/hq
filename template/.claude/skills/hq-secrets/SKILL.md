---
name: hq-secrets
description: Use hq CLI secrets commands safely — inject via exec, never handle raw values, generate links for human-supplied credentials.
allowed-tools: Bash(hq:*)
---

# HQ Secrets

Manage secrets stored in AWS SSM Parameter Store via the `hq secrets` CLI. Secrets are scoped per company and accessed through Cognito-authenticated API calls.

## Commands

| Command | Purpose |
|---------|---------|
| `hq secrets list` | List all secrets (names + metadata, no values) |
| `hq secrets get <NAME>` | Show secret metadata (value redacted by default) |
| `hq secrets get <NAME> --reveal` | Show metadata AND the decrypted value |
| `hq secrets set <NAME>` | Create/update a secret (interactive prompt, never echoed) |
| `hq secrets set <NAME> --from-stdin` | Create/update from piped input |
| `hq secrets delete <NAME>` | Delete a secret (prompts for confirmation) |
| `hq secrets delete <NAME> --force` | Delete without confirmation |
| `hq secrets exec --only KEY1,KEY2 -- <cmd>` | Run a command with secrets injected as env vars |
| `hq secrets generate-link <NAME>` | Generate a one-time URL for a human to submit a secret value |
| `hq secrets generate-link <NAME> --expires 2d` | Custom expiry (default 24h, max 7d) |
| `hq secrets cache clear` | Clear the local encrypted secrets cache |

All commands accept `--company <slug>` to target a specific company. If omitted, the CLI resolves your company from your membership.

Secret names must match `^[A-Z][A-Z0-9_]*$` (e.g. `MY_API_KEY`, `STRIPE_SECRET`).

## Safe Pattern: `exec`

`hq secrets exec` is the primary way to use secrets. It fetches values server-side, injects them as environment variables into the child process, and never writes values to its own stdout or stderr.

```bash
hq secrets exec --only DATABASE_URL,API_KEY -- npm run migrate
hq secrets exec --only AWS_ACCESS_KEY_ID,AWS_SECRET_ACCESS_KEY -- aws s3 ls
hq secrets exec --only OPENAI_API_KEY -- node script.js
```

The `--only` flag is required — there is no "inject all" mode. Name exactly the secrets the child process needs.

Results are cached locally (encrypted, 5-minute TTL) so repeated `exec` calls within a short window don't re-fetch from the API.

## Rules for Agent Workflows

1. **Use `exec` to inject secrets into commands.** Do not use `get --reveal` to read a value and then pass it manually. Let `exec` handle the injection.

2. **Never capture `exec` output to extract secrets.** Do not wrap `hq secrets exec` in command substitution (`$(...)` or backticks), pipe its output to another tool, or attempt to parse the child process's stdout/stderr for secret values. Run `exec` as a terminal command and let the child process use the env vars directly.

3. **Do not run commands that print environment variables inside `exec`.** Commands like `env`, `printenv`, `echo $SECRET`, `node -e "console.log(process.env.X)"`, or `set` would expose secret values in the agent's visible output. Only run the actual workload command.

4. **`get` redacts by default.** Use `hq secrets get <NAME>` freely to check metadata (last modified, version). The value is shown as `[REDACTED]` unless you pass `--reveal`.

5. **Do not use `get --reveal` in agent workflows** unless the human has explicitly asked you to display a secret value. This is an escape hatch for human-in-the-loop steps, not for agent automation.

6. **Use `generate-link` for human-supplied credentials.** When a workflow needs a secret that the agent should not see (vendor API keys, personal tokens, third-party credentials), generate a one-time submission link and give it to the human:

   ```bash
   hq secrets generate-link VENDOR_API_KEY --expires 1h
   ```

   The human opens the URL, enters the value, and it goes straight to SSM without the agent ever seeing it.

7. **Use `list` to discover available secrets.** Before running `exec`, check what secrets exist for the company.

## Honest Guardrail Framing

The `exec` command makes the safe path the easy path: secrets are injected as env vars into a child process, and the CLI itself never prints values. The `get` command redacts values by default.

However, these are prompt-level guidelines, not technical enforcement. If the child process run via `exec` is designed to print its environment variables (e.g. `env`, `printenv`), those values will appear in subprocess output that the agent can see. The CLI cannot prevent this — it relies on you, the agent, not running such commands and not capturing subprocess output for the purpose of extracting secrets.

The design makes accidental exposure unlikely. Intentional circumvention is possible but violates the contract.

## Common Workflows

### Deploy with secrets

```bash
hq secrets exec --only DATABASE_URL,REDIS_URL -- npm run deploy
```

### Run tests against a staging API

```bash
hq secrets exec --only STAGING_API_KEY -- npm test
```

### Ask a teammate to provide a credential

```bash
hq secrets generate-link STRIPE_SECRET_KEY --expires 4h
# Share the printed URL with the teammate
```

### Check what secrets exist

```bash
hq secrets list --company myco
```

### Store a secret from a script

```bash
echo "$VALUE" | hq secrets set NEW_SECRET --from-stdin
```

### Clear stale cache

```bash
hq secrets cache clear
```
