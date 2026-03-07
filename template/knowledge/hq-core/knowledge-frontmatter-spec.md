---
confidence: 1.0
last_validated: "2026-03-06"
created_at: "2026-03-06"
sources:
  - "projects/hq-virtuous-cycle/prd.json"
related:
  - "knowledge/patterns/virtuous-cycle.md"
  - "scripts/knowledge-decay.sh"
tags:
  - hq-core
  - knowledge-system
  - virtuous-cycle
decay_rate: 0.02
access_count: 0
---
# Knowledge Frontmatter Spec

Standard YAML frontmatter schema for HQ knowledge files. Enables confidence tracking, decay scoring, and revalidation prioritization.

## Schema

All knowledge files that participate in the virtuous cycle MUST include YAML frontmatter between `---` delimiters at the top of the file.

### Required Fields

| Field | Type | Description | Default |
|-------|------|-------------|---------|
| `confidence` | float (0.0-1.0) | Current confidence score. 1.0 = fully validated, 0.0 = untrusted. | 0.8 for existing files |
| `last_validated` | string (ISO8601 date) | Date when the content was last verified as accurate. | File creation date |
| `created_at` | string (ISO8601 date) | Date when the knowledge file was originally created. | Git first-commit date |

### Optional Fields

| Field | Type | Description | Default |
|-------|------|-------------|---------|
| `sources` | list of strings | URLs, thread IDs, or file paths that substantiate this knowledge. | `[]` |
| `related` | list of strings | Paths to other knowledge files that are related. | `[]` |
| `tags` | list of strings | Categorical tags for discovery and grouping. | `[]` |
| `decay_rate` | float | Confidence decay per week since `last_validated`. | 0.02 |
| `access_count` | integer | Number of times this knowledge has been accessed/referenced. | 0 |

## Example

```yaml
---
confidence: 0.85
last_validated: "2026-03-01"
created_at: "2026-02-15"
sources:
  - "https://docs.example.com/api"
  - "workspace/threads/T-20260215-session.json"
related:
  - "knowledge/integrations/slack.md"
  - "knowledge/hq-core/quick-reference.md"
tags:
  - integration
  - api
decay_rate: 0.02
access_count: 5
---
# My Knowledge File

Content starts here...
```

## Decay Formula

```
effective_confidence = confidence - (decay_rate * weeks_since_last_validated)
```

Where `weeks_since_last_validated` is calculated as:
```
floor((today - last_validated) / 7)
```

- Decay is applied by `scripts/knowledge-decay.sh`
- The script updates the `confidence` field in-place
- Minimum confidence is 0.0 (never goes negative)

## Confidence Thresholds

| Range | Meaning | Action |
|-------|---------|--------|
| 0.8 - 1.0 | High confidence | No action needed |
| 0.5 - 0.79 | Moderate confidence | Consider revalidation |
| 0.3 - 0.49 | Low confidence | Prioritize for revalidation |
| 0.0 - 0.29 | Very low confidence | Warning banner added automatically |

## Warning Banner

Files that drop below 0.3 confidence get a visible warning banner inserted after the frontmatter:

```
> WARNING: This knowledge has low confidence (0.28). It may be outdated.
```

The banner is added/updated by `scripts/knowledge-decay.sh` and removed when confidence is restored above 0.3 via revalidation.

## Revalidation

To revalidate a knowledge file:
1. Verify the content is still accurate
2. Update `last_validated` to today's date
3. Set `confidence` to an appropriate value (typically 0.9-1.0)
4. Update `sources` if new evidence was found

## Observations

When the decay script processes files, it emits observations for:
- Any file dropping below 0.5 confidence (needs revalidation)
- Any file dropping below 0.3 confidence (warning banner added)

Observations are written to `workspace/observations/` for consumption by the curiosity engine (US-004).

## Scope

Not every knowledge file needs frontmatter. Start with the most-referenced files (top 20) and expand as the system matures. Files without frontmatter are ignored by the decay script.

## File Types

Only markdown (`.md`) files support frontmatter. JSON, YAML, and TypeScript knowledge files are excluded from the decay system.
