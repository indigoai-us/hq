# Ralph & Building AGI: Team Training Guide

*Synthesized from dev standups, Zoom sessions, and HQ Ralph Knowledge Base*

---

## Part 1: What Is Ralph?

A deceptively simple orchestrator pattern for autonomous AI coding created by Geoffrey Huntley. Instead of complex agent frameworks, use a **for loop** that picks tasks, generates code, runs automated checks (back pressure), commits on pass, and repeats. Fresh context per task prevents context rot.

Core insight: **simplicity beats complexity**.

### The Problems It Solves
- **Context rot** -- AI loses track of earlier context as the window fills up
- **Compaction** -- context gets filled with irrelevant information, leaving less room for actual work
- **Complexity** -- elaborate orchestrators add failure points
- **Human dependencies** -- manual intervention breaks autonomous flow

### The Vision
*"Wake up in the morning to working code that your coding agent has worked through your backlog and just spit out a whole bunch of code for you to review and it works."* -- Geoffrey Huntley

---

## Part 2: The Loop In Detail

### Flow Diagram
```
Load PRD + agents.md
       |
Pick ONE task (passes: false)
       |
Generate code
       |
Run back pressure checks (tsc, eslint, jest, build)
       |
  Pass? --Yes--> Commit & Update PRD (passes: true) --> Next iteration
  Pass? --No---> Retry/Fix --> Run checks again
```

### The Script
```bash
#!/bin/bash
ITERATIONS=${1:-10}

for i in $(seq 1 $ITERATIONS); do
    echo "=== Ralph Loop Iteration $i ==="

    claude --print "Read plans/prd.json and find first feature where passes is false.

    Implement ONLY that feature.

    Then run:
    1. npm test
    2. npm run lint
    3. npm run typecheck
    4. npm run build

    If ALL pass:
    1. Commit the changes
    2. Update plans/prd.json to set passes: true
    3. Append progress to progress.txt

    If ANY fail:
    1. Fix the issues
    2. Try again"

    echo "Completed iteration $i"
    sleep 2
done
```

### Running Overnight (AFK Coding)
```bash
# tmux
tmux new-session -d -s ralph && tmux send-keys -t ralph './ralph.sh 100' Enter

# nohup
nohup ./ralph.sh 100 > ralph.log 2>&1 &
```

Goal: *"Get it where you can set up your computer overnight and let it just run."*

### Monitoring
```bash
cat progress.txt | tail -20
echo "Completed: $(grep -c '"passes": true' plans/prd.json)"
echo "Remaining: $(grep -c '"passes": false' plans/prd.json)"
```

---

## Part 3: The Four Components

### 1. PRD (prd.json) -- The Specification + Test Harness

```json
{
  "project": "my-project",
  "version": "1.0",
  "features": [
    {
      "id": "feature-001",
      "title": "Authentication Flow",
      "description": "User login with OAuth",
      "user_story": "As a user, I want to log in securely...",
      "acceptance_criteria": [
        "OAuth flow completes successfully",
        "Token stored securely",
        "Error states handled gracefully"
      ],
      "priority": "high",
      "passes": false
    }
  ]
}
```

**Good specs**: Specific, measurable, independently testable, small enough for one iteration, clear success criteria.

**Bad specs**: Too broad ("build the entire auth system"), vague ("it works well"), not independently testable.

The `passes` field is critical -- it tells the loop whether the feature has been verified. The PRD serves dual purpose: specification AND test harness.

### 2. Progress File (progress.txt) -- The Audit Trail

Running log with timestamps showing: which feature was started, tests passed/failed, git commit hashes, PRD updates. Provides audit trail for human review, context for subsequent runs, and handoff capability.

### 3. agents.md / CLAUDE.md -- The Brain

Minimal config file. Include only:
- Project overview (1-2 sentences)
- Tech stack
- Build/test commands
- Task loop protocol
- "Do NOT" rules

**Anti-patterns to avoid:**
- Everything in one file (context bloat)
- Contradictory instructions
- Outdated information
- Too verbose
- No verification steps

**Key concept: Mallocing vs Static Loading**
- **Static** (bad): Load agents.md once, use for entire session. Context rots.
- **Dynamic/Mallocing** (good): Start task -> load only relevant specs -> complete -> clear -> repeat. Fresh context per task.

### 4. Back Pressure -- The Verification Layer

What makes autonomous coding reliable. Without it, hallucinations compound, bugs accumulate, context rot makes everything worse.

| Type | Command | Speed | Purpose |
|------|---------|-------|---------|
| Type checking | `tsc --noEmit` | Very fast | Catch type errors |
| Linting | `eslint . --max-warnings 0` | Fast | Code style + patterns |
| Unit tests | `npm test` / `pytest` | Important | Logic verification |
| Integration tests | `npm run test:integration` | Comprehensive | System behavior |
| Build | `npm run build` | Essential | Final validation |
| Visual (frontend) | Playwright MCP / browser automation | For UI | Screenshot verification |

**Speed is critical**: TypeScript + ESLint + Jest = ~10 seconds. Rust compilation = 5-30 minutes (problematic for rapid iteration). Optimize for fast feedback.

---

## Part 4: Practical Results

### Speed Results

| Task | Traditional | With Ralph | Speedup |
|------|------------|------------|---------|
| Auth implementation | 3-4 days | 1 day | 3-4x |
| Codebase cleanup (300+ files) | Multi-day | 1 hour | 10-20x |
| Website migration | Days | < 1 hour | 10x+ |

### Key Learnings from Team Adoption

1. **Auth flow implemented in 1 day vs 3-4 days** -- the breakthrough moment that validated the approach
2. **Ralph cleaned 300+ files in one hour** -- previously would have been a multi-day effort
3. **Clean codebase = 10x Ralph speed** -- messy code slows everything significantly
4. **Ralph for features, traditional for bugs** -- different tools for different work
5. **Start with a single feature per dev** -- pick one well-defined feature and build a Ralph pipeline just for it
6. **Use a sandbox to learn** -- safe place to experiment before applying to real work
7. **Single environment architecture** -- feature flags over staging environments, one set of keys, less infrastructure

---

## Part 5: Practical Playbook

### For New Team Members

**Phase 1: Learn (Day 1-2)**
1. Read HQ Ralph knowledge base: `knowledge/Ralph/` (10 chapters)
2. Set up a sandbox environment (safe place to experiment)
3. Watch Geoffrey Huntley's "Ralph Wiggum Loop from 1st principles" video
4. Get Claude Max account and set up HQ locally

**Phase 2: First Feature (Day 3-5)**
1. Pick ONE well-defined feature from your backlog
2. Write a PRD with specific, testable acceptance criteria
3. Ensure back pressure exists: type checking, linting, tests, build
4. Create minimal agents.md / CLAUDE.md
5. Run the loop for your single feature
6. Review results, iterate

**Phase 3: Integrate (Week 2+)**
1. Expand to multiple features in the PRD
2. Set up overnight runs via tmux
3. Create separate Ralph instances for bugs vs features
4. Consider Docker configuration for team standardization
5. Adopt HQ for project tracking

### What to Ralph vs What NOT to Ralph

| Ralph it | Don't Ralph it |
|----------|---------------|
| New feature implementation | Targeted bug fixes (use traditional) |
| Large-scale code cleanup (300+ files) | Exploratory debugging |
| Auth flows, CRUD operations | Security-critical manual review |
| Test suite creation | Architecture decisions |
| Codebase migration | API key/credential management |

### Writing Good PRD Specs

Each feature should be:
- **S**pecific -- clear what needs to be built
- **M**easurable -- acceptance criteria are binary pass/fail
- **I**ndependent -- can be implemented without other features
- **T**estable -- automated checks can verify it
- **S**mall -- completable in one iteration

### agents.md Template

```markdown
# Project: [Name]

## Overview
[1-2 sentences]

## Tech Stack
- Language: TypeScript
- Framework: [React/Next/Node]
- Testing: Jest + React Testing Library

## Commands
- `npm run dev` - Start dev server
- `npm run build` - Production build
- `npm test` - Run tests
- `npm run lint` - Run linter

## Task Loop
1. Read `plans/prd.json`
2. Find first item with `passes: false`
3. Implement ONLY that feature
4. Run: `npm test && npm run lint && npm run typecheck`
5. If all pass: commit and set `passes: true`
6. If any fail: fix and retry

## Do NOT
- Modify package.json without approval
- Delete existing tests
- Use `any` type
- Skip running all back pressure checks
```

---

## Part 6: Architecture Patterns

### Orchestrator + Sub-Agent Pattern (for multi-task projects)

**Orchestrator** (stays lean, ~10-20% context):
- Reads PRD, picks ONE task (passes: false)
- Spawns sub-agent with task spec
- Reads checkpoint when done
- Updates PRD (passes: true), repeats until all pass

**Sub-Agent** (fresh context per task, 100% available):
- Receives task spec + file paths
- Implements feature
- Runs back pressure
- Commits code, writes checkpoint, exits

Benefits:
1. Orchestrator stays fast (small context, quick responses)
2. Sub-agents get full context (fresh start per task)
3. Checkpoints preserve state across context resets
4. Parallel execution possible (spawn multiple sub-agents)

### Single Environment Architecture

Instead of managing staging/dev/prod:
- Single production environment
- Feature flags control rollout
- Alpha-beta release channels
- Single set of API keys

Why: Eliminate unnecessary intermediate environments to reduce key management complexity.

### Separate Ralph Instances

From team practice:
- **Feature Ralph** -- PRD-driven, new functionality
- **Bug Ralph** -- separate instance for fixes
- **Cleanup Ralph** -- codebase cleanup tasks (like the 300+ file session)
- **Test Ralph** -- end-to-end agent testing loops

---

## Part 7: Economics & Speed

### Development Cost Comparison

| Method | Cost/Hour |
|--------|-----------|
| AI (Ralph) | ~$10.50 |
| Junior Dev | $35-50 |
| Senior Dev | $75-150 |
| Staff Engineer | $150-250 |

Running 24/7: ~$250/day or ~$7,500/month

### Skills That Matter More Now
- System design and architecture
- Prompt engineering / AI orchestration
- Domain expertise and product sense
- Quality assurance and testing design
- Spec writing (PRDs, acceptance criteria)

---

## Part 8: Key Principles (Distilled from Training)

1. **Start small, one feature at a time** -- Don't try to Ralph everything on day 1.

2. **Clean codebase = faster Ralph** -- Messy code slows everything 10x. Cleanup is investment, not waste.

3. **Use a sandbox to learn** -- Safe sandbox first to learn principles and set up personal workflow, then apply to real work.

4. **Back pressure is non-negotiable** -- Tests, linting, type checking must all pass. This is what prevents hallucination from compounding.

5. **Fresh context per task** -- Start clean each iteration. Context rot is the enemy. The loop naturally resets.

6. **Ralph for features, traditional for bugs** -- Different tools for different work. Sometimes human judgment is faster for targeted fixes.

7. **Speed matters everywhere** -- Fast tests, fast feedback, fast iteration. Optimize for 10-second back pressure cycles.

8. **Single environment simplifies** -- Feature flags over staging environments. One set of keys. Less infrastructure to manage.

9. **Hardware enables AFK coding** -- Goal is overnight runs. Upgrade hardware if needed. Use tmux/nohup.

10. **HQ centralizes everything** -- Project tracking, PRDs, checkpoints, progress files all in one system.

---

## Part 9: Resources

### HQ Knowledge Base
`knowledge/Ralph/` -- 10 chapters covering:
1. Overview
2. Core Concepts (mallocing, context rot, compaction, back pressure)
3. How Ralph Works (the loop, components)
4. Back Pressure Engineering (types, speed, language recommendations)
5. Specifications (PRD format, quality, forward/reverse generation)
6. agents.md Configuration (structure, anti-patterns, mallocing vs static)
7. Implementation (scripts, file structure, monitoring)
8. Economics (cost comparison, disruption model, new moats)
9. Resources (Geoffrey Huntley videos, Matt Pocock workflows)
10. Claude Code Workflow (plan mode, multi-phase, concision rule)

### Videos
- Geoffrey Huntley: "The Ralph Wiggum Loop from 1st principles" (36 min)
- Geoffrey Huntley: "AI Giants Interview" (1 hr)
- Geoffrey Huntley: "Fundamental skills and knowledge for 2026 SWE" (39 min)
- Geoffrey Huntley: "The history of agents.md and what makes a good one" (22 min)
- Matt Pocock: "Ship working code while you sleep with Ralph Wiggum technique" (16 min)
- Matt Pocock: "How I use Claude Code for real engineering" (10 min)

### Tools
- Claude Code (Anthropic) -- primary agent
- HQ Starter Kit -- project management
- Playwright MCP -- browser automation/testing
- tmux / nohup -- overnight runs
- Docker -- team environment standardization
