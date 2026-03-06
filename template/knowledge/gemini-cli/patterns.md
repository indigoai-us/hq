# Gemini CLI Invocation Patterns

## Loading API Key

```bash
KEY=$(grep GEMINI_API_KEY settings/gemini/credentials.env | cut -d= -f2)
```

## One-Shot Generation

```bash
cd {repo} && GEMINI_API_KEY=$KEY gemini -p "prompt" --model pro --sandbox --output-format text 2>&1
```

## Piped Context

```bash
cd {repo} && cat file1.ts file2.ts | GEMINI_API_KEY=$KEY gemini -p "Given this code, ..." --model flash --sandbox 2>&1
```

## Full-Auto (file writes allowed)

```bash
cd {repo} && GEMINI_API_KEY=$KEY gemini -p "prompt" --approval-mode yolo --model pro 2>&1
```

## JSON Output (structured)

```bash
cd {repo} && GEMINI_API_KEY=$KEY gemini -p "prompt" --output-format json --model flash 2>&1
```

## Error Handling

- Exit code 0 = success
- Exit code 1 = error (parse stderr)
- 429 = rate limited (wait and retry)
- Timeout: set via worker `max_runtime` (gemini has no built-in timeout flag)

## Output Parsing

- `text` mode: raw markdown/text on stdout
- `json` mode: JSON object on stdout, parse with `jq` or in-process
- `stream-json` mode: newline-delimited JSON chunks (for streaming)
