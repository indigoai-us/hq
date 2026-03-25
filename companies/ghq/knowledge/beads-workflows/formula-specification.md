---
title: "bd Formula Specification: Complete Reference"
category: beads-workflows
tags: ["beads", "task-management", "workflow-templates", "agent-orchestration", "composition"]
source: "https://github.com/steveyegge/beads (internal/formula/types.go, website/docs/workflows/formulas.md, docs/MOLECULES.md)"
confidence: 0.9
created_at: "2026-03-25T00:00:00Z"
updated_at: "2026-03-25T00:00:00Z"
---

bd formulas are declarative workflow templates that compile ("cook") into proto beads. They are the source layer for the MEOW stack's molecule system. Formulas can be written in TOML (preferred) or JSON, stored in `.beads/formulas/`, `~/.beads/formulas/`, or `$GT_ROOT/.beads/formulas/`.

## Formula Format (TOML preferred)

```toml
formula = "feature-workflow"
description = "Standard feature development workflow"
version = 1
type = "workflow"          # workflow | expansion | aspect
phase = "liquid"           # liquid (pour) or vapor (wisp) — recommended instantiation

[vars.feature_name]
description = "Name of the feature"
required = true

[vars.environment]
description = "Target environment"
default = "staging"
enum = ["staging", "production"]

[vars.version]
description = "Release version"
pattern = "^\\d+\\.\\d+\\.\\d+$"

[[steps]]
id = "design"
title = "Design {{feature_name}}"
type = "human"             # task (default) | human | gate
description = "Create design document"
labels = ["phase:design"]
priority = 2

[[steps]]
id = "implement"
title = "Implement {{feature_name}}"
needs = ["design"]         # alias for depends_on

[[steps]]
id = "review"
title = "Code review"
needs = ["implement"]
condition = "{{skip_review}} != true"  # conditional step

[steps.gate]
type = "human"
timeout = "72h"
```

## Three Formula Types

| Type | Purpose | Example |
|------|---------|---------|
| `workflow` | Standard step sequence | Feature workflow, release process |
| `expansion` | Macro that replaces a step with multiple steps | Draft→refine pattern, test matrix |
| `aspect` | Cross-cutting concern applied to matching steps (AOP) | Security scan before all deploys |

## Advanced Features

### Loops

```toml
[[steps]]
id = "process"
title = "Process items"

[steps.loop]
count = 3                  # Fixed iterations (expands at cook time)
# OR
# until = "step.status == 'complete'"  # Conditional (runtime)
# max = 5                              # Required with until
# OR
# range = "1..2^{disks}"   # Computed range with expressions (+,-,*,/,^)
var = "iteration"           # Exposed to body steps as {iteration}

[[steps.loop.body]]
id = "fetch"
title = "Fetch item {iteration}"

[[steps.loop.body]]
id = "transform"
title = "Transform item {iteration}"
needs = ["fetch"]
```

### Expansions (Macros)

Define an expansion formula, then reference it inline:

```toml
# exp-draft-refine.formula.toml
formula = "exp-draft-refine"
type = "expansion"

[[template]]
id = "{target}.draft"
title = "Draft: {target.title}"

[[template]]
id = "{target}.refine"
title = "Refine: {target.title}"
needs = ["{target}.draft"]
```

Use in a workflow:
```toml
[[steps]]
id = "implement"
expand = "exp-draft-refine"   # Replaces this step with expanded template
```

### Aspects (AOP-style)

```toml
formula = "security-scan"
type = "aspect"

[[advice]]
target = "*.deploy"          # Glob pattern matching step IDs

[advice.before]
id = "security-scan-{step.id}"
title = "Security scan before {step.title}"

# Also supports: after, around (with before[] and after[] lists)
```

### Composition

```toml
[compose]
aspects = ["security-audit", "logging"]  # Apply aspect formulas

[[compose.bond_points]]
id = "post-test"
after_step = "test"
# OR: before_step = "deploy"
# parallel = true  # Attached steps run in parallel

[[compose.expand]]
target = "implement"
with = "exp-draft-refine"

[[compose.map]]
select = "*.implement"       # Glob — applies to all matching steps
with = "exp-draft-refine"

[[compose.branch]]
from = "setup"
steps = ["test", "lint", "build"]  # Run in parallel
join = "deploy"                     # Rejoin point

[[compose.hooks]]
trigger = "label:security"   # Auto-attach when label matches
attach = "security-scan"
```

### Runtime Expansion (on_complete)

Dynamic bonding based on step output:

```toml
[[steps]]
id = "survey-workers"
title = "Discover available workers"

[steps.on_complete]
for_each = "output.workers"   # Iterate over step output
bond = "mol-worker-arm"       # Formula to instantiate per item
parallel = true               # Run all concurrently
# sequential = true           # OR run one at a time

[steps.on_complete.vars]
worker_name = "{item.name}"
rig = "{item.rig}"
```

### Gates

```toml
[[steps]]
id = "approval"
title = "Manager approval"

[steps.gate]
type = "human"               # human | gh:run | gh:pr | timer | mail
id = "ci-workflow-name"      # For gh:run type
timeout = "24h"

[[steps]]
id = "aggregate"
title = "Aggregate results"
waits_for = "all-children"   # all-children | any-children | children-of(step-id)
```

### Inheritance

```toml
extends = ["base-workflow", "compliance-checks"]
# Child inherits vars, steps, compose rules
# Child definitions override parent definitions with same ID
```

### Nested Children

```toml
[[steps]]
id = "testing"
title = "Testing phase"
type = "epic"

[[steps.children]]
id = "unit-tests"
title = "Run unit tests"

[[steps.children]]
id = "integration-tests"
title = "Run integration tests"
```

## Cooking Modes

- **Compile-time** (default): `bd cook formula.json` — keeps `{{var}}` placeholders intact for inspection
- **Runtime**: `bd cook formula --var name=auth` — substitutes all variables
- **Ephemeral** (default): Output to stdout; `bd pour` and `bd mol wisp` cook inline
- **Persistent**: `bd cook formula --persist` — writes proto to database

## CLI Quick Reference

```bash
bd formula list              # List available formulas
bd formula show <name>       # Show formula details
bd cook <formula>            # Cook to stdout (compile-time)
bd cook <formula> --var k=v  # Cook with var substitution (runtime)
bd cook <formula> --dry-run  # Preview steps
bd mol pour <formula>        # Cook + instantiate as persistent mol
bd mol wisp <formula>        # Cook + instantiate as ephemeral wisp
bd mol run <formula>         # Pour + assign + pin for durable execution
```

## pour Field

The `pour` field on a formula controls whether steps are materialized as individual child issues in the database. Default is false (steps read inline at execution time). Set `pour = true` only for critical, infrequent work where step-level checkpoint recovery is worth the DB overhead. Patrol formulas should NOT set this.
