# PRD Schema

Canonical schema for `projects/{name}/prd.json` files consumed by `/run-project` and `/execute-task`.

## Schema

```json
{
  "name": "string (project slug, lowercase-hyphens)",
  "description": "string (1-sentence goal)",
  "branchName": "string (e.g. feature/{name})",
  "userStories": [
    {
      "id": "string (US-NNN format)",
      "title": "string",
      "description": "string (As a [user], I want [feature] so that [benefit])",
      "acceptanceCriteria": ["string (specific verifiable criterion)"],
      "e2eTests": [
        {
          "scenario": "string (test scenario name)",
          "userJourney": "string (step-by-step user journey description)",
          "criticalPath": "boolean (true if this tests a critical user path)"
        }
      ],
      "priority": "number (1 = highest)",
      "passes": "boolean (starts false, set true by /run-project)",
      "labels": ["string"],
      "dependsOn": ["string (US-NNN references)"],
      "notes": "string"
    }
  ],
  "metadata": {
    "createdAt": "string (ISO8601)",
    "goal": "string (overall project goal)",
    "successCriteria": "string (measurable outcome)",
    "qualityGates": ["string (shell commands)"],
    "repoPath": "string (repos/private/repo-name or empty)",
    "relatedWorkers": ["string (worker-ids)"],
    "knowledge": ["string (knowledge paths)"]
  }
}
```

## Field Reference

### User Story Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | yes | Unique story ID in `US-NNN` format |
| `title` | string | yes | Short descriptive title |
| `description` | string | yes | User story format: "As a [user], I want [feature] so that [benefit]" |
| `acceptanceCriteria` | string[] | yes | Specific, verifiable criteria (min 1) |
| `e2eTests` | object[] | yes | End-to-end test definitions for this story (min 1) |
| `priority` | number | yes | Execution priority (1 = highest) |
| `passes` | boolean | yes | Whether the story passes all checks. Always starts `false` |
| `labels` | string[] | no | Categorization tags |
| `dependsOn` | string[] | no | IDs of stories that must complete first |
| `notes` | string | no | Additional context or implementation hints |

### e2eTests Field

Each user story **must** include at least one e2eTests entry. The `e2eTests` array defines end-to-end test scenarios that validate the story's acceptance criteria from a user perspective.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `scenario` | string | yes | Descriptive name for the test scenario (e.g. "User signs up with email") |
| `userJourney` | string | yes | Step-by-step description of the user journey being tested (e.g. "Navigate to /signup -> Fill form -> Submit -> Verify redirect to dashboard") |
| `criticalPath` | boolean | yes | `true` if this scenario tests a critical user path that must never break; `false` for secondary/edge-case flows |

**Guidelines for e2eTests:**
- Every acceptance criterion should be covered by at least one e2eTests scenario
- Critical paths (`criticalPath: true`) should cover the primary happy-path user journey
- Include at least one critical path test per story
- Scenarios should be written from the end-user perspective, not internal implementation
- User journeys should describe observable steps, not code-level actions

### e2eTests Example

```json
{
  "id": "US-003",
  "title": "User login with OAuth",
  "description": "As a user, I want to log in with Google OAuth so that I don't need a separate password",
  "acceptanceCriteria": [
    "Google OAuth button visible on login page",
    "Clicking button redirects to Google consent screen",
    "Successful auth redirects to dashboard with user session",
    "Failed auth shows error message"
  ],
  "e2eTests": [
    {
      "scenario": "Successful Google OAuth login",
      "userJourney": "Navigate to /login -> Click 'Sign in with Google' -> Complete Google OAuth flow -> Verify redirect to /dashboard -> Verify user name displayed in header",
      "criticalPath": true
    },
    {
      "scenario": "OAuth login failure handling",
      "userJourney": "Navigate to /login -> Click 'Sign in with Google' -> Deny permissions in Google consent -> Verify redirect back to /login -> Verify error message displayed",
      "criticalPath": false
    }
  ],
  "priority": 1,
  "passes": false,
  "labels": ["auth"],
  "dependsOn": ["US-001"],
  "notes": "Requires Google OAuth client ID in environment"
}
```

### Metadata Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `createdAt` | string | yes | ISO8601 timestamp of PRD creation |
| `goal` | string | yes | Overall project goal |
| `successCriteria` | string | yes | Measurable outcome for project success |
| `qualityGates` | string[] | yes | Shell commands that must pass (e.g. `pnpm typecheck && pnpm lint`) |
| `repoPath` | string | no | Path to the target repo (e.g. `repos/private/my-app`) |
| `relatedWorkers` | string[] | no | Worker IDs relevant to this project |
| `knowledge` | string[] | no | Paths to relevant knowledge files |

## Invariants

1. Every story starts with `passes: false`
2. Story IDs are sequential: `US-001`, `US-002`, ...
3. `dependsOn` references must point to valid story IDs within the same PRD
4. Priority 1 is highest; stories with lower priority numbers execute first
5. `prd.json` is the source of truth; `README.md` is always derived from it
6. Every story must have at least one entry in `e2eTests`
7. Every story must have at least one `e2eTests` entry with `criticalPath: true`

## Validation

Run `.claude/scripts/validate-prd.ps1` to check a PRD against this schema:

```powershell
.claude/scripts/validate-prd.ps1 -PrdPath projects/my-project/prd.json
```

The script validates:
- All required fields are present
- `e2eTests` array exists and is non-empty for every user story
- Each e2eTests entry has `scenario`, `userJourney`, and `criticalPath` fields
- At least one `criticalPath: true` entry per story
- Story ID format matches `US-NNN`
- `dependsOn` references are valid

## See Also

- `.claude/commands/prd.md` - PRD generation command (prompts for e2eTests in Batch 4)
- `knowledge/testing/e2e-cloud.md` - E2E cloud testing knowledge base
- `knowledge/testing/templates/` - Reusable E2E test templates
