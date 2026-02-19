# crisis-statement

Rapid crisis communications statement.

## Inputs

- `company` (required): Company name
- `situation` (required): Description of the crisis/incident
- `severity` (optional): low, medium, high (default: medium)

## Steps

1. **Assess situation**
   - Identify: What happened? Who is affected? What do we know vs. don't know?
   - WebSearch for any existing coverage of the situation
   - Read `companies/{company}/knowledge/` for relevant context

2. **Draft statement**
   Output to `workspace/pr-drafts/{company}/{date}-crisis-statement-{slug}.md`:

```markdown
# Crisis Statement: {Situation Summary}

## Company: {company}
## Severity: {level}
## Date: {date}
## Status: DRAFT — REQUIRES IMMEDIATE APPROVAL

---

## Holding Statement (for immediate use)

"{Company} is aware of {situation}. We are {taking action/investigating}. {What we can confirm}. We will provide updates as more information becomes available."

— {Spokesperson Name}, {Title}

## Full Statement (when facts are confirmed)

{Acknowledge the situation specifically — don't minimize or dodge.}

{State what you know and what you're doing about it.}

{Express appropriate concern for those affected.}

{Commit to specific next steps and timeline for updates.}

## Q&A Prep

**Q: When did you first learn about this?**
A: {answer}

**Q: How many people are affected?**
A: {answer}

**Q: What are you doing to prevent this from happening again?**
A: {answer}

## Internal Notes
- Spokesperson: {recommended}
- Do NOT say: {phrases to avoid}
- Escalation: {if severity is high, who else needs to be involved}
- Next update: {timeline}
```

## Rules

- Speed over perfection — get a holding statement out fast
- Never speculate — only state what is confirmed
- Never blame others in initial statement
- Show empathy for affected parties
- Commit to transparency and updates
- ALWAYS requires approval before any external use
- High severity: flag for immediate human review
