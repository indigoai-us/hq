---
description: Onboard a new AGI bootcamp student — full pipeline from DB to PRD
allowed-tools: Read, Write, Edit, Bash, AskUserQuestion, Task, Glob, Grep, WebFetch, ToolSearch
argument-hint: [student name or empty for interactive]
visibility: public
---

# /bootcamp-student — New Bootcamp Student Onboarding

Full pipeline: gather info → create client in DB → draft kickoff email → generate PRD → add portal config → create deck skeleton(s).

**Input:** $ARGUMENTS

## Constants

```
REPO=repos/private/ralph-method-bootcamp-site
PORTAL_PAGE=$REPO/app/client/[slug]/page.tsx
DECKS_DIR=$REPO/public/decks
SITE=bootcamp.{your-username}.com
```

## Step 1: Gather Student Info

If $ARGUMENTS has a name, use it. Otherwise ask.

Use AskUserQuestion to collect (batch into 1-2 questions):
- **Full name** (first + last)
- **Email address**
- **Company** (or "Independent")
- **Role/context** — 1 sentence describing who they are and what they do (e.g. "CX executive at Abacus", "VC building AI practice", "artist selling on Saatchi Art")
- **Deck format**: 1 condensed deck (~25-30 slides) or 3 separate session decks
- **Audience type**: technical / non-technical executive / creative / generalist

**Derive automatically:**
- `slug` = first-last lowercased, hyphenated (e.g. `nick-harazim`)
- `password` = slug with hyphens removed (e.g. `nickharazim`)
- `portalUrl` = `{SITE}/client/{slug}`

## Step 2: Create Client in Vercel Blob DB

```bash
curl -s -X POST "https://bootcamp.{your-username}.com/api/clients" \
  -H "Content-Type: application/json" \
  -d '{"name": "{fullName}", "email": "{email}", "company": "{company}"}'
```

Parse response: `{ client: { id: "uuid" } }`

- `clientId` = response.client.id
- `intakeUrl` = `{SITE}/intake/{clientId}`

If the API call fails, STOP and report the error. Do NOT proceed without a client ID.

## Step 3: Draft Kickoff Email

Use `gmail-local` MCP `draft_email` tool. **NEVER use `reply_email`** — it sends immediately.

Load the tool via ToolSearch first: `ToolSearch query: "+gmail draft"`

Draft email:
- **To:** {email}
- **Subject:** AGI Bootcamp — Welcome + Pre-Work
- **Body** (plain text, no markdown headers):

```
Hey {firstName},

Welcome to the AGI Bootcamp. I'm excited to work with you.

Before our first session, I need two things from you:

1. INTAKE SURVEY (5 minutes)
Fill this out so I can personalize your program:
{intakeUrl}

2. PRE-WORK
Get these set up so we can hit the ground running:

- Download Claude Desktop: https://claude.ai/download
  The AI interface we'll use throughout the program.

- Create a "{folderName}" folder on your computer
  This will be home base for everything we build.

- Write down 3 things you want AI to help with
  What takes the most time? Where do you wish you had a team?

Your portal (available after intake):
{portalUrl}
Password: {password}

If you have questions, just reply to this email.

— Corey
```

**{folderName}** varies by audience type:
- Non-technical exec: "My Command Center"
- Technical: "My HQ"
- Creative: "My Creative HQ"
- Generalist: "My HQ"

**Tell user:** "Email draft created — review in Gmail and send when ready."

**Wait for user confirmation before proceeding.**

## Step 4: Generate PRD

Create project directory and PRD:

```bash
mkdir -p projects/{slug}-bootcamp
```

### Language Rules by Audience Type

**Non-technical executive:**
```json
{
  "neverUse": ["terminal", "CLI", "git", "commit", "push", "deploy", "YAML", "JSON", "API", "endpoint", "node", "npm", "config", "schema", "PRD", "user story", "lint", "test suite", "CI/CD", "pipeline"],
  "alwaysUse": ["folder", "file", "document", "knowledge", "workflow", "playbook", "team", "review", "feedback", "improve"],
  "metaphors": {
    "HQ directory": "Command Center",
    "Knowledge base": "Playbook / Library",
    "Worker": "AI Assistant / Analyst",
    "CLAUDE.md": "The Playbook / House Rules",
    "Ralph Loop": "Review, Draft, Check, Learn",
    "Back pressure": "Quality Gate",
    "Fresh context": "Clean Slate",
    "Spec": "The Brief"
  }
}
```

**Technical:**
```json
{
  "neverUse": [],
  "alwaysUse": ["architecture", "system", "deploy", "infrastructure", "pipeline", "automation"],
  "metaphors": {
    "HQ directory": "Your OS / monorepo",
    "Knowledge base": "Knowledge base",
    "Worker": "AI agent / worker",
    "CLAUDE.md": "System config",
    "Ralph Loop": "Build, Test, Review, Ship",
    "Back pressure": "CI checks",
    "Fresh context": "Clean context",
    "Spec": "Spec / PRD"
  }
}
```

**Creative:**
```json
{
  "neverUse": ["terminal", "CLI", "git", "commit", "push", "deploy", "YAML", "JSON", "API", "endpoint", "node", "npm", "config", "schema", "PRD", "user story", "lint", "pipeline"],
  "alwaysUse": ["studio", "collection", "portfolio", "creative brief", "visual library", "brand", "style", "voice"],
  "metaphors": {
    "HQ directory": "Creative HQ / Studio",
    "Knowledge base": "Creative Library / Style Guide",
    "Worker": "Creative Assistant",
    "CLAUDE.md": "Studio Rules",
    "Ralph Loop": "Gather, Create, Review, Refine",
    "Back pressure": "Quality Check / Brand Match",
    "Fresh context": "Fresh Canvas",
    "Spec": "The Brief"
  }
}
```

**Generalist:**
```json
{
  "neverUse": ["YAML", "JSON", "lint", "CI/CD", "pipeline", "PRD", "user story"],
  "alwaysUse": ["folder", "file", "system", "knowledge", "workflow", "assistant", "automate"],
  "metaphors": {
    "HQ directory": "Your HQ",
    "Knowledge base": "Knowledge Library",
    "Worker": "AI Assistant",
    "CLAUDE.md": "House Rules",
    "Ralph Loop": "Gather, Build, Check, Learn",
    "Back pressure": "Quality Check",
    "Fresh context": "Clean Slate",
    "Spec": "The Brief"
  }
}
```

### PRD Template — Condensed (1 deck)

Write `projects/{slug}-bootcamp/prd.json`:

```json
{
  "name": "{slug}-bootcamp",
  "description": "Personalized AGI bootcamp for {fullName} — single condensed slide deck for {roleContext}.",
  "branchName": "feature/{slug}-bootcamp",
  "userStories": [
    {
      "id": "US-001",
      "title": "Add {firstName} client config to portal",
      "description": "Password-gated portal at /client/{slug} with pre-work and resources.",
      "acceptanceCriteria": [
        "Route /client/{slug} resolves (in generateStaticParams)",
        "Password gate works with password '{password}'",
        "Portal displays company as '{company}'",
        "Pre-work items present",
        "Resources present",
        "npm run build passes"
      ],
      "priority": 1,
      "passes": false,
      "labels": ["code", "portal"],
      "dependsOn": [],
      "notes": "File: app/client/[slug]/page.tsx"
    },
    {
      "id": "US-002",
      "title": "Create condensed bootcamp deck for {firstName}",
      "description": "One unified slide deck (~25-30 slides) covering the entire bootcamp, personalized with intake survey responses.",
      "acceptanceCriteria": [
        "File exists at public/decks/{slug}/{slug}-bootcamp.html",
        "25-30 slides with arrow-key navigation, dot indicators, speaker notes (N key)",
        "Visual style: Playfair Display headings, Inter body, dark theme, generous whitespace",
        "Content arc: Introduction → Where You Are → Opportunity → Mindset Shift → Setup → Knowledge Files → First Conversation → The Loop → Building Assistant → Quality Gates → Knowledge Compounding → Workflow Integration → Sustainable Practice → What's Next",
        "Personalized with intake survey responses",
        "All examples relevant to {roleContext}",
        "Language rules enforced (see metadata.languageRules)",
        "Speaker notes on every slide",
        "Renders correctly in browser"
      ],
      "priority": 1,
      "passes": false,
      "labels": ["content", "deck"],
      "dependsOn": ["US-001"],
      "notes": "Reference: public/decks/nick-harazim/nick-harazim-bootcamp.html for HTML pattern. Style from agi.{your-username}.com."
    },
    {
      "id": "US-003",
      "title": "Build, verify, and deploy to Vercel",
      "description": "Deploy the updated bootcamp portal to the live Vercel site.",
      "acceptanceCriteria": [
        "npm run build passes locally with zero errors",
        "Route /client/{slug} resolves",
        "Deck URL loads correctly in browser",
        "Password gate works",
        "Existing client portals unchanged",
        "Successfully deployed to Vercel"
      ],
      "priority": 3,
      "passes": false,
      "labels": ["deploy"],
      "dependsOn": ["US-002"],
      "notes": "Deploy via existing Vercel project for ralph-method-bootcamp-site"
    }
  ],
  "metadata": {
    "createdAt": "{ISO8601}",
    "goal": "Create a personalized AGI bootcamp for {fullName} — one condensed slide deck for {roleContext}.",
    "successCriteria": "Live portal at /client/{slug} with personalized deck, fully adapted for {audienceType} audience.",
    "qualityGates": ["npm run build"],
    "repoPath": "repos/private/ralph-method-bootcamp-site",
    "relatedWorkers": [],
    "knowledge": ["projects/nick-harazim-bootcamp/", "projects/kristina-bootcamp/"],
    "intakeResponses": "PENDING — populate after student completes intake at {intakeUrl}",
    "clientId": "{clientId}",
    "languageRules": { ... }
  }
}
```

### PRD Template — 3 Sessions

Same as above but userStories array:

```json
[
  { "id": "US-001", "title": "Add {firstName} client config to portal", ... },
  {
    "id": "US-002",
    "title": "Create kickoff deck",
    "description": "10-12 slide kickoff presentation introducing the bootcamp.",
    "acceptanceCriteria": [
      "File exists at public/decks/{slug}/{slug}-kickoff.html",
      "10-12 slides: title, where you are, opportunity, what we're building, 3 session previews, success vision, pre-work, close",
      "Language rules enforced",
      "Speaker notes on every slide",
      "Navigation works"
    ],
    "labels": ["content", "deck"],
    "dependsOn": ["US-001"]
  },
  {
    "id": "US-003",
    "title": "Create Session 1 deck — Foundation",
    "description": "20-25 slide foundation session: mindset shift, setup, first conversation, homework.",
    "acceptanceCriteria": [
      "File exists at public/decks/{slug}/session-1-foundation.html",
      "20-25 slides across 4 sections: Mindset Shift, Setting Up, First Conversation, Homework",
      "All examples relevant to {roleContext}",
      "Language rules enforced",
      "Speaker notes on every slide"
    ],
    "labels": ["content", "deck"],
    "dependsOn": ["US-002"]
  },
  {
    "id": "US-004",
    "title": "Create Session 2 deck — Method",
    "description": "20-25 slide method session: the loop, building together, quality gates, homework.",
    "acceptanceCriteria": [
      "File exists at public/decks/{slug}/session-2-method.html",
      "20-25 slides across 4 sections: The Loop, Building Together, Quality Gates, Homework",
      "Language rules enforced",
      "Speaker notes on every slide"
    ],
    "labels": ["content", "deck"],
    "dependsOn": ["US-003"]
  },
  {
    "id": "US-005",
    "title": "Create Session 3 deck — Go Live",
    "description": "8-12 slide go-live session: check-in, knowledge compounding, workflow integration, sustainable practice.",
    "acceptanceCriteria": [
      "File exists at public/decks/{slug}/session-3-golive.html",
      "8-12 slides: Check-in, Knowledge Compounding, Workflow Integration, Sustainable Practice, Close",
      "Language rules enforced",
      "Speaker notes on every slide"
    ],
    "labels": ["content", "deck"],
    "dependsOn": ["US-004"]
  },
  { "id": "US-006", "title": "Build, verify, and deploy to Vercel", ..., "dependsOn": ["US-001", "US-002", "US-003", "US-004", "US-005"] }
]
```

Also write `projects/{slug}-bootcamp/readme.md`:

```markdown
# {slug}-bootcamp

**Goal:** Personalized AGI bootcamp for {fullName} ({company}) — {audienceType} audience.

**Portal:** bootcamp.{your-username}.com/client/{slug}
**Intake:** bootcamp.{your-username}.com/intake/{clientId}
**Deck format:** {condensed|3-session}

**Status:** Intake pending
```

## Step 5: Add Portal Config to page.tsx

Read `{PORTAL_PAGE}` and find the closing `}` of the `clients` object (the line before `'aiden-campbell'` or the last entry). Insert the new client config.

### Config for Condensed Deck

```typescript
  '{slug}': {
    name: '{fullName}',
    company: '{company}',
    password: '{password}',
    deckPath: '/decks/{slug}',
    kickoffDeck: '{slug}-bootcamp.html',
    kickoffLabel: 'Your Bootcamp Deck',
    kickoffDesc: 'Your complete personalized AGI bootcamp — everything we\'ll cover together in one deck.',
    resources: [AUDIENCE_RESOURCES],
    preWork: [AUDIENCE_PREWORK],
    sessions: [],
  },
```

### Config for 3 Sessions

```typescript
  '{slug}': {
    name: '{fullName}',
    company: '{company}',
    password: '{password}',
    deckPath: '/decks/{slug}',
    kickoffDeck: '{slug}-kickoff.html',
    resources: [AUDIENCE_RESOURCES],
    preWork: [AUDIENCE_PREWORK],
    sessions: [
      {
        num: '01',
        title: '{Session 1 Title}',
        type: 'intensive',
        desc: '{Session 1 description adapted to audience}',
        deckFile: 'session-1-foundation.html',
        status: 'upcoming',
      },
      {
        num: '02',
        title: '{Session 2 Title}',
        type: 'intensive',
        desc: '{Session 2 description adapted to audience}',
        deckFile: 'session-2-method.html',
        status: 'upcoming',
      },
      {
        num: '03',
        title: '{Session 3 Title}',
        type: 'support',
        desc: '{Session 3 description adapted to audience}',
        deckFile: 'session-3-golive.html',
        status: 'upcoming',
      },
    ],
  },
```

### Audience-Specific Resources & Pre-Work

**Resources** — always include Claude Desktop. Then adapt to audience:
- Non-tech exec: industry-specific tools (CRM, support inbox, etc.)
- Technical: GitHub, Vercel, VS Code
- Creative: Canva, Instagram Creator Studio, portfolio platform
- Generalist: Google Docs, LinkedIn, relevant tools

**Pre-work** — always include: (1) Download Claude Desktop, (2) Create HQ folder, (3) Write 3 pain points, (4) Gather materials. Adapt language per audience type.

## Step 6: Create Deck Skeleton(s)

```bash
mkdir -p {DECKS_DIR}/{slug}
```

Write HTML skeleton file(s) with the proven deck pattern:
- Full `<style>` block (dark theme, Playfair Display + Inter fonts, slide transitions, layouts)
- Full `<script>` block (arrow-key navigation, dot indicators, speaker notes toggle)
- Placeholder slides with section headers and `data-notes="[Speaker notes TBD]"`
- Section structure matching the PRD acceptance criteria

**For condensed deck:** 1 file `{slug}-bootcamp.html` with ~25 placeholder slides
**For 3 sessions:** 4 files: `{slug}-kickoff.html`, `session-1-foundation.html`, `session-2-method.html`, `session-3-golive.html`

Use the actual CSS/JS from an existing deck (e.g. `nick-harazim-bootcamp.html`) as the template — copy the exact styles and navigation code. Only placeholder the slide content.

## Step 7: Verify & Report

1. Run `npm run build` in `{REPO}` to verify no breakage
2. Run `qmd update 2>/dev/null || true`

Print summary:

```
Student onboarded: {fullName}

Portal:  bootcamp.{your-username}.com/client/{slug} (pw: {password})
Intake:  bootcamp.{your-username}.com/intake/{clientId}
Email:   Draft created — review and send in Gmail
PRD:     projects/{slug}-bootcamp/prd.json ({N} stories)
Deck(s): {DECKS_DIR}/{slug}/ (skeleton — content via /run-project)

Next steps:
1. Review and send the email draft in Gmail
2. Wait for {firstName} to complete intake survey
3. Check intake: bootcamp.{your-username}.com/admin/clients/{clientId}
4. Run: /run-project {slug}-bootcamp
```

## Rules

- **NEVER use `reply_email`** — always `draft_email`. Learned rule: reply sends immediately.
- **NEVER proceed without client ID** — if API call fails, stop.
- **NEVER skip the email draft review** — always wait for user confirmation.
- **Slug derivation:** Always `first-last` format, lowercase, hyphenated. If name has middle name or suffix, ask user to confirm slug.
- **Password:** Slug without hyphens. If slug is ambiguous (e.g. `van-campen` → `vancampen`), confirm with user.
- **Deck skeletons are placeholders** — real content is written by `/run-project` via worker pipeline. Don't try to write final content here.
- **Language rules are strict** — the PRD's `neverUse` list is enforced during content generation. Get the audience type right.
- **Existing portals must not break** — always run `npm run build` to verify.
- **NEVER use special characters in email subject lines** — em dashes, curly quotes, Unicode punctuation encode incorrectly (e.g. `â€"` instead of `—`). Plain ASCII only: hyphens not dashes, straight quotes.
