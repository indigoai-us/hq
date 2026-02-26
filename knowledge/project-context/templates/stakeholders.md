---
last_updated: YYYY-MM-DD
last_verified: YYYY-MM-DD
verified_by: worker-name
---

# {Project Name} Stakeholders

People and systems involved with this project.

## People

| Name | Role | Responsibilities | Contact |
|------|------|------------------|---------|
| {Name} | Owner | Final decisions, priority setting | {email/slack} |
| {Name} | Developer | Implementation | {email/slack} |
| {Name} | Reviewer | Code review, QA | {email/slack} |

<!--
Roles to consider:
- Owner: Makes final decisions
- Developer: Writes code
- Reviewer: Reviews code/designs
- User: End user or customer
- Stakeholder: Interested party without direct involvement
-->

## Systems

Upstream and downstream dependencies.

### Upstream (We Depend On)

| System | Dependency Type | Impact if Unavailable |
|--------|-----------------|----------------------|
| {System name} | API | {What breaks} |
| {System name} | Data source | {What breaks} |

### Downstream (Depends On Us)

| System | Dependency Type | Impact if We Change |
|--------|-----------------|---------------------|
| {System name} | API consumer | {What they need to update} |
| {System name} | Data consumer | {What they need to update} |

## Communication

Where discussions happen for this project.

| Channel | Purpose | Link |
|---------|---------|------|
| Slack #{channel} | Day-to-day discussion | {link} |
| GitHub Issues | Bug reports, feature requests | {link} |
| Weekly sync | Status updates | {calendar link} |

## RACI Matrix

For key decisions, who is Responsible, Accountable, Consulted, Informed?

| Decision | R | A | C | I |
|----------|---|---|---|---|
| Architecture changes | Dev | Owner | Reviewer | Team |
| Priority changes | Owner | Owner | Dev | Team |
| Release approval | Dev | Owner | QA | Team |

<!--
RACI:
- Responsible: Does the work
- Accountable: Makes final decision, one per row
- Consulted: Input required before decision
- Informed: Notified after decision
-->
