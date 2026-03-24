---
title: "CLI Schema Generation Patterns for Agent Tool Calling"
category: agent-tooling
tags: ["tool-design", "cli", "mcp", "function-calling", "go", "production-patterns"]
source: "https://cobra.dev/docs/how-to-guides/clis-for-llms/, https://pkg.go.dev/github.com/eat-pray-ai/cobra-mcp, https://github.com/njayp/ophis, https://github.com/reeflective/flags"
confidence: 0.8
created_at: 2026-03-25T00:00:00Z
updated_at: 2026-03-25T00:00:00Z
---

Patterns for generating structured tool schemas from Go CLI frameworks so agents get validated parameters instead of free-form strings.

## The Problem

When agents invoke CLI tools, they need structured schemas (JSON Schema or MCP tool definitions) describing valid flags, types, and constraints. Without schemas, agents hallucinate flags, pass wrong types, or miss required parameters. The question is how to derive these schemas from existing CLI definitions rather than maintaining them by hand.

## Three Tiers of Approaches

### Tier 1: Auto-Generated Schemas (Cobra → MCP via Ophis)

[Ophis](https://github.com/njayp/ophis) automatically converts Cobra CLIs into MCP servers by:

1. **Command discovery**: Recursively walks the Cobra command tree
2. **Schema generation**: Creates JSON Schema from command flags and arguments — maps pflag types (string, int, bool, stringSlice, etc.) to JSON Schema types automatically
3. **Tool execution**: Spawns the CLI as a subprocess and captures output

Integration is one line: add `ophis` to your Cobra root, and it provides `mcp` subcommand with `claude enable`, `vscode enable` etc. Schemas are derived at runtime from the live command tree — no manual sync required.

**Tradeoff**: Subprocess execution per tool call adds latency. Schema accuracy depends on how well pflag types map to the needed constraints (e.g., enums, patterns, ranges are lost unless the flag type encodes them).

### Tier 2: Schema-First with In-Process Execution (cobra-mcp)

[cobra-mcp](https://pkg.go.dev/github.com/eat-pray-ai/cobra-mcp) takes the opposite approach — **you write the JSON Schema manually**, but get in-process execution:

```go
var schema = &jsonschema.Schema{
    Type:     "object",
    Required: []string{"name"},
    Properties: map[string]*jsonschema.Schema{
        "name": {Type: "string", Description: "Who to greet"},
    },
}

mcp.AddTool(server, &mcp.Tool{
    Name: "hello", InputSchema: schema,
}, cobramcp.GenToolHandler("hello", helloFunc))
```

Key features:
- **Typed generics**: `GenToolHandler[T]` deserializes JSON input into a Go struct
- **In-process**: Tool handlers call Go functions directly — no subprocess overhead
- **Transport included**: Generated `mcp` command handles stdio and HTTP

**Tradeoff**: Manual schema maintenance. Schemas and Cobra flag definitions can drift. Best when you want precise control over what agents see.

### Tier 3: LLM-Ready Documentation (Cobra built-in)

Cobra's [doc generator](https://cobra.dev/docs/how-to-guides/clis-for-llms/) produces structured Markdown from the command tree:

```go
root := cmd.Root()
root.DisableAutoGenTag = true
doc.GenMarkdownTree(root, outputDir)
```

Output: one file per command with Usage, Synopsis, Examples, Options, and inherited options. This is **not** JSON Schema — it's structured text that LLMs can parse from context windows or `llms.txt` files.

Best practices:
- Populate `Example` on every command — agents rely on concrete I/O patterns
- Add context in `Long` (what/why, not just syntax)
- Set `GroupID` on commands for logical sections

**Tradeoff**: No formal schema validation. Agents must parse prose to extract flags. Works well for chat-based assistance but not for structured tool-calling protocols like MCP.

## Hybrid Pattern: Auto-Generate + Override

The most practical production pattern combines tiers:

1. **Start with auto-generation** (Ophis-style) to get baseline schemas from the command tree
2. **Override specific tools** with hand-crafted schemas where you need enums, patterns, or richer descriptions
3. **Generate Markdown docs** alongside for LLM context that supplements the schema

This avoids maintaining all schemas by hand while allowing precision where it matters.

## Struct-to-Cobra Generation (reeflective/flags)

For the reverse direction — generating Cobra command trees from Go structs — [reeflective/flags](https://github.com/reeflective/flags) maps struct fields with tags to Cobra commands and flags. This is useful when your source of truth is a config struct, and you want both CLI flags and JSON Schema derived from the same type definition.

## Key Takeaway

The strongest guarantee comes from **schema-level enforcement** where the agent's tool call is validated against JSON Schema before execution. Auto-generation from Cobra eliminates manual sync but sacrifices fine-grained constraints. The choice depends on how much control you need over what agents can express.
