---
description: Deep-dive project understanding through analysis + interview
allowed-tools: Task, Read, Glob, Grep, Bash, AskUserQuestion, Write
argument-hint: <project-name> [--repo <path>]
---

# /understand-project - Deep Project Understanding

Build thorough, verified understanding of a project through automated analysis followed by interactive interview. This is the foundation for effective agentic work.

**Arguments:** `$ARGUMENTS`

## Why This Matters

Agents fail when they misunderstand projects. Quick scans miss nuance. This command ensures:
- **Accurate mental model** - Not just files, but WHY things are the way they are
- **Human verification** - User confirms or corrects AI understanding
- **Deep context** - Business rules, edge cases, tribal knowledge captured
- **Alignment** - Agent and human share the same understanding

## Process Overview

```
┌─────────────────────────────────────────────────────────────┐
│  1. ANALYZE    │  Automatic repo scan                       │
├─────────────────────────────────────────────────────────────┤
│  2. PRESENT    │  "Here's what I understand..."            │
├─────────────────────────────────────────────────────────────┤
│  3. PROBE      │  Ask targeted questions per section        │
├─────────────────────────────────────────────────────────────┤
│  4. VERIFY     │  User confirms, corrects, expands          │
├─────────────────────────────────────────────────────────────┤
│  5. WRITE      │  Create verified context files             │
└─────────────────────────────────────────────────────────────┘
```

## Phase 1: Automatic Analysis

### Step 1.1: Locate Repository

```
1. Parse $ARGUMENTS for project name and optional --repo path
2. If no --repo:
   - Check projects/{project}/prd.json for target_repo
   - Fall back to asking user
3. Verify repo path exists
```

### Step 1.2: Scan Repository

Read and analyze (don't output yet, just gather):

**Identity:**
- README.md - What does it say it is?
- package.json / pyproject.toml / Cargo.toml - Name, description
- CONTRIBUTING.md, AGENTS.md - Development context

**Structure:**
- Top-level directories - What's the organization?
- apps/, src/, lib/, packages/ - Code layout
- tests/, docs/ - Supporting files

**Technology:**
- Dependencies - What frameworks, libraries?
- Config files - Build tools, linters, CI/CD
- Docker/infra files - Deployment approach

**Domain:**
- Type definitions - What entities exist?
- API routes/endpoints - What operations?
- Database schemas - What data models?
- Test descriptions - What behaviors matter?

**Configuration:**
- .env.example/.env.sample - What external services?
- Config files - What's configurable?

## Phase 2: Present Understanding

After analysis, present your understanding in a structured format:

```markdown
# My Understanding of {Project Name}

## What I Think This Is

{2-3 sentence summary of purpose and what it does}

## The Tech Stack (as I understand it)

| Layer | Technology | My Understanding |
|-------|------------|------------------|
| Language | {x} | {why I think this} |
| Framework | {x} | {why I think this} |
| Database | {x} | {why I think this} |
| ... | ... | ... |

## How It's Organized

{Description of structure with your interpretation}

## Key Concepts I Identified

- **{Concept 1}**: What I think this means
- **{Concept 2}**: What I think this means
- ...

## External Dependencies

| Service | What I Think It Does |
|---------|---------------------|
| {Service} | {interpretation} |

## Things I'm Uncertain About

- {Question or uncertainty 1}
- {Question or uncertainty 2}
- ...

---

**Confidence Level:** {Low/Medium/High}

{Explanation of confidence - what made this easy or hard to understand}
```

Ask user: "Does this look roughly correct? Should I continue with probing questions, or is there a major misunderstanding to correct first?"

## Phase 3: Probing Questions

Ask questions section by section using `AskUserQuestion`. Batch 2-3 questions at a time to avoid fatigue.

### 3.1: Purpose & Goals Questions

```
I want to make sure I understand the PURPOSE correctly.

1. {Specific question about purpose based on analysis}
   Example: "The README mentions 'AI meeting assistant' - does this mean
   {company} joins meetings, or processes recordings after?"

2. {Question about goals/success criteria}
   Example: "What does success look like? More meetings processed?
   Better insights? Faster turnaround?"

3. {Question about users/audience}
   Example: "Who are the primary users - individual professionals,
   teams, or enterprises?"
```

Options for each: Confirm / Correct / Expand / Skip

### 3.2: Architecture Questions

```
Now I want to verify my understanding of the ARCHITECTURE.

1. {Question about a technology choice}
   Example: "You're using both LangChain and LangGraph - what's the
   division of responsibility?"

2. {Question about structure}
   Example: "I see separate apps for webapp/admin/superadmin - are these
   different products or different views of the same system?"

3. {Question about patterns}
   Example: "The NestJS backend seems central - does everything go
   through it, or do some apps talk directly to services?"
```

### 3.3: Domain Questions

```
Let's verify the DOMAIN model.

1. {Question about a core concept}
   Example: "What exactly is an 'Insight'? Is it AI-generated,
   human-curated, or both?"

2. {Question about relationships}
   Example: "How do Users, Organizations, and Teams relate?
   Is there a hierarchy?"

3. {Question about rules}
   Example: "Are there limits on meetings per user? Storage quotas?
   Processing priorities?"
```

### 3.4: Operational Questions

```
Finally, some OPERATIONAL questions.

1. {Question about deployment}
   Example: "How does code get to production? PR → staging → prod?"

2. {Question about monitoring}
   Example: "How do you know if something is broken? Sentry?
   Custom dashboards?"

3. {Question about secrets/config}
   Example: "The 1Password setup - is that for all devs or just
   certain credentials?"
```

### 3.5: Gap Questions

Based on what you COULDN'T find:

```
I have some gaps in my understanding.

1. {Thing you couldn't determine from code}
   Example: "I couldn't find how billing works - is that handled
   externally or is there code I missed?"

2. {Relationship you're unsure about}
   Example: "How does the Slack app relate to the main product?
   Is it a separate offering or integrated?"

3. {Historical context}
   Example: "The 'be1-refactored' name suggests a rewrite - what
   was be1 and why the refactor?"
```

## Phase 4: Process Responses

For each response:

**If Confirm:**
- Mark that understanding as verified
- Note confidence = high

**If Correct:**
- Update understanding with correction
- Ask follow-up if needed: "So it's actually X, not Y. Does that mean Z?"

**If Expand:**
- Add the new information
- Probe deeper: "That's helpful. Can you tell me more about [aspect]?"

**If Skip:**
- Mark as unverified
- Move on (don't block on optional details)

## Phase 5: Write Verified Context

Create context files with verification status:

### context/overview.md

```markdown
---
last_updated: {today}
last_verified: {today}
verified_by: {user} + context-manager
verification_method: understand-project interview
confidence: high
---

# {Project} Overview

## Purpose

{Verified purpose statement}

<!-- Verified via interview Q1.1 -->

## Goals

{Verified goals}

<!-- Verified via interview Q1.2 -->

...
```

### context/architecture.md

Include verification notes:

```markdown
## Stack

| Layer | Technology | Purpose | Verified |
|-------|------------|---------|----------|
| Language | TypeScript | Primary language | ✓ |
| Framework | Next.js | Web apps | ✓ |
| AI | LangGraph | Stateful agents | ✓ Corrected: not LangChain |
```

### context/domain.md

Include source of truth:

```markdown
## Concepts

### Insight

**Definition:** AI-generated actionable takeaway from meeting content.

**Source:** Interview Q3.1 - user clarified this is always AI-generated,
never human-curated. Confidence rating attached.

**Verified:** ✓
```

### context/interview-log.md (new)

Save the Q&A for future reference:

```markdown
---
date: {today}
interviewer: context-manager
interviewee: {user}
---

# Project Understanding Interview

## Purpose Questions

**Q1.1:** Does {company} join meetings or process recordings after?
**A:** It uses Recall.ai to join and record, then processes async.

**Q1.2:** What does success look like?
**A:** More insights actioned by users, measured by click-through.

...
```

## Completion

After writing files:

```markdown
## Understanding Complete

### Files Created
- ✅ context/overview.md (high confidence)
- ✅ context/architecture.md (high confidence)
- ✅ context/domain.md (medium confidence - some gaps)
- ✅ context/interview-log.md (Q&A preserved)

### Verification Summary
- Questions asked: 12
- Confirmed: 8
- Corrected: 3
- Skipped: 1

### Remaining Gaps
- Billing system details (user said "ask finance team")
- Historical migration context (not critical)

### Recommended Next Steps
1. Review context files for accuracy
2. Run `/run context-manager audit` in 30 days
3. Update context when major changes ship

---

This project understanding will help all workers operate effectively.
Any agent working on {project} should read these context files first.
```

## Tips for Good Interviews

**DO:**
- Ask specific questions based on what you observed
- Offer your interpretation and ask if it's correct
- Follow up on interesting answers
- Acknowledge when you don't know something

**DON'T:**
- Ask generic questions you could answer from docs
- Overwhelm with too many questions at once
- Skip verification on critical concepts
- Assume your interpretation is correct

## Integration

### With /discover
```
/run context-manager discover  → Quick automated extraction
/understand-project            → Deep verified understanding
```

### With /prd
```
/prd new-feature              → Creates PRD
/understand-project {target}  → Ensures context exists first
```

### With workers
Workers should check for context files before starting:
```
if context/{project} exists:
    read context files
else:
    suggest: "Run /understand-project first for better results"
```
