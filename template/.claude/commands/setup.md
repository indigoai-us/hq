---
description: Interactive setup wizard for HQ Starter Kit
allowed-tools: Read, Write, Edit, AskUserQuestion, Glob, Bash
visibility: public
---

# HQ Setup Wizard

Welcome! This wizard will configure your personal HQ.

## Phase 0: Dependencies

Check and guide installation of key dependencies before proceeding.

### Required
Run these checks silently. Only prompt user if something is missing.

**qmd** (HQ search - semantic + full-text):
```bash
which qmd
```
If missing, show:
```
qmd not found. HQ uses qmd for semantic search across knowledge bases.

Install: cargo install qmd
  OR: brew install tobi/tap/qmd

After install, index HQ: qmd index .
```

**Claude Code CLI**:
```bash
which claude
```
If missing, show:
```
Claude Code CLI not found. Required to run HQ.

Install: npm install -g @anthropic-ai/claude-code
```

### Optional (check based on starter selection)

**gh CLI** (for code workers):
```bash
which gh
```
If missing and Code Worker selected:
```
gh CLI recommended for code workers (PRs, issues).
Install: brew install gh
```

### Post-install: Index HQ
If qmd was just installed or index doesn't exist:
```bash
qmd index .
```

---

## Context to Load

1. Read `starter-projects/` to understand available options
2. Read `knowledge/public/workers/templates/` for worker patterns

## Phase 1: Identity

Ask these questions one at a time. Wait for answers before proceeding.

1. **What's your name or handle?** (used for folder naming)
2. **What do you do?** (1-2 sentences about your roles/work)
3. **What domains do you focus on?** (e.g., tech, business, creative, health)
4. **Company/context name?** (default: "personal" - used for organizing your settings/knowledge)

## Phase 2: Starter Project Selection

Present these options:

```
Choose your starter project(s):

1. PERSONAL ASSISTANT
   - Daily email digest
   - Task scanning
   - Calendar awareness
   Best for: Productivity-focused users

2. SOCIAL MEDIA WORKER
   - Content drafting (X, LinkedIn)
   - Voice consistency
   - Post scheduling queue
   Best for: Personal brand builders

3. CODE WORKER
   - Ralph loop implementation
   - Back pressure verification
   - PRD-driven development
   Best for: Developers shipping autonomously

Enter numbers (e.g., "1,3" or "2" or "all"):
```

## Phase 3: Customization

Based on selection, ask relevant questions:

### If Personal Assistant selected:
- How many email accounts do you manage?
- Preferred digest time? (morning/evening)

### If Social Media selected:
- Which platforms? (X, LinkedIn, both)
- Posting voice: professional / casual / direct
- Content topics (3-5 keywords)

### If Code Worker selected:
- Primary tech stack? (Node/TypeScript, Python, Go, etc.)
- Project name for first PRD?
- Verification commands? (default: `npm run typecheck && npm run build`)

## Phase 4: Generate Files

### Always create company structure:

```
companies/{company}/
├── settings/      # API credentials (gitignored)
├── data/          # Exports, reports
└── knowledge/
    ├── profile.md
    └── voice-style.md
```

Create directories with `mkdir -p companies/{company}/settings companies/{company}/data companies/{company}/knowledge`

**companies/{company}/knowledge/profile.md:**
```markdown
# {Name}'s Profile

## About
{description from Phase 1, Q2}

## Focus Areas
{domains from Phase 1, Q3}

## Preferences
- Communication style: [direct/detailed/casual]
- Working hours: [your timezone/schedule]
- Autonomy level: [how much should agents do without asking?]

## Context Notes
[Add notes agents should know when working for you]
```

**companies/{company}/knowledge/voice-style.md:**
```markdown
# {Name}'s Voice Style

## Tone
{based on answers - professional/casual/direct}

## Guidelines
- [Customize as you use HQ]
- [Add patterns you like]
- [Note things to avoid]

## Example Phrases
- [Add phrases that sound like you]
```

### Based on selection:

**If Personal Assistant:**
1. Copy `starter-projects/personal-assistant/` to `projects/personal-assistant/`
2. Create `workers/private/email-digest/worker.yaml`:
```yaml
worker:
  id: email-digest
  name: "Email Digest"
  type: AssistantWorker
  version: "1.0"

identity:
  voice_guide: companies/{company}/knowledge/voice-style.md

execution:
  mode: scheduled
  schedule: "0 {hour} * * *"  # from digest time preference
  max_runtime: 10m

context:
  base:
    - companies/{company}/knowledge/profile.md
    - companies/{company}/settings/email-accounts.json

verification:
  post_execute:
    - check: digest_generated
  approval_required: false

tasks:
  source: workers/private/email-digest/prd.json
  one_at_a_time: true

output:
  destination: workspace/digests/
  format: markdown
  naming: "{date}-digest.md"

instructions: |
  Generate email digest following the Presidential Daily Brief format.
  Classify emails: urgent | actionable | fyi | archive
  Focus on what needs attention, not comprehensive summary.
```
3. Create `companies/{company}/settings/email-accounts.json.example`:
```json
{
  "accounts": [
    {
      "name": "Primary",
      "email": "you@example.com",
      "provider": "gmail|outlook|imap"
    }
  ]
}
```
4. Add to `workers/registry.yaml`

**If Social Media:**
1. Copy `starter-projects/social-media/` to `projects/social-presence/`
2. Create `workers/private/{platform}-{name}/worker.yaml`:
```yaml
worker:
  id: {platform}-{name}
  name: "{Platform} Content"
  type: SocialWorker
  version: "1.0"

identity:
  voice_guide: companies/{company}/knowledge/voice-style.md

execution:
  mode: on-demand
  max_runtime: 15m

context:
  base:
    - companies/{company}/knowledge/profile.md
    - companies/{company}/knowledge/voice-style.md
  dynamic:
    - workspace/content-ideas/

verification:
  post_execute:
    - check: character_count
      max: 280  # for X
    - check: voice_consistency
  approval_required: true

tasks:
  source: workers/private/{platform}-{name}/queue.json
  one_at_a_time: true

output:
  destination: workspace/social-drafts/
  format: markdown
  naming: "{date}-{topic}.md"

instructions: |
  Draft content matching voice style guide.
  Always verify character limits before marking complete.
  Never post without human approval.
```
3. Create `workers/private/{platform}-{name}/queue.json`:
```json
{
  "worker": "{platform}-{name}",
  "queue": []
}
```
4. Add to `workers/registry.yaml`

**If Code Worker:**
1. Copy `starter-projects/code-worker/` to `projects/{project-name}/`
2. Create `workers/private/{project-name}-coder/worker.yaml`:
```yaml
worker:
  id: {project-name}-coder
  name: "{Project} Code Worker"
  type: CodeWorker
  version: "1.0"

execution:
  mode: on-demand
  max_runtime: 30m

context:
  base:
    - knowledge/public/Ralph/
    - projects/{project-name}/prd.json
  dynamic:
    - "{repo-path}/"
  exclude:
    - node_modules/
    - "*.log"
    - dist/

verification:
  post_execute:
    - check: typecheck
      command: "{verify-command}"
      must_pass: true
    - check: build
      command: "{build-command}"
      must_pass: true
  approval_required: false

tasks:
  source: projects/{project-name}/prd.json
  format: prd
  one_at_a_time: true

output:
  format: git_commit

instructions: |
  Implement features following Ralph methodology.
  Run back pressure checks after each change.
  Commit with format: feat({feature-id}): {description}
  Write checkpoint after each completed feature.
```
3. Add to `workers/registry.yaml`

### Update Registry

Add entries to `workers/registry.yaml`:
```yaml
workers:
  - id: {worker-id}
    path: workers/private/{worker-id}/
    type: {WorkerType}
    visibility: private
    status: active
    description: "{1-sentence description}"
```

## Phase 5: Summary

Output:
```
HQ Setup Complete!

Created:
- Company context: companies/{company}/
  - knowledge/profile.md
  - knowledge/voice-style.md
  - settings/ (for credentials)
  - data/ (for exports)
- Workers: {list with paths}
- Projects: {list with paths}

Next steps:
1. Review and customize companies/{company}/knowledge/profile.md
2. {If email} Copy settings/email-accounts.json.example → email-accounts.json and add credentials
3. Run `/search <topic>` to find relevant HQ knowledge
4. Run `/nexttask` to see available work
5. Run `/run {worker-id}` to execute a worker
6. Run `/newworker` when you want to add more workers

Happy building!
```

## Rules

- Ask questions one at a time (avoid overwhelming)
- Use defaults when user says "skip" or "default"
- Always validate paths before writing
- Never overwrite existing files without asking
- Create parent directories as needed
