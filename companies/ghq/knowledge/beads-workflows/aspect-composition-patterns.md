---
title: "Aspect Composition Patterns for bd Formulas"
category: beads-workflows
tags: ["beads", "composition", "production-patterns", "security", "compliance"]
source: "https://en.wikipedia.org/wiki/Aspect-oriented_programming, https://doc.postsharp.net//custompatterns/aspects/dependencies/aspect-dependencies, https://docs.spring.io/spring-framework/docs/4.3.15.RELEASE/spring-framework-reference/html/aop.html, https://link.springer.com/chapter/10.1007/11914853_12"
confidence: 0.55
created_at: "2026-03-25T00:00:00Z"
updated_at: "2026-03-25T00:00:00Z"
---

Practical patterns for composing bd formula aspects (security, logging, compliance) across workflows.

## Status: Early / Theoretical

The bd formula aspect system is documented in the specification (see `formula-specification.md`) but no public real-world aspect libraries or community examples exist yet. The patterns below synthesize AOP best practices from mature ecosystems (Spring AOP, AspectJ, PostSharp) applied to bd's formula model.

## How bd Aspects Work (Recap)

A bd aspect formula has `type = "aspect"` and contains `[[advice]]` blocks that target steps by glob pattern. Advice can be `before`, `after`, or `around` (which has both `before[]` and `after[]` lists). Aspects are applied via the `[compose]` block:

```toml
[compose]
aspects = ["security-audit", "logging", "compliance-check"]
```

Or auto-attached via hooks:

```toml
[[compose.hooks]]
trigger = "label:security"
attach = "security-scan"
```

## Pattern 1: Layered Aspect Stack

Order aspects by execution concern — outermost wraps innermost:

```
logging → security → compliance → [original step] → compliance → security → logging
```

In `compose.aspects`, list from outermost to innermost:

```toml
[compose]
aspects = ["logging", "security-scan", "compliance-check"]
```

**Why this order:**
- **Logging** outermost so it captures everything, including security/compliance failures
- **Security** before compliance so unauthorized requests are rejected before compliance evaluation
- **Compliance** closest to the step since it validates the step's specific content

## Pattern 2: Targeted Aspects via Glob Patterns

Rather than applying aspects globally, scope them to relevant steps:

```toml
# security-scan.formula.toml
formula = "security-scan"
type = "aspect"

[[advice]]
target = "*.deploy"           # Only deploy steps
[advice.before]
id = "sec-scan-{step.id}"
title = "Security scan before {step.title}"

[[advice]]
target = "*.release"          # Also release steps
[advice.before]
id = "sec-gate-{step.id}"
title = "Security gate for {step.title}"
```

**Best practice:** Use the most specific glob that covers the intended steps. `*.deploy` is better than `*` — avoids weaving security scans into design or documentation steps where they add no value.

## Pattern 3: Compose Hooks for Dynamic Attachment

Use label-based hooks to auto-attach aspects when steps are tagged appropriately:

```toml
[[compose.hooks]]
trigger = "label:pii"
attach = "data-privacy-scan"

[[compose.hooks]]
trigger = "label:external-api"
attach = "api-security-audit"

[[compose.hooks]]
trigger = "label:production"
attach = "compliance-check"
```

This makes aspect application declarative — teams label their steps, and cross-cutting concerns attach automatically.

## Pattern 4: Aspect Inheritance for Org-Wide Policies

Use `extends` to create base workflows with mandatory aspects, then let teams specialize:

```toml
# base-deploy.formula.toml
formula = "base-deploy"
type = "workflow"

[compose]
aspects = ["security-scan", "audit-logging", "compliance-check"]

# Steps that all deployments share...
```

```toml
# team-deploy.formula.toml
formula = "team-deploy"
extends = ["base-deploy"]

# Team-specific steps — inherits all base aspects automatically
```

## Aspect Ordering and Conflict Resolution

### Known AOP Ordering Principles (from Spring/AspectJ)

When multiple aspects match the same step:

1. **Explicit ordering matters.** The position in the `aspects = [...]` array determines execution order (first = outermost).
2. **Before advice runs top-down** (first aspect's before runs first).
3. **After advice runs bottom-up** (last aspect's after runs first, unwinding the stack).
4. **Around advice nests** — the first aspect's around wraps the second's.

### Conflict Patterns to Avoid

| Conflict | Example | Resolution |
|----------|---------|------------|
| Contradictory gates | Security aspect rejects, compliance aspect approves | Security should always take precedence — place it before compliance |
| Duplicate logging | Both a logging aspect and an audit aspect emit logs | Separate concerns: logging = operational, audit = compliance trail |
| Step ID collisions | Two aspects both inject `security-scan-{step.id}` | Namespace aspect-injected step IDs: `{aspect-name}-{step.id}` |

## Limitations and Gaps

- **No public aspect libraries exist yet.** The bd formula ecosystem (Mol Mall) has no published aspect formulas as of March 2026.
- **Aspect ordering semantics are not fully documented.** The spec shows the syntax but doesn't confirm whether array position strictly determines execution order.
- **No conflict detection.** bd does not currently warn when two aspects inject contradictory advice on the same step.
- **Testing aspects in isolation is untested territory** — no documented pattern for validating that an aspect weaves correctly without cooking the full workflow.
