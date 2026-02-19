# launch-campaign

Orchestrate a full PR launch campaign end-to-end by sequencing other workers.

## Inputs

- `company` (required): Company name
- `announcement` (required): What is being launched/announced
- `campaign_id` (optional): Existing campaign ID, or create new

## Steps

This skill orchestrates a full campaign by calling other workers in sequence. Each step requires the previous to complete.

### Phase 1: Strategy
1. **Plan campaign** → `/run pr-strategist plan-campaign`
   - Input: company, announcement
   - Output: Story + Campaign created in platform, strategy report
   - Note the campaign_id and story_id from the report

### Phase 2: Content
2. **Draft press release** → `/run pr-writer press-release`
   - Input: company, announcement, campaign_id
   - Output: Press release draft (requires approval)

3. **Create messaging framework** → `/run pr-strategist messaging-framework`
   - Input: company, topic=announcement
   - Output: Key messages and talking points

### Phase 3: Outreach Prep
4. **Build media list** → `/run pr-outreach build-media-list`
   - Input: company, announcement, campaign_id
   - Output: Targeted journalist list, draft pitches created in platform

5. **Write base pitch** → `/run pr-writer pitch-email`
   - Input: company, story, campaign_id
   - Output: Base pitch template

6. **Personalize pitches** → `/run pr-outreach personalize-pitch`
   - Input: campaign_id
   - Output: Personalized pitches in draft_queue

### Phase 4: Execution (Approval-Gated)
7. **Review drafts** → Direct user to `/drafts` in platform UI
   - User reviews and approves pitches
   - **STOP HERE until user confirms approval**

8. **Send pitches** → `/run pr-outreach send-pitch`
   - Input: campaign_id
   - Requires explicit user approval per send batch

### Phase 5: Follow-Up & Monitoring
9. **Schedule follow-ups** (day 5, day 10)
   - `/run pr-outreach follow-up` at appropriate intervals

10. **Check coverage** (day 7, day 14, day 21)
    - `/run pr-monitor coverage-check`

11. **Final report** (day 21-30)
    - `/run pr-monitor coverage-report`

## Output

Write campaign tracker to `workspace/reports/pr/{date}-launch-campaign-{slug}.md`:

```markdown
# Campaign Launch Tracker: {announcement}

## Company: {company}
## Campaign ID: {id}
## Story ID: {id}

## Phase Checklist
- [ ] Strategy: plan-campaign
- [ ] Content: press-release draft
- [ ] Content: messaging-framework
- [ ] Outreach: media list built ({N} contacts)
- [ ] Outreach: base pitch drafted
- [ ] Outreach: pitches personalized ({N} pitches)
- [ ] Approval: user reviewed drafts
- [ ] Execution: pitches sent ({N}/{N})
- [ ] Follow-up: round 1 (day 5)
- [ ] Follow-up: round 2 (day 10)
- [ ] Monitoring: coverage check (day 7)
- [ ] Monitoring: coverage check (day 14)
- [ ] Report: final coverage report

## Status: {current phase}
## Next Action: {what needs to happen next}
```

## Rules

- Each phase depends on the previous — never skip ahead
- Press release and pitches ALWAYS require user approval
- Pitch sends ALWAYS require explicit approval
- Log progress after each phase completion
- If any phase fails, stop and report (don't continue)
