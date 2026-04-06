# /pr - {company} PR Operations

Dispatch PR tasks to {company}-agent for autonomous execution. Results appear at app.{your-domain}.com.

**User input:** $ARGUMENTS

## Agent Runtime

{company}-agent is an Ironclaw fork at `repos/private/{company}-agent/`. It has 4 PR skills:

| Skill | Purpose |
|-------|---------|
| `pr-agency` | Client/campaign management, orchestration, planning |
| `pr-writer` | Press releases, pitches, talking points, op-eds, media alerts, crisis statements |
| `pr-research` | Journalist research, media list building, competitive intel |
| `pr-monitor` | Coverage checks, sentiment scans, competitive monitoring, follow-ups |

### How to invoke

Run the agent locally with Bash:

```bash
cd $HQ_ROOT/repos/private/{company}-agent && node dist/entry.js agent --local -m "{message}"
```

The `--local` flag runs the embedded agent (uses model provider API keys from shell). The `-m` flag passes the task message. The agent auto-loads the relevant skill based on the message content.

If the agent fails to start (build stale, missing deps, gateway down), **fall back** to the HQ worker route (see Fallback section below).

## Actions

Parse the first word of `$ARGUMENTS` to determine action:

### No args → Show PR overview
Show available actions and active campaigns summary:
```
{company} PR - Available Actions:
  /pr plan {company}      PR strategy and campaign planning
  /pr write {type}        Draft press release, pitch, op-ed, etc.
  /pr outreach {action}   Journalist research and pitch delivery
  /pr monitor {action}    Check media coverage
  /pr campaign {name}     Full launch campaign orchestration
  /pr calendar            View PR calendar
  /pr metrics {company?}  PR dashboard and metrics
  /pr media-list          View/manage journalist database
```
Then read `knowledge/public/pr/pr-calendar.md` and show upcoming items.

### plan → {company}-agent (pr-agency skill)

Invoke {company}-agent with a planning/strategy message:

- `plan {company}` → `-m "Create a PR campaign plan for {company}. Load client data, analyze competitive landscape, and propose campaign strategy with timelines and media targets."`
- `plan messaging {company}` → `-m "Build a messaging framework for {company}. Load client data and create key messages, proof points, and positioning."`
- `plan audit {company}` → `-m "Run a PR audit for {company}. Analyze current coverage, media relationships, and identify gaps and opportunities."`
- `plan competitive {company}` → `-m "Run competitive PR analysis for {company}. Research competitor coverage, messaging, and media targets."`

### write → {company}-agent (pr-writer skill)

Invoke {company}-agent with a writing task:

- `write press-release {company} {topic}` → `-m "Write a press release for {company} about {topic}. Load client data, follow AP style, under 600 words."`
- `write pitch {company} {topic}` → `-m "Write a pitch email for {company} about {topic}. Personalize to the journalist's beat. Under 150 words."`
- `write talking-points {company} {topic}` → `-m "Create talking points for {company} about {topic}. Max 3 key messages with proof points."`
- `write op-ed {company} {topic}` → `-m "Write an op-ed for {company} about {topic}. 700-1000 words in {your-name}'s voice."`
- `write media-alert {company} {topic}` → `-m "Write a media alert for {company} about {topic}. WHO/WHAT/WHEN/WHERE/WHY format."`
- `write crisis {company} {topic}` → `-m "Write a crisis statement for {company} about {topic}. Acknowledge, state facts, outline next steps."`

If no type specified, ask which type.

### outreach → {company}-agent (pr-research skill)

Invoke {company}-agent with a research/outreach task:

- `outreach {company}` → `-m "Build a media list for {company}. Identify target outlets by tier, research journalists, score relevance, and save contacts to the PR database."`
- `outreach research {name}` → `-m "Research journalist {name}. Find recent articles, beat focus, contact info, pitch preferences. Save enriched contact to PR database."`
- `outreach pitch {company}` → `-m "Personalize pitches for {company}'s active campaign. Load contacts, craft personalized pitch emails, queue in draft queue for approval."`
- `outreach send` → `-m "Check draft queue for approved pitches and send them. Respect 25/day limit. Update pitch statuses."`
- `outreach follow-up {company}` → `-m "Check for {company} pitches needing follow-up (5+ days since sent). Generate contextual follow-up emails and queue in draft queue."`

### monitor → {company}-agent (pr-monitor skill)

Invoke {company}-agent with a monitoring task:

- `monitor {company}` → `-m "Run coverage check for {company}. Search web for media mentions, analyze sentiment, log placements in PR database."`
- `monitor report {company}` → `-m "Generate coverage report for {company}. Pull all placements, break down by tier/sentiment, calculate pitch-to-placement rate."`
- `monitor sentiment {company}` → `-m "Run sentiment scan for {company}. Categorize all recent coverage, identify themes, flag negative coverage."`
- `monitor competitive {company}` → `-m "Run competitive PR intel for {company}. Monitor competitor press releases, compare coverage volume and quality."`

### campaign → {company}-agent (pr-agency skill)

Invoke {company}-agent with a campaign orchestration task:

- `campaign {name} {company}` → `-m "Execute PR campaign '{name}' for {company}. Orchestrate end-to-end: research, story development, media mapping, pitch creation, and outreach scheduling."`
- `campaign status {company}` → `-m "Show campaign status for {company}. List all campaigns with pitch/placement counts and conversion rates."`

### calendar → Show PR calendar
Read and display `knowledge/public/pr/pr-calendar.md`.

### metrics → {company}-agent (pr-agency skill)
Invoke: `-m "Show PR dashboard and metrics for {company}. Pull analytics from PR database."`

### media-list → {company}-agent (pr-research skill)
Invoke: `-m "Show and manage the journalist media list. List all contacts with outlet, beat, tier, and relationship status."`

## Company Inference
If company not specified in args:
1. Check if cwd is in a company repo → infer company
2. Ask user which company

Always resolve company name before invoking the agent.

## Fallback to HQ Workers

If {company}-agent fails to start (build error, missing node_modules, gateway issue), fall back to HQ worker routing:

| Action | Fallback Worker | Route |
|--------|----------------|-------|
| plan | pr-strategist | `/run pr-strategist {skill}` |
| write | pr-writer | `/run pr-writer {type}` |
| outreach | pr-outreach | `/run pr-outreach {skill}` |
| monitor | pr-monitor | `/run pr-monitor {skill}` |
| campaign | pr-coordinator | `/run pr-coordinator {skill}` |
| metrics | pr-coordinator | `/run pr-coordinator pr-dashboard` |
| media-list | pr-outreach | `/run pr-outreach manage-media-list` |

When falling back, log a warning: "{company}-agent unavailable, routing to HQ worker fallback."

## Rules
- Primary route is {company}-agent — always try agent first
- Fall back to HQ workers only on agent startup failure
- Always confirm company before invoking
- Results from {company}-agent are written to production Neon DB and visible at app.{your-domain}.com
- calendar action stays local (reads knowledge file directly, no agent needed)
- Never invoke agent without resolving company first
