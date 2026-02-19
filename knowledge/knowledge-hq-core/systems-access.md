# Systems Access Index

How to access each external system per company. Use this to find credentials fast — don't search.

**Last updated:** 2026-02-13

## Quick Reference

| System | Company | Auth Method | MCP? | Credential Path |
|--------|---------|-------------|------|-----------------|
| Gmail | {Company-1} | OAuth2 tokens | `gmail` MCP | `companies/{company-1}/settings/gmail/` |
| Gmail | Personal | OAuth2 tokens | `gmail` MCP | `companies/personal/settings/gmail/` |
| Slack | {Company-1} (Voyage) | Bot token (xoxb-) | `slack` MCP | `repos/public/slack-mcp/workspaces.json` |
| Slack | Personal | Webhook | No | `companies/personal/settings/slack/webhook.json` |
| X (Twitter) | Personal | API keys | No | `.env` (root) |
| X (Twitter) | {Company-3} | API keys | No | `companies/{company-3}/settings/.env` |
| LinkedIn | Personal | Browser state | `agent-browser` | `settings/personal/browser-state/` |
| LinkedIn | {Company-3} | Browser state | `agent-browser` | (via social-kit.yaml auth_state_dir) |
| Stripe | {Company-1} | API keys | No | `companies/{company-1}/settings/stripe/` |
| Stripe (Voyage) | {Company-1} | API keys | No | `companies/{company-1}/settings/stripe-voyage/` |
| Linear | {Company-2} | API key | No | `companies/{company-2}/settings/linear/` |
| Linear | {Company-1} | API key | No | `companies/{company-1}/settings/linear/` |
| Attio | {Company-1} | API key | No | `companies/{company-1}/settings/attio/` |
| Infobip | {Company-1} | API key | No | `companies/{company-1}/settings/infobip/` |
| Shopify Partner | {Company-1} | API key | No | `companies/{company-1}/settings/shopify-partner/` |
| QuickBooks | {Company-1} | OAuth | No | `companies/{company-1}/settings/quickbooks/` |
| Deel | {Company-1} | API/OAuth | No | `companies/{company-1}/settings/deel/` |
| Gusto | {Company-1} | API/OAuth | No | `companies/{company-1}/settings/gusto/` |
| Meta/Facebook | {Company-1} | API key | No | `companies/{company-1}/settings/meta/` |
| Meta/Facebook | {Company-3} | API key | No | `companies/{company-3}/settings/meta/` |
| Loops | {Company-3} | API key | No | `companies/{company-3}/settings/loops/` |
| Figma | {Company-2} | API key | No | `companies/{company-2}/settings/figma/` |
| Google Drive | {Company-2} | OAuth | No | `companies/{company-2}/settings/google-drive/` |
| Google Cloud | {Company-1} | Service account | No | `companies/{company-1}/settings/google-cloud/` |
| Clerk | {Company-2} | API key | No | `companies/{company-2}/settings/clerk/` |
| Analytics | {Company-2} | Credentials | No | `companies/{company-2}/settings/analytics/` |
| Retool | {Company-1} | Browser state | `agent-browser` | `settings/retool/` + `companies/{company-1}/settings/browser-state/retool-auth.json` |
| Customer.io | {Company-1} | Browser state | `agent-browser` | `companies/{company-1}/settings/browser-state/customerio-auth.json` |
| Post-Bridge | All (social) | API key | No | `settings/post-bridge/.env` (placeholder — needs setup) |
| Vercel | Personal | OIDC token | No | `.env.local` (root) |
| Supabase | Personal | Access token | No | `.env.supabase-token` (root) |

## MCP Servers

Currently configured in `.mcp.json`:

| MCP Server | Transport | Source | What it does |
|------------|-----------|--------|--------------|
| `gmail` | HTTP (Vercel) | `repos/public/gmail-mcp/` | Multi-account Gmail (read, send, draft, reply, search) |
| `slack` | stdio (local) | `repos/public/slack-mcp/` | Multi-workspace Slack (channels, messages, DMs, reactions) |
| `agent-browser` | stdio (npm) | `npx agent-browser` | Headless browser automation for any web service |

## Auth Patterns

### OAuth2 (Gmail, Google Drive, QuickBooks)
- `credentials.json` — OAuth app config (client_id, client_secret)
- `tokens/{account}.json` — per-account access + refresh tokens
- Tokens auto-refresh; re-auth if refresh fails: `npx tsx src/auth.ts {alias}`

### Bot Token (Slack)
- `workspaces.json` — per-workspace bot tokens (xoxb-)
- Tokens don't expire; revoke/regenerate in Slack app settings
- Setup: `npx tsx src/auth.ts --setup`

### API Key (Stripe, Linear, Attio, X, Infobip, etc.)
- `credentials.json` or `.env` file in company settings dir
- Key stored as plain text; rotate via service dashboard

### Browser State (Retool, Customer.io, LinkedIn, Slack legacy)
- JSON files with cookies/session tokens from `agent-browser state save`
- Sessions expire — re-login with `agent-browser` when stale
- Being phased out in favor of proper API access

## Per-Company Summary

### {Company-1} (Voyage)
Gmail, Slack (Voyage), Stripe (×2), Linear, Attio, Infobip, Shopify Partner, QuickBooks, Deel, Gusto, Meta, Google Cloud, Retool, Customer.io

### {Company-3}
X (API keys), Meta, Loops, LinkedIn (browser state), Post-Bridge (placeholder)

### {Company-2}
Linear, Figma, Google Drive, Clerk, Analytics

### Personal
Gmail, Slack (webhook only), X (API keys), LinkedIn (browser state), Vercel, Supabase, Post-Bridge (placeholder)

## Adding New Systems

1. Create `companies/{company}/settings/{system}/` directory
2. Store credentials there (credentials.json, .env, or tokens/)
3. Update this file
4. If MCP-accessible: add to `.mcp.json` and document above
5. Symlink to `settings/` root if cross-company access needed
