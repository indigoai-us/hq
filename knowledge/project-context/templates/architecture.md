---
last_updated: YYYY-MM-DD
last_verified: YYYY-MM-DD
verified_by: worker-name
---

# {Project Name} Architecture

## Stack

Technologies, frameworks, and tools used in this project.

| Layer | Technology | Purpose |
|-------|------------|---------|
| Language | e.g., TypeScript | Primary language |
| Framework | e.g., Next.js | Web framework |
| Database | e.g., PostgreSQL | Data persistence |
| Hosting | e.g., Vercel | Deployment platform |

## Structure

Directory layout and organization.

```
{project}/
├── src/           # Source code
│   ├── components/  # UI components
│   ├── lib/         # Shared utilities
│   └── pages/       # Routes/pages
├── tests/         # Test files
└── docs/          # Documentation
```

<!--
Describe the key directories and what belongs in each.
Note any conventions (e.g., "one component per file", "tests colocated with source").
-->

## Patterns

Key architectural patterns used in this project.

### Pattern 1: {Name}

**What:** Brief description of the pattern.

**Where:** Where it's used in the codebase.

**Why:** Why this pattern was chosen.

<!--
Common patterns to document:
- Component composition
- State management approach
- API design (REST, GraphQL, etc.)
- Error handling strategy
- Logging/observability approach
-->

## Dependencies

External services, APIs, and libraries the project depends on.

### External Services

| Service | Purpose | Credentials |
|---------|---------|-------------|
| Service 1 | What it does | Where creds are stored |

### Key Libraries

| Library | Version | Purpose |
|---------|---------|---------|
| library-name | ^1.0.0 | What it's used for |

<!-- Note any libraries that are critical to understand before making changes -->

## Data Flow

How data moves through the system.

```
[User] -> [Frontend] -> [API] -> [Database]
              |
              v
         [External Service]
```

<!--
Use ASCII diagrams or describe the flow in prose.
Focus on the most common/important flows.
-->

## Configuration

Key configuration files and environment variables.

| Variable | Purpose | Required |
|----------|---------|----------|
| `DATABASE_URL` | Database connection | Yes |
| `API_KEY` | External API access | Yes |

<!-- Document where config lives (e.g., .env, config files) and how to set it up -->
