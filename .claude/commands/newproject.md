---
description: Ralph-style project planning through structured discovery
allowed-tools: Read, Glob, AskUserQuestion, Write
---

# New Project - Ralph-Style Planning

Guide user through structured discovery to create an actionable PRD for `/ralph-loop`.

## Context to Load First

1. `knowledge/{your-name}/profile.md` - Your roles, preferences
2. `projects/` - Existing projects for patterns

## Discovery Interview

Ask questions **one at a time**. Wait for answers before proceeding.

### Phase 1: Problem Space
1. **What problem are we solving?** (pain point, opportunity, or goal)
2. **Who benefits?** (you, customers, or the HQ system itself)
3. **Why now?** (urgency, dependency, opportunity window)

### Phase 2: Solution Shape
4. **What does success look like?** (measurable outcomes, deliverables)
5. **What constraints exist?** (time, budget, tech stack, dependencies)
6. **What's the scope?** (MVP vs full vision, must-haves vs nice-to-haves)

### Phase 3: HQ Integration
7. **What HQ infrastructure already exists?** (workers, knowledge, tools)
8. **Does this need a new worker or skill?** (if yes, suggest `/newworker` after)
9. **Where does this fit?** (project-specific, cross-project, personal)

## Synthesis

After discovery, draft:

```markdown
## Project: {name}

**Problem**: {1-sentence problem statement}
**Success**: {measurable outcome}
**Scope**: {MVP boundaries}

### Features
1. {feature 1} - {brief description}
2. {feature 2} - {brief description}
...
```

Share draft. Iterate until user approves.

## Generate PRD

Create `projects/{project-name}/prd.json`:

```json
{
  "project": "{project-name}",
  "goal": "{1-sentence goal}",
  "success_criteria": "{measurable outcome}",
  "features": [
    {
      "id": "F1",
      "title": "{feature title}",
      "description": "{what and why}",
      "acceptance_criteria": [
        "{criterion 1}",
        "{criterion 2}"
      ],
      "files": [],
      "passes": false
    }
  ]
}
```

## Rules

- One question at a time (avoid overwhelming)
- Synthesize answers, don't just collect them
- Keep features atomic (one thing per feature)
- Every feature starts with `passes: false`
- Save PRD to `projects/{name}/prd.json`

## After PRD Created

Ask: "PRD saved. Ready to start implementation with `/ralph-loop`?"
