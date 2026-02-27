# PRD Schema

Product Requirements Documents (PRDs) in GHQ are JSON files that define projects and their user stories. This schema ensures consistency across all projects and enables automated validation, execution by Ralph, and tracking.

## Location

`projects/{project-name}/prd.json`

## Schema Version

Current version: **2** (added `e2eTests` field requirement, `archive` and `worktree` fields)

## Full Schema

```json
{
  "name": "string",
  "description": "string",
  "branchName": "string",
  "worktree": "boolean",
  "userStories": [
    {
      "id": "string",
      "title": "string",
      "description": "string",
      "acceptanceCriteria": ["string"],
      "e2eTests": ["string"],
      "priority": "number",
      "passes": "boolean",
      "archive": "boolean",
      "labels": ["string"],
      "dependsOn": ["string"],
      "notes": "string"
    }
  ],
  "metadata": {
    "createdAt": "string (ISO8601)",
    "baseBranch": "string",
    "goal": "string",
    "successCriteria": "string",
    "qualityGates": ["string"],
    "repoPath": "string",
    "relatedSkills": ["string"],
    "knowledge": ["string"],
    "relatedProjects": ["string"]
  }
}
```

## Field Definitions

### Root Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Project slug (lowercase, hyphens only) |
| `description` | string | Yes | One-sentence project goal |
| `branchName` | string | Yes | Git branch for this project (e.g., `feature/my-project`) |
| `worktree` | boolean | No | If `true`, `/run-project` uses a git worktree for isolation. Default: `false` |
| `userStories` | array | Yes | List of user stories to implement |
| `metadata` | object | Yes | Project metadata and configuration |

### User Story Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Unique identifier (format: `US-XXX`) |
| `title` | string | Yes | Short descriptive title |
| `description` | string | Yes | Full description (prefer "As a [user], I want [feature] so that [benefit]" format) |
| `acceptanceCriteria` | string[] | Yes | List of verifiable criteria for completion |
| `e2eTests` | string[] | **Yes** | List of E2E tests that must pass (see E2E Tests section) |
| `priority` | number | Yes | Execution priority (1 = highest) |
| `passes` | boolean | Yes | Whether story is complete (always starts as `false`) |
| `archive` | boolean | No | If `true`, story is excluded from execution but preserved in the PRD for history |
| `labels` | string[] | No | Categorization tags |
| `dependsOn` | string[] | No | IDs of stories that must complete first |
| `notes` | string | No | Implementation notes (filled by executor) |

### Metadata Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `createdAt` | string | Yes | ISO8601 timestamp of PRD creation |
| `baseBranch` | string | Yes | Branch to create feature branch from (`main`, `staging`, etc.) |
| `goal` | string | Yes | Overall project goal |
| `successCriteria` | string | Yes | Measurable outcome that defines project success |
| `qualityGates` | string[] | No | Commands to run before marking tasks complete |
| `repoPath` | string | No | Path to target repository |
| `relatedSkills` | string[] | No | Skill IDs relevant to this project (e.g., `architect`, `backend`) |
| `knowledge` | string[] | No | Knowledge paths relevant to this project |
| `relatedProjects` | string[] | No | Other related project names |

## E2E Tests Field (REQUIRED)

**Every user story MUST include an `e2eTests` array.** This field specifies the end-to-end tests that must pass before a story can be marked as complete.

### E2E Test Format

E2E tests should be actionable descriptions that map to actual test implementations:

```json
"e2eTests": [
  "Page loads without errors and displays welcome message",
  "User can submit form and see confirmation",
  "API returns 200 with expected response format"
]
```

### E2E Test Categories

**For Web/UI Stories:**
- "Page loads and renders expected content"
- "User can complete [action] successfully"
- "Form validation shows errors for invalid input"
- "Navigation between [pageA] and [pageB] works"

**For API Stories:**
- "GET /endpoint returns 200 with expected schema"
- "POST /endpoint creates resource and returns 201"
- "Error cases return appropriate status codes (401, 404, 500)"

**For CLI Stories:**
- "CLI runs without errors and exits with code 0"
- "CLI opens URL in browser that renders correctly"
- "Full flow: CLI -> browser -> callback -> success"

**For Integration Stories:**
- "Complete user flow from [start] to [end] works"
- "Components A, B, and C work together correctly"

### Minimum E2E Tests Per Story

- Simple stories: At least 1 E2E test
- Complex stories: At least 2-3 E2E tests covering happy path and error cases
- Integration stories: At least 3-5 E2E tests covering full flow

### Empty e2eTests is INVALID

```json
// INVALID - will fail validation
"e2eTests": []

// VALID
"e2eTests": ["Basic page renders without errors"]
```

## Archive Workflow

The `archive` field on a story allows it to be excluded from future execution runs without deleting it from the PRD. This is the preferred way to retire superseded stories.

```json
{
  "id": "US-003",
  "title": "Old registration approach",
  "archive": true,
  ...
}
```

When `/run-project` iterates stories, it skips any story where `archive: true`. The story remains in the file for historical reference. Unlike deletion, archiving preserves context about decisions made and work done.

**When to archive vs. delete:**
- Archive: story was valid but superseded, scope changed, or approach abandoned
- Delete: story was added by mistake or is a duplicate

## Worktree Field

The `worktree` boolean controls whether `/run-project` creates an isolated git worktree for project execution.

```json
{
  "name": "risky-migration",
  "worktree": true,
  ...
}
```

When `worktree: true`, `/run-project` calls `git worktree add` before execution and removes it after. This isolates the project from the main working tree, preventing interference with other ongoing work.

**Use `worktree: true` when:**
- Project makes large-scale changes
- Multiple projects are running in parallel
- Changes are experimental and may need to be discarded

## Validation

PRDs are validated by `/cleanup --validate-prds`:

```bash
# Validate all PRDs
/cleanup --validate-prds

# Validate specific project
/cleanup --validate-prds my-project
```

### Validation Checks

1. **JSON syntax** — File is valid JSON
2. **Required fields** — All required fields present
3. **e2eTests presence** — Every non-archived user story has non-empty `e2eTests`
4. **ID format** — Story IDs match `US-XXX` pattern
5. **Branch format** — `branchName` starts with `feature/`
6. **Dependencies exist** — All `dependsOn` IDs reference existing stories

## Example PRD

```json
{
  "name": "user-authentication",
  "description": "Add user login and registration to the application",
  "branchName": "feature/user-authentication",
  "worktree": false,
  "userStories": [
    {
      "id": "US-001",
      "title": "User registration form",
      "description": "As a visitor, I want to create an account so that I can access authenticated features",
      "acceptanceCriteria": [
        "Registration form with email, password, confirm password fields",
        "Validation for email format and password strength",
        "Success message after registration",
        "User redirected to login page"
      ],
      "e2eTests": [
        "Registration page loads and form is visible",
        "Valid registration creates user and shows success message",
        "Invalid email shows validation error",
        "Mismatched passwords show error",
        "Duplicate email shows appropriate error"
      ],
      "priority": 1,
      "passes": false,
      "archive": false,
      "labels": ["auth", "ui"],
      "dependsOn": [],
      "notes": ""
    },
    {
      "id": "US-002",
      "title": "User login",
      "description": "As a registered user, I want to log in so that I can access my account",
      "acceptanceCriteria": [
        "Login form with email and password fields",
        "Successful login redirects to dashboard",
        "Invalid credentials show error message",
        "Session persists across page refreshes"
      ],
      "e2eTests": [
        "Login page loads and form is visible",
        "Valid credentials redirect to dashboard",
        "Invalid credentials show error and stay on login page",
        "Session cookie is set after successful login"
      ],
      "priority": 1,
      "passes": false,
      "archive": false,
      "labels": ["auth", "ui"],
      "dependsOn": ["US-001"],
      "notes": ""
    }
  ],
  "metadata": {
    "createdAt": "2026-02-01T12:00:00Z",
    "baseBranch": "main",
    "goal": "Enable users to create accounts and authenticate",
    "successCriteria": "Users can register, login, and maintain authenticated sessions",
    "qualityGates": ["npm run typecheck", "npm run lint", "npm test"],
    "repoPath": "repos/my-app",
    "relatedSkills": ["architect", "backend", "frontend"],
    "knowledge": ["knowledge/ghq-core/"],
    "relatedProjects": []
  }
}
```

## Migration from v1

PRDs without `e2eTests` are v1 format. To migrate:

1. Run validation to identify stories missing `e2eTests`
2. For each story, add appropriate `e2eTests` based on `acceptanceCriteria`
3. Re-run validation to confirm compliance

## See Also

- [/prd command](../../.claude/commands/prd.md) — Creates PRDs
- [/run-project command](../../.claude/commands/run-project.md) — Executes PRDs
- [Skill Schema](skill-schema.md) — Available skills for `relatedSkills`
- [Quick Reference](quick-reference.md) — Commands overview
