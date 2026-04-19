# Gemini CLI Setup

## Installation

```bash
npm install -g @google/gemini-cli
```

## Authentication

**API Key (required for workers — non-interactive):**
1. Get key from https://aistudio.google.com/app/apikey
2. Store in `settings/gemini/credentials.env` as `GEMINI_API_KEY=<key>`
3. All worker skills read this file at invocation time

**Google OAuth (interactive only):**
- Run `gemini` once, follow browser auth flow
- Free tier: 60 req/min, 1000 req/day
- Not suitable for non-interactive worker execution

## Models

| Model | Use case | Speed | Quality |
|-------|----------|-------|---------|
| `pro` | Complex generation, UI, multi-file | Slower | Highest |
| `flash` | Review, analysis, quick tasks | Fast | Good |
| `flash-lite` | Simple queries, formatting | Fastest | Basic |
| `auto` | Let Gemini choose (default) | Varies | Varies |

## Key Flags

| Flag | Short | Description |
|------|-------|-------------|
| `-p "prompt"` | | Non-interactive one-shot mode (required for workers) |
| `--model <name>` | `-m` | Select model (`pro`, `flash`, `flash-lite`, `auto`) |
| `--sandbox` | `-s` | Safer execution (restricted file/network access) |
| `--approval-mode` | | Tool execution control: `default`, `auto_edit`, `yolo` |
| `--output-format` | `-o` | Output format: `text`, `json`, `stream-json` |
| `--debug` | `-d` | Verbose logging for troubleshooting |

## GEMINI.md

Gemini CLI auto-loads `GEMINI.md` from the working directory (like CLAUDE.md). Place repo-specific context (architecture, patterns, conventions) in GEMINI.md for better generation quality.

## Rate Limits

- Free (OAuth): 60 req/min, 1000/day
- API key: depends on billing plan
- Workers should implement backoff on 429 errors
