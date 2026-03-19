---
title: "Skill Lifecycle: Creation, Testing, and Evolution"
category: agent-self-improvement
tags: ["skills", "skill-creation", "evolution", "testing", "claude-code"]
source: blueprint
confidence: 0.5
created_at: 2026-03-20T00:00:00Z
updated_at: 2026-03-20T00:00:00Z
---

Skills are the agent's capabilities. An ultimate autonomous agent should be able to create, test, and improve its own skills — closing the loop on capability development.

## Skill Lifecycle

### 1. Identification
The agent notices a repeated pattern: "I keep doing X manually, this should be a skill." Triggers:
- Same sequence of tools used 3+ times
- User explicitly requests a new capability
- A knowledge gap reveals a missing workflow

### 2. Creation
Using the `skill-creator` skill or manual SKILL.md authoring:
- Define the trigger (when should this skill activate?)
- Define the procedure (what steps does the skill execute?)
- Define success criteria (how do we know it worked?)

### 3. Testing
Run the skill on representative inputs:
- Does it trigger correctly? (no false positives/negatives)
- Does it produce the expected output?
- Does it handle edge cases gracefully?

### 4. Evolution
After production use, analyze outcomes:
- Which steps fail most often?
- Where does the user override the skill's behavior?
- What new edge cases have appeared?
- Update the SKILL.md based on findings

### 5. Retirement
Skills that are no longer used or have been superseded should be archived or deleted to keep the skill surface clean.

## GHQ-Specific Considerations

- Skills compose via skill chains — evolution of one skill may affect downstream skills
- The knowledge base can inform skill creation: "Based on what I know about X, here's a skill for it"
- Skill testing could leverage the `ask-claude.sh` subprocess: run the skill in isolation, evaluate output
