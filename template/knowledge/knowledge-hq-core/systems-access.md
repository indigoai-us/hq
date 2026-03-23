---
type: reference
domain: [operations, engineering]
status: canonical
tags: [systems-access, credentials, external-services, company-routing, index]
relates_to: []
---

# Systems Access Index

How to access each external system per company. Use this to find credentials fast — don't search.

**Last updated:** 2026-02-13

## Quick Reference

| System | Company | Auth Method | MCP? | Credential Path |
|--------|---------|-------------|------|-----------------|
| Gmail | {Company} | OAuth2 tokens | `gmail` MCP | `companies/{company}/settings/gmail/` |
| Gmail | Personal | OAuth2 tokens | `gmail` MCP | `companies/personal/settings/gmail/` |
| Slack | {Company} ({Company}) | Bot + User tokens | `slack` MCP | `.mcp.json` env vars (tokens), `repos/public/slack-mcp/workspaces.json` (config) |
| Slack | Personal | Webhook | No | `companies/personal/settings/slack/webhook.json` |
| X (Twitter) | Personal | API keys | No | `.env` (root) |
| X (Twitter) | {Product} | API keys | No | `companies/{company}/settings/.env` |
| LinkedIn | Personal | Browser state | `agent-browser` | `settings/personal/browser-state/` |
| LinkedIn | {Product} | Browser state | `agent-browser` | (via social-kit.yaml auth_state_dir) |
| Stripe | {Company} | API keys | No | `companies/{company}/settings/stripe/` |
| Stripe ({Company}) | {Company} | API keys | No | `companies/{company}/settings/stripe-{company}/` |
| Linear | {Company} | API key | No | `companies/{company}/settings/linear/` |
| Linear | {Product} | API key | No | `companies/{company}/settings/linear/` |
| Linear | {Company} | API key | No | `companies/{company}/settings/linear/` |
| Attio | {Company} | API key | No | `companies/{company}/settings/attio/` |
| Infobip | {Company} | API key | No | `companies/{company}/settings/infobip/` |
| Shopify Partner | {Company} | API key | No | `companies/{company}/settings/shopify-partner/` |
| QuickBooks | {Company} | OAuth | No | `companies/{company}/settings/quickbooks/` |
| Deel | {Company} | API/OAuth | No | `companies/{company}/settings/deel/` |
| Gusto | {Company} | API/OAuth | No | `companies/{company}/settings/gusto/` |
| Meta/Facebook | {Company} | API key | No | `companies/{company}/settings/meta/` |
| Meta/Facebook | {Product} | API key | No | `companies/{company}/settings/meta/` |
| Loops | {Product} | API key | No | `companies/{company}/settings/loops/` |
| Figma | {Company} | API key | No | `companies/{company}/settings/figma/` |
| Google Drive | {Company} | OAuth | No | `companies/{company}/settings/google-drive/` |
| Google Cloud | {Company} | Service account | No | `companies/{company}/settings/google-cloud/` |
| Clerk | {Company} | API key | No | `companies/{company}/settings/clerk/` |
| Analytics | {Company} | Credentials | No | `companies/{company}/settings/analytics/` |
| Retool | {Company} | Browser state | `agent-browser` | `settings/retool/` + `companies/{company}/settings/browser-state/retool-auth.json` |
| Customer.io | {Company} | Browser state | `agent-browser` | `companies/{company}/settings/browser-state/customerio-auth.json` |
| Post-Bridge | All (social) | API key | No | `settings/post-bridge/.env` (placeholder — needs setup) |
| Vercel | Personal | OIDC token | No | `.env.local` (root) |
| Supabase | Personal | Access token | No | `.env.supabase-token` (root) |

## MCP Servers

Currently configured in `.mcp.json`:

| MCP Server | Transport | Source | What it does |
|------------|-----------|--------|--------------|
| `gmail` | stdio | `repos/public/advanced-gmail-mcp/` | Multi-account Gmail (read, send, draft, reply, search) |
| `slack` | stdio (local) | `repos/public/slack-mcp/` | Multi-workspace Slack (channels, messages, DMs, reactions) |
| `agent-browser` | stdio (npm) | `npx agent-browser` | Headless browser automation for any web service |

## Auth Patterns

### OAuth2 (Gmail, Google Drive, QuickBooks)
- `credentials.json` — OAuth app config (client_id, client_secret)
- `tokens/{account}.json` — per-account access + refresh tokens
- Tokens auto-refresh; re-auth if refresh fails: `npx tsx src/auth.ts {alias}`

### Slack Tokens (custom slack-mcp)
- Bot tokens (xoxb-) and user tokens (xoxp-) configured as env vars in `.mcp.json`
- Convention: `SLACK_TOKEN_{WORKSPACE}_BOT`, `SLACK_TOKEN_{WORKSPACE}_USER`
- User token enables: posting as you, searching messages, accessing private channels (via search fallback)
- User token missing `groups:read` scope — private channels resolved via `search.messages` fallback
- Tokens don't expire; revoke/regenerate in Slack app settings
- NEVER use the official Slack marketplace plugin — use custom slack-mcp only

### API Key (Stripe, Linear, Attio, X, Infobip, etc.)
- `credentials.json` or `.env` file in company settings dir
- Key stored as plain text; rotate via service dashboard

### Browser State (Retool, Customer.io, LinkedIn, Slack legacy)
- JSON files with cookies/session tokens from `agent-browser state save`
- Sessions expire — re-login with `agent-browser` when stale
- Being phased out in favor of proper API access

## Per-Company Summary

### {Company} ({Company})
Gmail, Slack ({Company}), Stripe (×2), Linear, Attio, Infobip, Shopify Partner, QuickBooks, Deel, Gusto, Meta, Google Cloud, Retool, Customer.io

### {Product}
X (API keys), Meta, Loops, Linear, LinkedIn (browser state), Post-Bridge (placeholder)

### {Company}
Linear, Figma, Google Drive, Clerk, Analytics

### Personal
Gmail, Slack (webhook only), X (API keys), LinkedIn (browser state), Vercel, Supabase, Post-Bridge (placeholder)

## Adding New Systems

1. Create `companies/{company}/settings/{system}/` directory
2. Store credentials there (credentials.json, .env, or tokens/)
3. Update this file
4. If MCP-accessible: add to `.mcp.json` and document above
5. Symlink to `settings/` root if cross-company access needed
