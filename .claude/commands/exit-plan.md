---
description: Force exit from plan mode when stuck
allowed-tools: ExitPlanMode, Read, Bash
argument-hint:
visibility: public
---

# Force Exit Plan Mode

User invoked this because Claude is stuck waiting on ExitPlanMode approval.

## Immediate Action

Call ExitPlanMode NOW with empty allowedPrompts:

```
ExitPlanMode({})
```

Do not:
- Ask for confirmation
- Explain what you're doing
- Wait for anything
- Add allowed prompts unless plan file explicitly lists bash commands needed

Just call the tool immediately.

## If ExitPlanMode Fails

1. Tell user: "ExitPlanMode blocked. Options:"
   - Type `yes` or `approve` in chat to approve plan
   - Type `no` to reject and re-plan
   - Type `skip` to abandon planning entirely

2. If user says skip, acknowledge and proceed with task directly (no planning)

## Common Stuck Scenarios

- **Waiting on approval loop**: Just call ExitPlanMode again
- **Plan file not written**: Write minimal plan to workspace/plans/current.md first, then exit
- **Permission denied**: User needs to approve in chat - prompt them explicitly
