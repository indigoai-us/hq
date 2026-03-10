# Effective Skill Patterns

Patterns extracted from high-performing skills (video-gen, deep-research) that
make skills prescriptive and reliable. Apply these when writing or upgrading skills.

## 1. Phase Structure with Stopping Criteria

Break work into numbered phases with explicit exit conditions.

**Do:**
```markdown
### Phase 3: Iterative Search Loop

Per iteration:
1. Select next axis
2. Execute WebSearch
3. Read top 2-3 results
4. Extract findings as bullets
5. Decide: follow lead or next axis

Stopping criteria — exit when ANY:
- All axes searched
- Max 10 iterations reached
- Last 2 iterations produced no new findings
```

**Don't:**
```markdown
### Research
Search the web for relevant information and compile findings.
```

## 2. Exact Command Syntax

Show the actual commands to run, not descriptions of what to do.

**Do:**
```bash
cd ~/repos/chatterbox-finetuning
.venv/bin/python inference.py \
  --text "The text to synthesize." \
  --model "$WORKSPACE/voice-cloning-model/t3_finetuned.safetensors" \
  --output "$WORKSPACE/videos/1-intro/audio/1-hook.wav"
```

**Don't:**
```markdown
Run the inference script with the appropriate text and model parameters.
```

## 3. Parameter Tables

Document every tool/command parameter with defaults and descriptions.

```markdown
| Arg | Default | Description |
|-----|---------|-------------|
| `--seed` | 42 | Random seed for reproducibility |
| `--temperature` | 0.8 | Voice variation (0.6-1.0) |
```

## 4. Constraint Language

Use **CRITICAL**, **NEVER**, **ALWAYS** for hard rules. Organize rules into
subsections (e.g., Pipeline integrity, Workspace hygiene, Workflow).

**Do:**
```markdown
### Pipeline integrity
- **Mono audio only**: Always use `-ac 1`. Stereo causes near-silent bug
- **Explicit stream mapping**: Always use `-map 0:v -map 1:a` when merging
```

**Don't:**
```markdown
## Rules
- Use mono audio
- Map streams correctly
```

## 5. Workspace & File Layouts

Show ASCII trees for expected directory structures.

```markdown
```
workspace/
├── remotion/
│   ├── src/
│   │   ├── Root.jsx
│   │   └── scenes/
│   └── public/
└── videos/
    └── {n}-{name}/
        ├── script.json
        └── audio/
```
```

## 6. Fallback Paths

Specify what to do when things fail, not just the happy path.

**Do:**
```markdown
For dead links:
1. Retry once (transient failures)
2. If still dead, search for alternative source
3. If found, replace URL
4. If not found, flag as [unverified]
```

**Don't:**
```markdown
Handle dead links appropriately.
```

## 7. Phase Outputs

State what each phase produces as a verifiable artifact.

```markdown
### Phase 2: Search Plan
Output: 3-7 research axes with 1-2 candidate queries each
```

## 8. Quick Reference

For complex skills, add a condensed cheat sheet near the top.

```markdown
## Quick Reference
| Action | Command |
|--------|---------|
| Run tests | `npm test` |
| Lint | `npx biome check --fix` |
| Type check | `npx tsc --noEmit` |
```

## 9. Settings Tables with Reasoning

Don't just list settings — explain why each value was chosen.

```markdown
| Setting | Value | Reason |
|---------|-------|--------|
| CRF | 15 | YouTube-recommended quality |
| Channels | Mono | Stereo causes near-silent audio bug |
```

## 10. Source Tracking & Verification

Design skills to produce auditable output. Track sources, verify results,
maintain provenance.

## Anti-patterns

- **Role-play preamble**: "You are a backend developer who..." — just state
  what to do
- **Vague responsibilities**: "Handle errors appropriately" — specify how
- **Missing commands**: "Run the linter" — show the exact command
- **Flat rule lists**: 15 rules in one section — group into subsections
- **No stopping criteria**: "Research until done" — define when "done" means
- **No fallbacks**: Only describing the happy path
