---
description: Interactive setup wizard for HQ Starter Kit
allowed-tools: Read, Write, Edit, AskUserQuestion, Glob
---

# HQ Setup Wizard

Welcome! This wizard will configure your personal HQ.

## Context to Load First

1. Read `starter-projects/` to understand available options
2. Read `knowledge/workers/templates/` for worker patterns

## Phase 1: Identity

Ask these questions one at a time. Wait for answers before proceeding.

1. **What's your name or handle?** (used for profile folder naming)
2. **What do you do?** (1-2 sentences about your roles/work)
3. **What domains do you focus on?** (e.g., tech, business, creative, health)

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

### Always create:

**knowledge/{name}/profile.md:**
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

**knowledge/{name}/voice-style.md:**
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
2. Create `workers/assistant/email/worker.yaml`:
```yaml
worker:
  id: email-digest
  name: "Email Digest"
  type: AssistantWorker
  version: "1.0"

identity:
  voice_guide: knowledge/{name}/voice-style.md

execution:
  mode: scheduled
  schedule: "0 {hour} * * *"  # from digest time preference
  max_runtime: 10m

context:
  base:
    - knowledge/{name}/profile.md
    - settings/email/accounts.json

verification:
  post_execute:
    - check: digest_generated
  approval_required: false

tasks:
  source: workers/assistant/email/prd.json
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
3. Create `settings/email/accounts.json.example`:
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
2. Create `workers/social/{platform}-{name}/worker.yaml`:
```yaml
worker:
  id: {platform}-{name}
  name: "{Platform} Content"
  type: SocialWorker
  version: "1.0"

identity:
  voice_guide: knowledge/{name}/voice-style.md

execution:
  mode: on-demand
  max_runtime: 15m

context:
  base:
    - knowledge/{name}/profile.md
    - knowledge/{name}/voice-style.md
  dynamic:
    - workspace/content-ideas/

verification:
  post_execute:
    - check: character_count
      max: 280  # for X
    - check: voice_consistency
  approval_required: true

tasks:
  source: workers/social/{platform}-{name}/queue.json
  one_at_a_time: true

output:
  destination: workspace/drafts/social/
  format: markdown
  naming: "{date}-{topic}.md"

instructions: |
  Draft content matching voice style guide.
  Always verify character limits before marking complete.
  Never post without human approval.
```
3. Create `workers/social/{platform}-{name}/queue.json`:
```json
{
  "worker": "{platform}-{name}",
  "queue": []
}
```
4. Add to `workers/registry.yaml`

**If Code Worker:**
1. Copy `starter-projects/code-worker/` to `projects/{project-name}/`
2. Create `workers/code/{project-name}/worker.yaml`:
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
    - knowledge/Ralph/
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
    path: workers/{category}/{worker-id}/
    type: {WorkerType}
    status: active
    description: "{1-sentence description}"
```

## Phase 5: Summary

Output:
```
HQ Setup Complete!

Created:
- Profile: knowledge/{name}/
  - profile.md
  - voice-style.md
- Workers: {list with paths}
- Projects: {list with paths}

Next steps:
1. Review and customize knowledge/{name}/profile.md
2. {If email} Add credentials to settings/email/accounts.json
3. Run `/nexttask` to see available work
4. Run `/work` to start executing tasks
5. Run `/build` when you want to add more workers

Happy building!
```

## Rules

- Ask questions one at a time (avoid overwhelming)
- Use defaults when user says "skip" or "default"
- Always validate paths before writing
- Never overwrite existing files without asking
- Create parent directories as needed
