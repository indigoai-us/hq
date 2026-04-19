---
id: prd-minimum-questions
title: PRD skill must ask minimum 10 interview questions
scope: command-scoped
trigger: /prd, prd skill, SKILL.md prd execution
enforcement: hard
---

## Rule

The PRD skill MUST ask a minimum of **10 questions** (including smart-skip confirmations) before generating prd.json. Questions must span at least **2 of the 3 tiers** (Strategic, Architecture, Quality).

Counting rules:
- Full questions asked via AskUserQuestion count as 1 each
- Smart-skip confirmations ("Based on research: {X}. Confirm or modify?") count as 1 each
- Pushback follow-ups do NOT count as separate questions (they're part of the original question)
- Premise challenge sub-questions (agree/disagree per premise) count as 1 total (the STRATEGIC-5 question), not 1 per premise
- Operational questions (repo path, branch, workers, etc. in Step 4.5) count toward the minimum

If the minimum is not met before the user triggers the escape hatch ("Generate PRD now"), the skill must warn: "Only {N}/10 minimum questions answered. {10-N} more required before PRD generation." and continue asking questions.

Tier coverage requirement: at least 1 question from 2 different tiers must be asked. A PRD generated entirely from Strategic questions without any Architecture or Quality coverage is incomplete.

