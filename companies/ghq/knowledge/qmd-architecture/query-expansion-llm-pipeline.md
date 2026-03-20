---
title: "QMD Query Expansion LLM Pipeline"
category: qmd-architecture
tags: ["qmd", "retrieval", "llm", "query-expansion", "fine-tuning"]
source: "https://github.com/tobi/qmd, https://deepwiki.com/tobi/qmd/3.2-search-modes-explained, https://huggingface.co/tobil/qmd-query-expansion-1.7B"
confidence: 0.92
created_at: 2026-03-20T00:00:00Z
updated_at: 2026-03-20T00:00:00Z
---

QMD's `query` command expands a raw user query into typed `lex`/`vec`/`hyde` sub-queries via a fine-tuned local LLM.

## Model

**qmd-query-expansion-1.7B** — a LoRA fine-tune of **Qwen3-1.7B** with `/no_think` forced to suppress chain-of-thought output. Available on HuggingFace:

- Merged: `tobil/qmd-query-expansion-1.7B`
- GGUF quantized: `tobil/qmd-query-expansion-1.7B-gguf`
- SFT adapter only: `tobil/qmd-query-expansion-1.7B-sft`

Earlier versions used a **Qwen3-0.6B** base; the 1.7B model replaced it with stronger named-entity preservation and HyDE quality.

## Prompt Template

```
/no_think Expand this search query: <query>
```

When an `intent` parameter is provided:

```
/no_think Expand this search query: <query>
Query intent: <intent>
```

The `/no_think` prefix tells Qwen3 to skip `<think>` blocks and emit typed lines directly.

## Output Format

The model produces 1–3 lines per sub-query type. `hyde:` always appears first when present:

```
hyde: Authentication can be configured by setting the AUTH_SECRET environment variable.
lex: authentication configuration
lex: auth settings setup
vec: how to configure authentication settings
vec: authentication configuration options
```

| Prefix | Backend | Style |
|--------|---------|-------|
| `lex:` | BM25 FTS5 | Short keyword phrases; supports `"quoted phrases"` and `-negation` |
| `vec:` | Vector embedding | Natural language, semantically rich |
| `hyde:` | HyDE embedding | Hypothetical document passage, 50–200 chars |

Any output line with an invalid prefix causes a hard failure (parse error). Lines missing a prefix are rejected.

## Training

- **Method**: SFT (Supervised Fine-Tuning) — production default. GRPO available experimentally.
- **LoRA config**: rank 16, alpha 32, targeting all projection layers
- **Training data**: ~1,000 examples in `finetune/data/qmd_expansion_v2.jsonl`
- **Entry point**: `cmd_sft()` in `finetune/train.py`, configured via `finetune/configs/sft.yaml`

### Reward Scoring (GRPO / eval)

| Dimension | Max Points | What it measures |
|-----------|-----------|------------------|
| Format | 30 | Valid prefix lines, no leakage tokens |
| Diversity | 30 | Multiple types with distinct content |
| HyDE | 20 | Present and 50–200 chars |
| Quality | 20 | Natural language + key term preservation |
| Entity | −45 to +20 | Named entity handling |

Eval results: 93.8% token accuracy, 92.0% average reward, 30/30 "excellent" on eval set.

## Strong-Signal Bypass

When BM25 returns a dominant top result, expansion is skipped:

- Top BM25 score **≥ 0.85** AND
- Gap between rank-1 and rank-2 **≥ 0.15**

Bypass reduces latency from ~16s → ~1s. **Disabled** when `intent` is provided, since intent signals the user wants a focused search even if BM25 looks confident.

## Caching

Expanded results are cached in the `llm_cache` SQLite table (keyed by query hash). Identical queries skip model inference entirely.

## Runtime Integration

The model runs via `llama-cpp` bindings in `src/llm.ts`. The `expandQuery(query, { intent })` function is available in the SDK for callers that want manual control over sub-queries:

```typescript
const results = await store.search({
  queries: [
    { type: 'lex', query: '"connection pool" timeout -redis' },
    { type: 'vec', query: 'why do database connections time out' },
    { type: 'hyde', query: 'Connection pooling timeout errors occur when...' },
  ],
})
```
